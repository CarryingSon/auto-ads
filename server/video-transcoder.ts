import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { Readable, Transform, pipeline as pipelineCallback } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const pipeline = promisify(pipelineCallback);

const execAsync = promisify(exec);

export interface VideoAnalysis {
  filename: string;
  size: number;
  container: string;
  duration: number;
  video: {
    codec: string;
    profile: string | null;
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

export async function analyzeVideo(inputPath: string): Promise<VideoAnalysis> {
  const stats = await fs.promises.stat(inputPath);
  const filename = path.basename(inputPath);
  const container = path.extname(inputPath).toLowerCase();

  const cmd = `ffprobe -hide_banner -v error -show_format -show_streams -of json "${inputPath}"`;
  
  let ffprobeOutput: string;
  try {
    const { stdout } = await execAsync(cmd);
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

  return {
    filename,
    size: stats.size,
    container,
    duration,
    video: videoStream ? {
      codec: videoStream.codec_name || 'unknown',
      profile: videoStream.profile || null,
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

export function needsTranscode(analysis: VideoAnalysis, originalFilename: string): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!analysis.video) {
    return { needed: false, reasons: ['no_video_stream'] };
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

  return { needed: reasons.length > 0, reasons };
}

function buildUnknownInputAnalysis(inputPath: string, originalFilename: string): VideoAnalysis {
  return {
    filename: originalFilename,
    size: 0,
    container: path.extname(inputPath),
    duration: 0,
    video: null,
    audio: null,
  };
}

function isMissingBinaryError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('command not found') ||
    normalized.includes('enoent') ||
    normalized.includes('spawn ffprobe')
  );
}

export async function decideMetaVideoPreparation(
  inputPath: string,
  originalFilename: string,
  minDuration: number = 1.0
): Promise<MetaVideoPreparationDecision> {
  let inputAnalysis: VideoAnalysis;

  try {
    inputAnalysis = await analyzeVideo(inputPath);
    console.log('[VideoTranscoder] Input analysis:', JSON.stringify(inputAnalysis, null, 2));
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to analyze video';
    const isFfprobeUnavailable = errorMessage.includes('ffprobe failed') && isMissingBinaryError(errorMessage);

    if (isFfprobeUnavailable) {
      console.warn('[VideoTranscoder] ffprobe not available in runtime, using direct-upload fallback');
      return {
        ok: true,
        shouldTranscode: false,
        reasons: ['ffprobe_unavailable'],
        input: buildUnknownInputAnalysis(inputPath, originalFilename),
        usedFallback: true,
        error: errorMessage,
      };
    }

    return {
      ok: false,
      shouldTranscode: false,
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
      reasons: ['duration_too_short'],
      input: inputAnalysis,
      usedFallback: false,
      error: `Duration ${inputAnalysis.duration}s is less than ${minDuration}s minimum`,
    };
  }

  const { needed, reasons } = needsTranscode(inputAnalysis, originalFilename);
  console.log('[VideoTranscoder] Transcode check:', { needed, reasons });

  return {
    ok: true,
    shouldTranscode: needed,
    reasons,
    input: inputAnalysis,
    usedFallback: false,
  };
}

async function runFfmpeg(args: string[]): Promise<{ success: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', args);
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

export async function transcodeForMeta(
  inputPath: string,
  hasAudio: boolean
): Promise<{ outputPath: string; ffmpegStderr: string }> {
  const hash = crypto.createHash('md5').update(inputPath + Date.now()).digest('hex').slice(0, 12);
  const outputPath = `/tmp/meta_safe_${hash}.mp4`;

  let args: string[];

  if (hasAudio) {
    args = [
      '-y', '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
      '-r', '30', '-vsync', 'cfr', '-g', '60', '-keyint_min', '60',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart',
      outputPath,
    ];
  } else {
    args = [
      '-y', '-i', inputPath,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
      '-r', '30', '-vsync', 'cfr', '-g', '60', '-keyint_min', '60',
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

  return { outputPath, ffmpegStderr: stderr };
}

export async function validateTranscodedVideo(outputPath: string, minDuration: number = 1.0): Promise<void> {
  const analysis = await analyzeVideo(outputPath);

  if (!analysis.video) {
    throw new Error('Post-validation failed: no video stream in output');
  }

  if (analysis.video.codec !== 'h264') {
    throw new Error(`Post-validation failed: video codec is ${analysis.video.codec}, expected h264`);
  }

  if (analysis.video.pixFmt !== 'yuv420p') {
    throw new Error(`Post-validation failed: pix_fmt is ${analysis.video.pixFmt}, expected yuv420p`);
  }

  if (!analysis.audio || analysis.audio.codec !== 'aac') {
    throw new Error(`Post-validation failed: audio codec is ${analysis.audio?.codec || 'missing'}, expected aac`);
  }

  if (analysis.duration < minDuration) {
    throw new Error(`Post-validation failed: duration ${analysis.duration}s < ${minDuration}s minimum`);
  }
}

export async function prepareVideoForMeta(
  inputPath: string,
  originalFilename: string,
  minDuration: number = 1.0
): Promise<TranscodeResult> {
  const startTime = Date.now();
  console.log('[VideoTranscoder] Preparing video for Meta:', { inputPath, originalFilename });

  const decision = await decideMetaVideoPreparation(inputPath, originalFilename, minDuration);
  if (!decision.ok) {
    return {
      ok: false,
      usedPath: inputPath,
      transcoded: false,
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
    console.log('[VideoTranscoder] Starting ffmpeg transcode...');
    
    const { outputPath, ffmpegStderr } = await transcodeForMeta(inputPath, hasAudio);
    
    const transcodeTime = ((Date.now() - transcodeStart) / 1000).toFixed(2);
    console.log(`[VideoTranscoder] FFmpeg transcode completed in ${transcodeTime}s`);

    await validateTranscodedVideo(outputPath, minDuration);

    const outputAnalysis = await analyzeVideo(outputPath);
    console.log('[VideoTranscoder] Output analysis:', JSON.stringify(outputAnalysis, null, 2));

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const inputSize = inputAnalysis.size ? (inputAnalysis.size / 1024 / 1024).toFixed(2) : 'unknown';
    const outputSize = outputAnalysis.size ? (outputAnalysis.size / 1024 / 1024).toFixed(2) : 'unknown';
    console.log(`[VideoTranscoder] TRANSCODE COMPLETE: ${inputSize}MB -> ${outputSize}MB in ${totalTime}s (ffmpeg: ${transcodeTime}s)`);

    return {
      ok: true,
      usedPath: outputPath,
      transcoded: true,
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
      reasons,
      logs: {
        input: inputAnalysis,
        error: error.message,
        ffmpegStderr: error.message,
      },
    };
  }
}

const MAX_DOWNLOAD_SIZE = 4 * 1024 * 1024 * 1024; // 4GB max
const DOWNLOAD_TIMEOUT = 10 * 60 * 1000; // 10 minutes

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
      throw new Error(`File too large: ${contentLength} bytes exceeds ${MAX_DOWNLOAD_SIZE} limit`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    let totalSize = 0;
    const sizeChecker = new Transform({
      transform(chunk, encoding, callback) {
        totalSize += chunk.length;
        if (totalSize > MAX_DOWNLOAD_SIZE) {
          callback(new Error(`Download exceeded max size of ${MAX_DOWNLOAD_SIZE} bytes`));
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
