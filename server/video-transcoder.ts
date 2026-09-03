import { execFile, spawn } from 'child_process';
import { createRequire } from 'module';
import { promisify } from 'util';
import { Readable, Transform, pipeline as pipelineCallback } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const pipeline = promisify(pipelineCallback);

const execFileAsync = promisify(execFile);

/**
 * The server runs both as ESM (tsx, Vercel functions) and as an esbuild CJS bundle
 * (dist/index.cjs), where `import.meta` is empty. Try every base that could be valid.
 */
function createModuleRequire(): NodeRequire | null {
  const bases = [
    typeof __filename === 'string' ? __filename : undefined,
    typeof import.meta?.url === 'string' ? import.meta.url : undefined,
    path.join(process.cwd(), 'index.js'),
  ];

  for (const base of bases) {
    if (!base) continue;
    try {
      return createRequire(base);
    } catch {
      // Try the next base.
    }
  }
  return null;
}

const require_ = createModuleRequire();

/**
 * Vercel's serverless runtime has no ffmpeg on PATH, so the binaries ship with the function
 * via @ffmpeg-installer / @ffprobe-installer (platform-specific, ~50MB total).
 * Order: explicit env override -> bundled static binary -> whatever is on PATH.
 */
function resolveBinary(envVar: string, installerPackage: string, fallback: string): string {
  const override = process.env[envVar]?.trim();
  if (override) {
    console.log(`[VideoTranscoder] Using ${fallback} from ${envVar}: ${override}`);
    return override;
  }

  try {
    const resolved = require_?.(installerPackage)?.path;
    if (typeof resolved === 'string' && resolved.length > 0 && fs.existsSync(resolved)) {
      console.log(`[VideoTranscoder] Using bundled ${fallback}: ${resolved}`);
      return resolved;
    }
  } catch {
    // Package missing or unusable on this platform - fall through to PATH.
  }

  // On Vercel nothing is on PATH, so this almost certainly fails at call time. Say so now.
  console.warn(
    `[VideoTranscoder] ${installerPackage} did not resolve on ${process.platform}/${process.arch}; ` +
    `falling back to "${fallback}" from PATH. Set ${envVar} if the host provides its own binary.`,
  );
  return fallback;
}

let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;

export function getFfmpegPath(): string {
  cachedFfmpegPath ??= resolveBinary('FFMPEG_PATH', '@ffmpeg-installer/ffmpeg', 'ffmpeg');
  return cachedFfmpegPath;
}

export function getFfprobePath(): string {
  cachedFfprobePath ??= resolveBinary('FFPROBE_PATH', '@ffprobe-installer/ffprobe', 'ffprobe');
  return cachedFfprobePath;
}

export interface VideoAnalysis {
  filename: string;
  size: number;
  container: string;
  duration: number;
  /** true = moov atom before mdat (streamable). null = could not determine (non-MP4 container). */
  faststart: boolean | null;
  bitRate: number;
  video: {
    codec: string;
    profile: string | null;
    level: number | null;
    pixFmt: string;
    avgFrameRate: string;
    rFrameRate: string;
    width: number;
    height: number;
  } | null;
  audio: {
    codec: string;
    sampleRate: number;
    channels: number;
  } | null;
}

export interface TranscodeResult {
  ok: boolean;
  usedPath: string;
  transcoded: boolean;
  /** true when the fix was a lossless container remux (no re-encode). */
  remuxed: boolean;
  reasons: string[];
  logs: {
    input: VideoAnalysis;
    output?: VideoAnalysis;
    ffmpegStderr?: string;
    error?: string;
    transcodeTimeSeconds?: number;
    totalTimeSeconds?: number;
  };
}

export interface MetaVideoPreparationDecision {
  ok: boolean;
  shouldTranscode: boolean;
  /** All detected problems are fixable by `-c copy` (container remux), no re-encode needed. */
  remuxOnly: boolean;
  reasons: string[];
  input: VideoAnalysis;
  usedFallback: boolean;
  error?: string;
}

