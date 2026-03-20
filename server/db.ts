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
const defaultIdleTimeoutMillis = isProduction ? 5_000 : 30_000;
const idleTimeoutMillis = parsePositiveInt(process.env.PG_IDLE_TIMEOUT_MS) ?? defaultIdleTimeoutMillis;
const connectionTimeoutMillis = parsePositiveInt(process.env.PG_CONNECTION_TIMEOUT_MS) ?? 10_000;

export const pool = new Pool({
  connectionString,
  max: poolMax,
  // Keep connection waits bounded and close idle clients promptly in serverless.
  connectionTimeoutMillis,
  idleTimeoutMillis,
  allowExitOnIdle: true,
});
export const db = drizzle(pool, { schema });

console.log(`[DB] Pool configured (max=${poolMax}, idleTimeoutMs=${idleTimeoutMillis}, connectionTimeoutMs=${connectionTimeoutMillis}, production=${isProduction}, vercel=${isVercel})`);

const ensureMetaAccountCacheTable = process.env.DB_ENSURE_META_ACCOUNT_CACHE_TABLE !== "false";
const runHeavyStartupMaintenance = process.env.DB_STARTUP_MAINTENANCE === "true" || !isProduction;

(async () => {
  try {
    if (ensureMetaAccountCacheTable) {
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
    }

    // In production serverless, avoid expensive startup maintenance on every
    // cold start. These are covered by SQL migrations and can be re-enabled
    // temporarily with DB_STARTUP_MAINTENANCE=true when needed.
    if (!runHeavyStartupMaintenance) {
      return;
    }

    await pool.query(`
      DELETE FROM global_settings gs
      USING global_settings newer
      WHERE gs.user_id IS NOT NULL
        AND gs.user_id = newer.user_id
        AND gs.id <> newer.id
        AND gs.updated_at < newer.updated_at;
    `);

    await pool.query(`
      DELETE FROM connections c
      USING connections newer
      WHERE c.user_id IS NOT NULL
        AND c.user_id = newer.user_id
        AND c.provider = newer.provider
        AND c.id <> newer.id
        AND COALESCE(c.last_tested_at, c.connected_at, TO_TIMESTAMP(0))
            < COALESCE(newer.last_tested_at, newer.connected_at, TO_TIMESTAMP(0));
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS global_settings_user_id_unique
      ON global_settings (user_id)
      WHERE user_id IS NOT NULL;
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS connections_user_provider_unique
      ON connections (user_id, provider)
      WHERE user_id IS NOT NULL;
    `);

    // Compatibility backfill for legacy installs that used a single global_settings
    // row with NULL user_id.
    await pool.query(`
      WITH legacy AS (
        SELECT
          facebook_page_id,
          facebook_page_name,
          instagram_page_id,
          instagram_page_name,
          use_instagram_from_facebook,
          beneficiary_name,
          payer_name,
          use_dynamic_creative,
          primary_text_variations,
          headline_variations,
          description_variations,
          default_cta,
          default_website_url,
          default_utm_template,
          plan_type,
          uploads_remaining,
          updated_at
        FROM global_settings
        WHERE user_id IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      users_to_seed AS (
        SELECT DISTINCT user_id
        FROM oauth_connections
        WHERE user_id IS NOT NULL
      )
      INSERT INTO global_settings (
        user_id,
        facebook_page_id,
        facebook_page_name,
        instagram_page_id,
        instagram_page_name,
        use_instagram_from_facebook,
        beneficiary_name,
        payer_name,
        use_dynamic_creative,
        primary_text_variations,
        headline_variations,
        description_variations,
        default_cta,
        default_website_url,
        default_utm_template,
        plan_type,
        uploads_remaining,
        updated_at
      )
      SELECT
        u.user_id,
        l.facebook_page_id,
        l.facebook_page_name,
        l.instagram_page_id,
        l.instagram_page_name,
        l.use_instagram_from_facebook,
        l.beneficiary_name,
        l.payer_name,
        l.use_dynamic_creative,
        l.primary_text_variations,
        l.headline_variations,
        l.description_variations,
        l.default_cta,
        l.default_website_url,
        l.default_utm_template,
        l.plan_type,
        l.uploads_remaining,
        CURRENT_TIMESTAMP
      FROM legacy l
      CROSS JOIN users_to_seed u
      ON CONFLICT DO NOTHING;
    `);
  } catch (err: any) {
    console.error("[DB] Failed to ensure meta_account_cache table:", err.message);
  }
})();
