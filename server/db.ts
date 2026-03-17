import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString, max: 10 });
export const db = drizzle(pool, { schema });

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