const PROBLEMATIC_FILENAME_PATTERNS = [
  'auto_cropped',
  'edited',
  'render',
  'archive',
  'export',
  'final',
  'draft',
  'copy',
];

function readPositiveNumberEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

// Meta's ingestion pipeline rejects (code 351 / subcode 1363027 "Corrupt Video") files that
// decode perfectly in every player but exceed what its transcoder will accept. These are the
// guards that keep an otherwise valid export from being rejected.
const META_LIMITS = {
  // Meta delivers at 1080p; anything larger is downscaled by Meta anyway. Very large frames
  // (e.g. 2880x2880) are a common cause of "Corrupt Video".
  maxLongSide: readPositiveNumberEnv('META_VIDEO_MAX_LONG_SIDE', 1920),
  // Bits per second. High-bitrate masters routinely fail Meta's validator.
  maxBitRate: readPositiveNumberEnv('META_VIDEO_MAX_BITRATE', 16_000_000),
  // H.264 level as reported by ffprobe (51 = 5.1). Above 5.1 Meta's decoder can bail out.
  maxLevel: readPositiveNumberEnv('META_VIDEO_MAX_H264_LEVEL', 51),
};

// Reasons that a lossless `-c copy` remux fully resolves (container-level only).
const REMUXABLE_REASONS = new Set(['moov_atom_at_end', 'mov_container']);

interface Mp4BoxLayout {
  boxes: string[];
  faststart: boolean | null;
}

/**
 * Reads the top-level MP4/MOV box order without loading the file.
 * Meta fetches videos over HTTP by URL; when `moov` sits after `mdat` it cannot read the
 * header from the first bytes and reports the file as unreadable/corrupt.
 */
