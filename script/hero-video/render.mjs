// Renders scene.html into the landing page hero video:
//   client/public/auto-ads-hero.mp4 (+ .webm and a .jpg poster)
//
//   npm run render:hero
//
// Every frame is a screenshot taken after seeking all animations to that
// frame's time, so the motion is smooth whatever the machine's speed.
// Needs Playwright's headless Chromium (npx playwright-core install chromium-headless-shell).
import { chromium } from "playwright-core";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "client/public/auto-ads-hero");
const FPS = 30;
const DURATION = 24;
const only = process.argv[2] === "--frames" ? process.argv.slice(3).map(Number) : null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", e => console.warn("pageerror:", e.message));
await page.goto(pathToFileURL(path.join(import.meta.dirname, "scene.html")).href);
await page.evaluate(() => window.ready);

const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "hero-"));
try {
  if (only) {
    // Preview stills: npm run render:hero -- --frames 2 6 10
    for (const t of only) {
      await page.evaluate(x => window.seek(x), t);
      await page.screenshot({ path: path.join(ROOT, `hero-${t}s.png`) });
    }
  } else {
    const total = FPS * DURATION;
    for (let i = 0; i < total; i++) {
      await page.evaluate(x => window.seek(x), i / FPS);
      await page.screenshot({ path: path.join(framesDir, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
      if (i % FPS === 0) process.stdout.write(`\r${i / FPS}s / ${DURATION}s`);
    }
    process.stdout.write("\n");
    const input = ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg")];
    execFileSync(ffmpeg.path, [...input, "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", `${OUT}.mp4`]);
    execFileSync(ffmpeg.path, [...input, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", "-an", `${OUT}.webm`]);
    // Poster: the end card, which reads well as a still.
    fs.copyFileSync(path.join(framesDir, `${String(Math.round(22.8 * FPS)).padStart(5, "0")}.jpg`), `${OUT}.jpg`);
    console.log("Saved client/public/auto-ads-hero.mp4, .webm and .jpg");
  }
} finally {
  fs.rmSync(framesDir, { recursive: true, force: true });
  await browser.close();
}
