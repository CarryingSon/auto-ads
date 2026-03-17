import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { createServer } from "http";

import { pool } from "./db";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import authRoutes from "./auth-routes";
import { getSessionCookieOptions } from "./session-config";

export interface CreateAppOptions {
  serveFrontend?: boolean;
  enableDevVite?: boolean;
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const httpServer = createServer(app);

  const isProduction = process.env.NODE_ENV === "production";
  const isVercel = process.env.VERCEL === "1";
  const serveFrontend = options.serveFrontend ?? !isVercel;
  const enableDevVite = options.enableDevVite ?? !isVercel;

  app.set("trust proxy", 1);

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "development-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: getSessionCookieOptions(),
    }),
  );

  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  app.use((req, _res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      console.log(`[REQUEST] ${req.method} ${req.path}`);
    }
    next();
  });

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson as Record<string, any>;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        log(logLine);
      }
    });

    next();
  });

  app.use("/auth", authRoutes);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[Error Handler] ${status}: ${message}`, err.stack || err);
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  if (serveFrontend) {
    if (isProduction) {
      serveStatic(app);
    } else if (enableDevVite) {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
  }

  return { app, httpServer };
}