async function readMp4BoxLayout(inputPath: string): Promise<Mp4BoxLayout> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    const stats = await fs.promises.stat(inputPath);
    handle = await fs.promises.open(inputPath, 'r');

    const boxes: string[] = [];
    let offset = 0;

    while (offset < stats.size && boxes.length < 64) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await handle.read(header, 0, 16, offset);
      if (bytesRead < 8) break;

      let size = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      if (!/^[\x20-\x7e]{4}$/.test(type)) break;

      if (size === 1) {
        if (bytesRead < 16) break;
        size = Number(header.readBigUInt64BE(8));
      } else if (size === 0) {
        size = stats.size - offset;
      }
      if (size < 8) break;

      boxes.push(type);
      offset += size;
    }

    if (!boxes.includes('ftyp') || !boxes.includes('moov') || !boxes.includes('mdat')) {
      return { boxes, faststart: null };
    }

    return { boxes, faststart: boxes.indexOf('moov') < boxes.indexOf('mdat') };
  } catch {
    return { boxes: [], faststart: null };
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function analyzeVideo(inputPath: string): Promise<VideoAnalysis> {
  const stats = await fs.promises.stat(inputPath);
  const filename = path.basename(inputPath);
  const container = path.extname(inputPath).toLowerCase();

  let ffprobeOutput: string;
  try {
    const { stdout } = await execFileAsync(getFfprobePath(), [
      '-hide_banner',
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      inputPath,
    ], { maxBuffer: 16 * 1024 * 1024 });
    ffprobeOutput = stdout;
  } catch (error: any) {
    throw new Error(`ffprobe failed: ${error.message}`);
  }

  let probeData: any;
  try {
    probeData = JSON.parse(ffprobeOutput);
  } catch {
    throw new Error('Failed to parse ffprobe JSON output');
  }

  const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
  const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');
  const format = probeData.format || {};

  const duration = parseFloat(format.duration) || 0;
  const isMp4Family = container === '.mp4' || container === '.mov' || container === '.m4v';
  const { faststart } = isMp4Family
    ? await readMp4BoxLayout(inputPath)
    : { faststart: null };

  const bitRate =
    parseInt(format.bit_rate) ||
    (duration > 0 ? Math.round((stats.size * 8) / duration) : 0);

  return {
    filename,
    size: stats.size,
    container,
    duration,
    faststart,
    bitRate,
    video: videoStream ? {
      codec: videoStream.codec_name || 'unknown',
      profile: videoStream.profile || null,
      level: typeof videoStream.level === 'number' ? videoStream.level : null,
      pixFmt: videoStream.pix_fmt || 'unknown',
      avgFrameRate: videoStream.avg_frame_rate || '0/1',
      rFrameRate: videoStream.r_frame_rate || '0/1',
      width: videoStream.width || 0,
      height: videoStream.height || 0,
    } : null,
    audio: audioStream ? {
      codec: audioStream.codec_name || 'unknown',
      sampleRate: parseInt(audioStream.sample_rate) || 0,
      channels: audioStream.channels || 0,
    } : null,
  };
}

export function needsTranscode(
  analysis: VideoAnalysis,
  originalFilename: string,
): { needed: boolean; reasons: string[]; remuxOnly: boolean } {
  const reasons: string[] = [];

  if (!analysis.video) {
    return { needed: false, reasons: ['no_video_stream'], remuxOnly: false };
  }

  // Only transcode for critical incompatibilities that Meta actually rejects
  if (analysis.video.codec !== 'h264') {
    reasons.push(`codec!=${analysis.video.codec}->h264`);
  }

  // Meta accepts yuv420p and yuvj420p - only transcode truly incompatible formats
  if (analysis.video.pixFmt !== 'yuv420p' && analysis.video.pixFmt !== 'yuvj420p') {
    reasons.push(`pix_fmt!=${analysis.video.pixFmt}->yuv420p`);
  }

  // Only flag VFR if codec already needs transcoding (VFR alone is usually fine on Meta)
  const avgParts = analysis.video.avgFrameRate.split('/');
  const rParts = analysis.video.rFrameRate.split('/');
  const avgFps = avgParts.length === 2 ? parseFloat(avgParts[0]) / parseFloat(avgParts[1]) : parseFloat(avgParts[0]);
  const rFps = rParts.length === 2 ? parseFloat(rParts[0]) / parseFloat(rParts[1]) : parseFloat(rParts[0]);
  
  if (Math.abs(avgFps - rFps) > 2.0) {
    reasons.push('vfr_detected');
  }

  // Meta fetches the video over HTTP by URL. With moov after mdat it cannot read the header
  // up front and rejects the file as unreadable/corrupt (code 351 / subcode 1363027), even
  // though the file plays fine locally. A `-c copy` remux fixes this in under a second.
  if (analysis.faststart === false) {
    reasons.push('moov_atom_at_end');
  }

  // Frames far above Meta's 1080p delivery ceiling are a known "Corrupt Video" trigger.
  const longSide = Math.max(analysis.video.width, analysis.video.height);
  if (longSide > META_LIMITS.maxLongSide) {
    reasons.push(`resolution_too_large=${analysis.video.width}x${analysis.video.height}`);
  }

  if (analysis.bitRate > META_LIMITS.maxBitRate) {
    reasons.push(`bitrate_too_high=${Math.round(analysis.bitRate / 1000)}kbps`);
  }

  if (analysis.video.level !== null && analysis.video.level > META_LIMITS.maxLevel) {
    reasons.push(`h264_level_too_high=${analysis.video.level}`);
  }

  // Only transcode .mov if codec is NOT h264 (most .mov with h264 work fine on Meta)
  if (analysis.container === '.mov' && analysis.video.codec !== 'h264') {
    reasons.push('mov_non_h264');
  }

  if (analysis.audio) {
    if (analysis.audio.codec !== 'aac' && analysis.audio.codec !== 'mp3') {
      reasons.push(`audio_codec!=${analysis.audio.codec}->aac`);
    }
  } else {
    reasons.push('no_audio_stream');
  }

  const remuxOnly = reasons.length > 0 && reasons.every((reason) => REMUXABLE_REASONS.has(reason));

  return { needed: reasons.length > 0, reasons, remuxOnly };
}

function buildUnknownInputAnalysis(inputPath: string, originalFilename: string): VideoAnalysis {
  return {
    filename: originalFilename,
    size: 0,
    container: path.extname(inputPath),
    duration: 0,
    faststart: null,
    bitRate: 0,
    video: null,
    audio: null,
  };
}

function isMissingBinaryError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('command not found') ||
    normalized.includes('enoent') ||
    normalized.includes('spawn ffprobe') ||
    normalized.includes('not executable') ||
    normalized.includes('eacces')
  );
}

