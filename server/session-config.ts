import type { CookieOptions } from "express";

const SESSION_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getSessionCookieOptions() {
  return {
    secure: isProductionRuntime(),
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_MS,
    sameSite: "lax",
  } as const;
}

export function getClearSessionCookieOptions(): CookieOptions {
  return {
    path: "/",
    secure: isProductionRuntime(),
    httpOnly: true,
    sameSite: "lax",
  };
}
