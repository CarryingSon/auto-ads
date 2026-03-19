import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";

const { Pool } = pg;

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL);

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function parsePositiveInt(input: string | undefined): number | null {
  if (!input) return null;
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

const defaultPoolMax = isProduction ? (isVercel ? 1 : 5) : 10;
const poolMax = parsePositiveInt(process.env.PG_POOL_MAX) ?? defaultPoolMax;

export const pool = new Pool({
  connectionString,
  max: poolMax,
  // Keep connection waits bounded and close idle clients promptly in serverless.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  allowExitOnIdle: true,
});
export const db = drizzle(pool, { schema });

console.log(`[DB] Pool configured (max=${poolMax}, production=${isProduction}, vercel=${isVercel})`);

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_account_cache (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        ad_account_id TEXT NOT NULL,
        pages_json JSONB DEFAULT '[]',
        pages_selected_page_id TEXT,
        instagram_accounts_json JSONB DEFAULT '[]',
        pixels_json JSONB DEFAULT '[]',
        custom_audiences_json JSONB DEFAULT '[]',
        saved_audiences_json JSONB DEFAULT '[]',
        last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT meta_account_cache_user_ad_unique UNIQUE (user_id, ad_account_id)
      );
    `);
  } catch (err: any) {
    console.error("[DB] Failed to ensure meta_account_cache table:", err.message);
  }
})();