export async function decideMetaVideoPreparation(
  inputPath: string,
  originalFilename: string,
  minDuration: number = 1.0,
  options: { force?: boolean } = {}
): Promise<MetaVideoPreparationDecision> {
  let inputAnalysis: VideoAnalysis;

  try {
    inputAnalysis = await analyzeVideo(inputPath);
    console.log('[VideoTranscoder] Input analysis:', JSON.stringify(inputAnalysis, null, 2));
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to analyze video';
    const isFfprobeUnavailable = errorMessage.includes('ffprobe failed') && isMissingBinaryError(errorMessage);

    if (isFfprobeUnavailable) {
      // The binaries ship with the deployment, so this means the bundle is broken. Uploading
      // the untouched file is the only remaining option, but it is exactly the path that
      // produces Meta's "Corrupt Video" rejection, so make the cause obvious in the logs.
      console.error(
        `[VideoTranscoder] ffprobe is unavailable at "${getFfprobePath()}" - falling back to direct upload WITHOUT Meta compatibility fixes. ` +
        `Check that @ffprobe-installer/ffprobe is bundled with the deployment or set FFPROBE_PATH. Underlying error: ${errorMessage}`,
      );
      return {
        ok: true,
        shouldTranscode: false,
        remuxOnly: false,
        reasons: ['ffprobe_unavailable'],
        input: buildUnknownInputAnalysis(inputPath, originalFilename),
        usedFallback: true,
        error: errorMessage,
      };
    }

    return {
      ok: false,
      shouldTranscode: false,
      remuxOnly: false,
      reasons: ['ffprobe_failed'],
      input: buildUnknownInputAnalysis(inputPath, originalFilename),
      usedFallback: false,
      error: errorMessage,
    };
  }

  if (!inputAnalysis.video) {
    return {
      ok: false,
      shouldTranscode: false,
      remuxOnly: false,
      reasons: ['no_video_stream'],
      input: inputAnalysis,
      usedFallback: false,
      error: 'No video stream found - file may be corrupt or invalid',
    };
  }

  if (inputAnalysis.duration < minDuration) {
    return {
      ok: false,
      shouldTranscode: false,
      remuxOnly: false,
      reasons: ['duration_too_short'],
      input: inputAnalysis,
      usedFallback: false,
      error: `Duration ${inputAnalysis.duration}s is less than ${minDuration}s minimum`,
    };
  }

  const { needed, reasons, remuxOnly } = needsTranscode(inputAnalysis, originalFilename);
  console.log('[VideoTranscoder] Transcode check:', { needed, reasons, remuxOnly, force: options.force === true });

  // `force` is set when Meta already rejected this exact file as corrupt: re-encode it in
  // full even if every individual check passed, since the checks clearly missed something.
  if (options.force) {
    return {
      ok: true,
      shouldTranscode: true,
      remuxOnly: false,
      reasons: reasons.length > 0 ? [...reasons, 'forced_after_meta_rejection'] : ['forced_after_meta_rejection'],
      input: inputAnalysis,
      usedFallback: false,
    };
  }

  return {
    ok: true,
    shouldTranscode: needed,
    remuxOnly,
    reasons,
    input: inputAnalysis,
    usedFallback: false,
  };
}

