import type { RequestHandler } from "express";
import { createApp } from "../server/app";

let cachedAppPromise: ReturnType<typeof createApp> | null = null;

const handler: RequestHandler = async (req, res) => {
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
