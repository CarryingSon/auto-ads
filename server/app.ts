import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { createServer } from "http";
import crypto from "crypto";

import { pool } from "./db.js";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import authRoutes from "./auth-routes.js";
import { getSessionCookieOptions } from "./session-config.js";

export interface CreateAppOptions {
  serveFrontend?: boolean;
  enableDevVite?: boolean;
}

const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SENSITIVE_KEY_RE = /(^|_|-)(access_token|refresh_token|authorization|cookie|set-cookie|apikey|api_key|secret|token)$/i;

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) return acc;
    let key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    try {
      key = decodeURIComponent(key);
      value = decodeURIComponent(value);
    } catch {
      // Keep raw cookie values if decoding fails.
    }
    acc[key] = value;
    return acc;
  }, {});
}

function redactString(input: string): string {
  return input
    .replace(/(access_token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]");
}

function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (seen.has(value as object)) {
    return "[Circular]";
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }
    sanitized[key] = redactSensitive(raw, seen);
  }
  return sanitized;
}

function getRequestOrigin(req: Request): string {
  const host = req.get("host") || "";
  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  const proto = forwardedProto || (req.secure ? "https" : "http");
  return host ? `${proto}://${host}` : "";
}

function isAllowedOrigin(req: Request, candidateUrl: string): boolean {
  if (!candidateUrl) return false;
  try {
    const candidateOrigin = new URL(candidateUrl).origin;
    const requestOrigin = getRequestOrigin(req);
    const appBaseUrl = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
    const allowed = new Set<string>();
    if (requestOrigin) allowed.add(requestOrigin);
    if (appBaseUrl) {
      try {
        allowed.add(new URL(appBaseUrl).origin);
      } catch {
        // Ignore malformed APP_BASE_URL during origin allow-list build.
      }
    }
    return allowed.has(candidateOrigin);
  } catch {
    return false;
  }
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
  const sessionSecret = process.env.SESSION_SECRET;

  if (isProduction && !sessionSecret) {
    throw new Error("SESSION_SECRET must be configured in production");
  }

  app.set("trust proxy", 1);

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        // In production serverless we avoid session-table bootstrap checks
        // on hot paths because the table already exists and the extra
        // query can amplify connection pressure.
        createTableIfMissing: !isProduction,
      }),
      secret: sessionSecret || "development-secret-key",
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

  app.use((req, res, next) => {
    const existingCookies = parseCookies(req.headers.cookie);
    let csrfToken = existingCookies[CSRF_COOKIE_NAME];

    if (!csrfToken) {
      csrfToken = crypto.randomBytes(24).toString("hex");
      res.cookie(CSRF_COOKIE_NAME, csrfToken, {
        path: "/",
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
      });
    }

    const isProtectedPath = req.path.startsWith("/api") || req.path.startsWith("/auth");
    const isMutating = MUTATING_METHODS.has(req.method.toUpperCase());
    if (!isProtectedPath || !isMutating) {
      return next();
    }

    // Worker endpoint uses cron auth; CSRF is not applicable for this system trigger.
    if (req.path.startsWith("/api/workers/launch")) {
      return next();
    }

    const origin = req.get("origin");
    const referer = req.get("referer");
    const originCandidate = origin || referer || "";
    if (!originCandidate || !isAllowedOrigin(req, originCandidate)) {
      return res.status(403).json({ error: "Invalid request origin" });
    }

    const csrfHeader = req.get(CSRF_HEADER_NAME) || req.get("x-xsrf-token");
    if (!csrfHeader || csrfHeader !== csrfToken) {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }

    next();
  });

  app.use((req, _res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      console.log(`[REQUEST] ${req.method} ${redactString(req.originalUrl || req.path)}`);
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
          logLine += ` :: ${JSON.stringify(redactSensitive(capturedJsonResponse))}`;
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
      const { setupVite } = await import("./vite.js");
      await setupVite(httpServer, app);
    }
  }

  return { app, httpServer };
}