async function runFfmpeg(args: string[]): Promise<{ success: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const ffmpeg = spawn(getFfmpegPath(), args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      resolve({
        success: code === 0,
        stderr: stderr.slice(-5000),
      });
    });

    ffmpeg.on('error', (err) => {
      resolve({
        success: false,
        stderr: `Spawn error: ${err.message}\n${stderr}`,
      });
    });
  });
}

export interface TranscodeOptions {
  /** Lossless container rewrite only (`-c copy`), used when just the moov atom is misplaced. */
  remuxOnly?: boolean;
  /** Downscale so neither side exceeds this many pixels. */
  maxLongSide?: number;
}

export async function transcodeForMeta(
  inputPath: string,
  hasAudio: boolean,
  options: TranscodeOptions = {}
): Promise<{ outputPath: string; ffmpegStderr: string; remuxed: boolean }> {
  const hash = crypto.createHash('md5').update(inputPath + Date.now()).digest('hex').slice(0, 12);
  const outputPath = `/tmp/meta_safe_${hash}.mp4`;

  // Fast path: the streams are already Meta-compatible, only the container needs rewriting.
  // On a 146MB file this takes well under a second instead of minutes, and is lossless.
  if (options.remuxOnly) {
    const remuxArgs = [
      '-y', '-i', inputPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ];
    console.log('[VideoTranscoder] Running ffmpeg (remux only):', remuxArgs.join(' '));
    const remux = await runFfmpeg(remuxArgs);
    if (remux.success) {
      return { outputPath, ffmpegStderr: remux.stderr, remuxed: true };
    }
    console.warn('[VideoTranscoder] Remux failed, falling back to full re-encode:', remux.stderr.slice(-500));
    await fs.promises.unlink(outputPath).catch(() => {});
  }

  const maxLongSide = options.maxLongSide ?? META_LIMITS.maxLongSide;
  // Downscale only when oversized; keep aspect ratio and force even dimensions for yuv420p.
  const scaleFilter =
    `scale='if(gt(max(iw,ih),${maxLongSide}),if(gte(iw,ih),${maxLongSide},-2),iw)':` +
    `'if(gt(max(iw,ih),${maxLongSide}),if(gte(iw,ih),-2,${maxLongSide}),ih)'`;

  const videoArgs = [
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
    '-vf', scaleFilter,
    '-maxrate', String(Math.round(META_LIMITS.maxBitRate)), '-bufsize', String(Math.round(META_LIMITS.maxBitRate * 2)),
    '-r', '30', '-vsync', 'cfr', '-g', '60', '-keyint_min', '60',
  ];

  let args: string[];

  if (hasAudio) {
    args = [
      '-y', '-i', inputPath,
      ...videoArgs,
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart',
      outputPath,
    ];
  } else {
    args = [
      '-y', '-i', inputPath,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      ...videoArgs,
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-shortest', '-movflags', '+faststart',
      outputPath,
    ];
  }

  console.log('[VideoTranscoder] Running ffmpeg:', args.join(' '));
  const { success, stderr } = await runFfmpeg(args);

  if (!success) {
    throw new Error(`ffmpeg transcode failed:\n${stderr.slice(-2000)}`);
  }

  return { outputPath, ffmpegStderr: stderr, remuxed: false };
}

