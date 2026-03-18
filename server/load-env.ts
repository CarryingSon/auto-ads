import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

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
    if (process.env[key]) continue;

    const rawValue = line.slice(separatorIndex + 1);
    process.env[key] = normalizeValue(rawValue);
  }
}

export function loadEnvFromProjectFiles() {
  if (loaded) return;
  loaded = true;

  const candidates = [".env.production", ".env.local", ".env"];
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
