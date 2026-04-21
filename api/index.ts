import type { RequestHandler } from "express";
import "../server/load-env.js";
import { createApp } from "../server/app.js";

let cachedAppPromise: ReturnType<typeof createApp> | null = null;

function normalizeIncomingUrl(req: { url?: string; originalUrl?: string }) {
  const rawUrl = req.url;
  if (typeof rawUrl !== "string") return;
  if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) return;

  try {
    const parsed = new URL(rawUrl);
    const normalized = `${parsed.pathname}${parsed.search}`;
    req.url = normalized || "/";
    if (typeof req.originalUrl === "string") {
      req.originalUrl = req.url;
    }
  } catch {
    // Keep original request URL if parsing fails.
  }
}

const handler: RequestHandler = async (req, res) => {
  normalizeIncomingUrl(req);

  if (!cachedAppPromise) {
    cachedAppPromise = createApp({
      serveFrontend: false,
      enableDevVite: false,
    });
  }

  const { app } = await cachedAppPromise;
  return app(req, res);
};

export default handler;