export async function validateTranscodedVideo(
  outputPath: string,
  minDuration: number = 1.0,
  options: { remuxed?: boolean } = {}
): Promise<void> {
  const analysis = await analyzeVideo(outputPath);

  if (!analysis.video) {
    throw new Error('Post-validation failed: no video stream in output');
  }

  if (analysis.video.codec !== 'h264') {
    throw new Error(`Post-validation failed: video codec is ${analysis.video.codec}, expected h264`);
  }

  // A remux copies the original streams verbatim, so only container-level guarantees apply.
  if (options.remuxed) {
    if (analysis.faststart !== true) {
      throw new Error('Post-validation failed: remuxed output still has moov atom after mdat');
    }
  } else {
    if (analysis.video.pixFmt !== 'yuv420p') {
      throw new Error(`Post-validation failed: pix_fmt is ${analysis.video.pixFmt}, expected yuv420p`);
    }

    if (!analysis.audio || analysis.audio.codec !== 'aac') {
      throw new Error(`Post-validation failed: audio codec is ${analysis.audio?.codec || 'missing'}, expected aac`);
    }

    if (analysis.faststart === false) {
      throw new Error('Post-validation failed: output has moov atom after mdat (faststart missing)');
    }

    const longSide = Math.max(analysis.video.width, analysis.video.height);
    if (longSide > META_LIMITS.maxLongSide) {
      throw new Error(
        `Post-validation failed: ${analysis.video.width}x${analysis.video.height} exceeds ${META_LIMITS.maxLongSide}px limit`,
      );
    }
  }

  if (analysis.duration < minDuration) {
    throw new Error(`Post-validation failed: duration ${analysis.duration}s < ${minDuration}s minimum`);
  }
}

