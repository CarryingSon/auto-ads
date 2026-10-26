// Records the screen recording shown on the last slide of the onboarding guide
// (client/src/components/onboarding-guide.tsx), in light and dark theme.
//
//   npm run record:onboarding
//
// It starts the client on its own and answers every /api and /auth request
// from mocks.mjs, so nothing reaches the real backend, Meta or Google Drive.
// The flow stops with the cursor on Publish Ads; it never clicks it.
//
// Needs Playwright's headless Chromium, installed once with
//   npx playwright-core install chromium-headless-shell
// Installed Google Chrome does not work: its screencast captures a shorter
// window than the viewport, which squashes the video.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mockResponse } from "./mocks.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT_DIR = path.join(ROOT, "client/public/onboarding");
const W = 800;
const H = 500;

const server = await createServer({ configFile: path.join(ROOT, "vite.config.ts"), server: { port: 5179, strictPort: true }, logLevel: "error" });
await server.listen();
const base = "http://localhost:5179";

const browser = await chromium.launch();
try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const theme of ["light", "dark"]) {
    const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), `onboarding-${theme}-`));
    const list = await record(theme, framesDir);
    const mp4 = path.join(OUT_DIR, `launch-flow-${theme}.mp4`);
    stitch(list, mp4);
    // WebM for browsers that cannot play H.264, such as plain Chromium builds.
    execFileSync(ffmpeg.path, ["-loglevel", "error", "-y", "-i", mp4, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1", "-an", mp4.replace(/\.mp4$/, ".webm")]);
    execFileSync(ffmpeg.path, ["-loglevel", "error", "-y", "-i", path.join(framesDir, "00000.jpg"), "-vf", "scale=1280:800:flags=lanczos", "-q:v", "4", path.join(OUT_DIR, `launch-flow-${theme}.jpg`)]);
    fs.rmSync(framesDir, { recursive: true, force: true });
    console.log(`Saved client/public/onboarding/launch-flow-${theme}.mp4 and .webm`);
  }
} finally {
  await browser.close();
  await server.close();
}

function stitch(listFile, out) {
  execFileSync(ffmpeg.path, [
    "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", "fps=30,scale=1280:800:flags=lanczos,setsar=1,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-movflags", "+faststart", "-an", out,
  ]);
}

async function record(theme, framesDir) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });

  await page.addInitScript(t => {
    localStorage.setItem("theme", t);
    localStorage.setItem("onboarding-seen-v1", "1");
    // Headless Chrome draws no cursor, so draw one.
    window.addEventListener("DOMContentLoaded", () => {
      const c = document.createElement("div");
      c.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l14 10.5-6.2 1.1 3.9 7.4-2.9 1.5-3.9-7.5L4 19.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
      Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-100px,-100px)", transition: "scale .12s", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.3))" });
      document.documentElement.appendChild(c);
      document.addEventListener("mousemove", e => { c.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 2}px)`; }, true);
      document.addEventListener("mousedown", () => { c.style.scale = "0.82"; }, true);
      document.addEventListener("mouseup", () => { c.style.scale = "1"; }, true);
    });
  }, theme);

  page.on("pageerror", e => console.warn("pageerror:", e.message));
  await page.route(/\/(api|auth)\//, async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base || url.pathname.startsWith("/src/")) return route.continue();
    // A short wait keeps the sync progress bar on screen like a real sync.
    if (url.pathname === "/api/drive/sync") await new Promise(r => setTimeout(r, 1800));
    const body = mockResponse(route.request().method(), url.pathname, url);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto(`${base}/bulk-ads`);
  await page.waitForSelector('[data-testid="input-folder-url"]');
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: "::-webkit-scrollbar{display:none} *{scrollbar-width:none}" });
  await page.click('[data-testid="button-sidebar-toggle"]');
  await page.waitForTimeout(600);

  const frames = [];
  let sizeError = null;
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", async f => {
    if (f.metadata.deviceWidth !== W || f.metadata.deviceHeight !== H) {
      sizeError ??= `screencast is ${f.metadata.deviceWidth}x${f.metadata.deviceHeight}, expected ${W}x${H}`;
    }
    const file = path.join(framesDir, `${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W * 2, maxHeight: H * 2 });

  let cursor = { x: W * 0.7, y: H * 0.85 };
  await page.mouse.move(cursor.x, cursor.y);
  const moveTo = async (locator, { dx = 0.5, dy = 0.5 } = {}) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const to = { x: box.x + box.width * dx, y: box.y + box.height * dy };
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await page.mouse.move(cursor.x + (to.x - cursor.x) * ease, cursor.y + (to.y - cursor.y) * ease);
      await page.waitForTimeout(12);
    }
    cursor = to;
  };
  const click = async (locator, opts) => {
    await moveTo(locator, opts);
    await page.waitForTimeout(180);
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.up();
  };

  await page.waitForTimeout(600);
  await click(page.locator('[data-testid="select-campaign-step1"]'));
  await page.waitForTimeout(500);
  await click(page.getByRole("option").first(), { dx: 0.3 });
  await page.waitForTimeout(500);

  await click(page.locator('[data-testid="input-folder-url"]'), { dx: 0.3 });
  await page.waitForTimeout(250);
  await page.keyboard.type("https://drive.google.com/drive/folders/1AbCSpringCampaign", { delay: 22 });
  await page.waitForTimeout(500);

  await click(page.locator('[data-testid="button-sync-drive"]'));
  await page.waitForSelector('[data-testid="button-next-step"]', { timeout: 20000 });
  await page.waitForTimeout(2800);

  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(900);
  await click(page.locator('[data-testid="button-next-step"]'));
  await page.waitForTimeout(1800);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(900);
  await click(page.locator('[data-testid="button-next-step"]'));
  await page.waitForTimeout(1600);

  await moveTo(page.locator('[data-testid="button-launch"]'));
  await page.waitForTimeout(1600);

  await cdp.send("Page.stopScreencast");
  await page.waitForTimeout(200);
  await page.close();
  if (sizeError) throw new Error(`Recording would be distorted: ${sizeError}`);

  const end = frames.at(-1).t + 0.8;
  const lines = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(4)}`);
  const listFile = path.join(framesDir, "list.txt");
  fs.writeFileSync(listFile, `${lines.join("\n")}\nfile '${frames.at(-1).file}'\n`);
  return listFile;
}
