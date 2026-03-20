import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;
const initialEnvKeys = new Set(Object.keys(process.env));

function normalizeValue(value: string) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  const quoted =
    (quote === `"` || quote === `'`) && trimmed.endsWith(quote) && trimmed.length >= 2;
  const unwrapped = quoted ? trimmed.slice(1, -1) : trimmed;

  return unwrapped
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, `"`);
}

function parseAndAssign(contents: string) {
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;
    if (initialEnvKeys.has(key)) continue;

    const rawValue = line.slice(separatorIndex + 1);
    process.env[key] = normalizeValue(rawValue);
  }
}

function getCandidateEnvFiles() {
  const env = (process.env.NODE_ENV || "development").trim();
  if (env === "production") {
    return [".env.local", ".env", ".env.production"];
  }
  if (env === "test") {
    return [".env.local", ".env", ".env.test"];
  }
  return [".env.local", ".env", ".env.development"];
}

function validateRequiredEnv() {
  const env = (process.env.NODE_ENV || "development").trim();
  const missing: string[] = [];

  const hasDatabaseUrl = !!(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL);
  if (!hasDatabaseUrl) {
    missing.push("DATABASE_URL or SUPABASE_DATABASE_URL");
  }

  if (env === "production") {
    const requiredProdKeys = [
      "SESSION_SECRET",
      "TOKEN_ENC_KEY",
      "CRON_SECRET",
      "APP_BASE_URL",
    ];
    for (const key of requiredProdKeys) {
      if (!process.env[key]) missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables for ${env}: ${missing.join(", ")}`,
    );
  }
}

export function loadEnvFromProjectFiles() {
  if (loaded) return;
  loaded = true;

  const candidates = getCandidateEnvFiles();
  for (const file of candidates) {
    const absolute = resolve(process.cwd(), file);
    if (!existsSync(absolute)) continue;

    try {
      parseAndAssign(readFileSync(absolute, "utf8"));
    } catch (error) {
      console.warn(`[env] Failed loading ${file}:`, error);
    }
  }
}

loadEnvFromProjectFiles();
validateRequiredEnv();