export async function prepareVideoForMeta(
  inputPath: string,
  originalFilename: string,
  minDuration: number = 1.0,
  options: { force?: boolean } = {}
): Promise<TranscodeResult> {
  const startTime = Date.now();
  console.log('[VideoTranscoder] Preparing video for Meta:', { inputPath, originalFilename, force: options.force === true });

  const decision = await decideMetaVideoPreparation(inputPath, originalFilename, minDuration, options);
  if (!decision.ok) {
    return {
      ok: false,
      usedPath: inputPath,
      transcoded: false,
      remuxed: false,
      reasons: decision.reasons,
      logs: {
        input: decision.input,
        error: decision.error,
      },
    };
  }

  if (!decision.shouldTranscode) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    if (decision.usedFallback) {
      console.warn(`[VideoTranscoder] Direct upload fallback (transcode decision unavailable), completed in ${elapsed}s`);
    } else {
      console.log(`[VideoTranscoder] No transcode needed, completed in ${elapsed}s`);
    }
    return {
      ok: true,
      usedPath: inputPath,
      transcoded: false,
      remuxed: false,
      reasons: decision.reasons,
      logs: {
        input: decision.input,
        error: decision.usedFallback ? decision.error : undefined,
      },
    };
  }

  const inputAnalysis = decision.input;
  const reasons = decision.reasons;

  try {
    const hasAudio = inputAnalysis.audio !== null;
    const transcodeStart = Date.now();
    console.log(`[VideoTranscoder] Starting ffmpeg ${decision.remuxOnly ? 'remux' : 'transcode'}...`);

    const { outputPath, ffmpegStderr, remuxed } = await transcodeForMeta(inputPath, hasAudio, {
      remuxOnly: decision.remuxOnly,
    });

    const transcodeTime = ((Date.now() - transcodeStart) / 1000).toFixed(2);
    console.log(`[VideoTranscoder] FFmpeg ${remuxed ? 'remux' : 'transcode'} completed in ${transcodeTime}s`);

    await validateTranscodedVideo(outputPath, minDuration, { remuxed });

    const outputAnalysis = await analyzeVideo(outputPath);
    console.log('[VideoTranscoder] Output analysis:', JSON.stringify(outputAnalysis, null, 2));

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const inputSize = inputAnalysis.size ? (inputAnalysis.size / 1024 / 1024).toFixed(2) : 'unknown';
    const outputSize = outputAnalysis.size ? (outputAnalysis.size / 1024 / 1024).toFixed(2) : 'unknown';
    console.log(`[VideoTranscoder] ${remuxed ? 'REMUX' : 'TRANSCODE'} COMPLETE: ${inputSize}MB -> ${outputSize}MB in ${totalTime}s (ffmpeg: ${transcodeTime}s)`);

    return {
      ok: true,
      usedPath: outputPath,
      transcoded: true,
      remuxed,
      reasons,
      logs: {
        input: inputAnalysis,
        output: outputAnalysis,
        ffmpegStderr: ffmpegStderr.slice(-2000),
        transcodeTimeSeconds: parseFloat(transcodeTime),
        totalTimeSeconds: parseFloat(totalTime),
      },
    };
  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[VideoTranscoder] Transcode failed after ${elapsed}s:`, error.message);
    return {
      ok: false,
      usedPath: inputPath,
      transcoded: false,
      remuxed: false,
      reasons,
      logs: {
        input: inputAnalysis,
        error: error.message,
        ffmpegStderr: error.message,
      },
    };
  }
}

// Serverless runtimes cap /tmp (512MB on Vercel) and the source plus the transcoded output
// both live there, so keep headroom. Raise MAX_VIDEO_DOWNLOAD_BYTES on hosts with a real disk.
const MAX_DOWNLOAD_SIZE = readPositiveNumberEnv('MAX_VIDEO_DOWNLOAD_BYTES', 350 * 1024 * 1024);
const DOWNLOAD_TIMEOUT = readPositiveNumberEnv('VIDEO_DOWNLOAD_TIMEOUT_MS', 10 * 60 * 1000);

export async function downloadToTemp(url: string, filename: string): Promise<string> {
  const downloadStart = Date.now();
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
  const ext = path.extname(filename) || '.mp4';
  const tempPath = `/tmp/download_${hash}${ext}`;

  console.log('[VideoTranscoder] Starting download:', { url: url.slice(0, 100), tempPath });

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DOWNLOAD_TIMEOUT);

  let response: Response | null = null;
  let writeStream: fs.WriteStream | null = null;

  const cleanup = async () => {
    clearTimeout(timeout);
    if (writeStream) {
      writeStream.destroy();
    }
    await fs.promises.unlink(tempPath).catch(() => {});
  };

  try {
    response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE) {
      throw new Error(
        `File too large: ${(parseInt(contentLength) / 1024 / 1024).toFixed(1)}MB exceeds the ` +
        `${(MAX_DOWNLOAD_SIZE / 1024 / 1024).toFixed(0)}MB limit (raise MAX_VIDEO_DOWNLOAD_BYTES if the host has the disk space)`,
      );
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    let totalSize = 0;
    const sizeChecker = new Transform({
      transform(chunk, encoding, callback) {
        totalSize += chunk.length;
        if (totalSize > MAX_DOWNLOAD_SIZE) {
          callback(new Error(
            `Download exceeded the ${(MAX_DOWNLOAD_SIZE / 1024 / 1024).toFixed(0)}MB limit ` +
            `(raise MAX_VIDEO_DOWNLOAD_BYTES if the host has the disk space)`,
          ));
        } else {
          callback(null, chunk);
        }
      }
    });

    writeStream = fs.createWriteStream(tempPath);
    const nodeReadable = Readable.fromWeb(response.body as any);

    await pipeline(nodeReadable, sizeChecker, writeStream);
    writeStream = null;
    clearTimeout(timeout);
    
    const stat = await fs.promises.stat(tempPath);
    if (stat.size === 0) {
      await fs.promises.unlink(tempPath).catch(() => {});
      throw new Error('Download failed: file is empty (0 bytes)');
    }

    const downloadTime = ((Date.now() - downloadStart) / 1000).toFixed(2);
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
    const speedMBps = (stat.size / 1024 / 1024 / (parseFloat(downloadTime) || 1)).toFixed(2);
    console.log(`[VideoTranscoder] DOWNLOAD COMPLETE: ${sizeMB}MB in ${downloadTime}s (${speedMBps} MB/s)`);
    return tempPath;
  } catch (err: any) {
    await cleanup();
    
    if (err.name === 'AbortError') {
      throw new Error(`Download timed out after ${DOWNLOAD_TIMEOUT / 1000} seconds`);
    }
    throw err;
  }
}

export async function cleanupTempFile(filePath: string): Promise<void> {
  if (filePath.startsWith('/tmp/')) {
    try {
      await fs.promises.unlink(filePath);
      console.log('[VideoTranscoder] Cleaned up:', filePath);
    } catch {
    }
  }
}
