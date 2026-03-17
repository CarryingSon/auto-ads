import type { CookieOptions } from "express";

const SESSION_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getSessionCookieOptions() {
  const isProd = isProductionRuntime();
  return {
    secure: isProd,
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_MS,
    sameSite: isProd ? "none" : "lax",
  } as const;
}

export function getClearSessionCookieOptions(): CookieOptions {
  const isProd = isProductionRuntime();
  return {
    path: "/",
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
  };
}
