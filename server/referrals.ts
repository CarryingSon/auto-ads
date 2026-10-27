import crypto from "crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db, pool } from "./db.js";
import { jobQueue, referralCodes, referrals, type Referral } from "../shared/schema.js";

// Launch credits a referrer earns when someone they invited completes a first
// successful launch.
export const REFERRAL_BONUS_CREDITS = 5;

// The browser keeps the code from a shared link (?ref=CODE) in this cookie
// until the Meta login callback reads it.
export const REFERRAL_COOKIE = "aa_ref";

// No 0/O or 1/I, so a code read aloud or retyped still works.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

let ensureReferralTablesPromise: Promise<void> | null = null;

// Same tables as migrations/0008_referrals.sql, so a deploy works before the
// migration has been run.
export async function ensureReferralTables(): Promise<void> {
  if (!ensureReferralTablesPromise) {
    ensureReferralTablesPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS referral_codes (
          user_id varchar PRIMARY KEY NOT NULL,
          code text NOT NULL UNIQUE,
          created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS referrals (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          referrer_user_id varchar NOT NULL,
          referred_user_id varchar NOT NULL UNIQUE,
          created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
          rewarded_at timestamp
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS referrals_referrer_user_id_idx ON referrals (referrer_user_id);`);
      await pool.query(`ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;`);
      await pool.query(`ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;`);
    })().catch((error) => {
      ensureReferralTablesPromise = null;
      throw error;
    });
  }
  await ensureReferralTablesPromise;
}

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  await ensureReferralTables();

  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1);
    if (existing) return existing.code;

    try {
      await db.insert(referralCodes).values({ userId, code: generateCode() }).onConflictDoNothing({ target: referralCodes.userId });
    } catch (error: any) {
      // 23505: the random code is already taken by someone else; draw again.
      if (error?.code !== "23505") throw error;
    }
  }
  throw new Error("Could not create a referral code");
}

// Links a brand-new user to whoever shared the link they signed up from.
// Returns null when the code is unknown, is the user's own, or the user was
// already referred or has launched before (so is not new).
export async function recordReferral(referredUserId: string, rawCode: unknown): Promise<Referral | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  await ensureReferralTables();

  const [owner] = await db.select().from(referralCodes).where(eq(referralCodes.code, code)).limit(1);
  if (!owner || owner.userId === referredUserId) return null;

  const [priorLaunch] = await db.select({ id: jobQueue.id }).from(jobQueue).where(eq(jobQueue.userId, referredUserId)).limit(1);
  if (priorLaunch) return null;

  const [created] = await db
    .insert(referrals)
    .values({ referrerUserId: owner.userId, referredUserId })
    .onConflictDoNothing({ target: referrals.referredUserId })
    .returning();
  return created || null;
}

// Called after each successful launch. Only the first one for a referred user
// changes anything: rewarded_at is set once and the referrer's credit limit
// grows by REFERRAL_BONUS_CREDITS from then on.
export async function rewardReferralOnSuccessfulLaunch(userId: string): Promise<Referral | null> {
  await ensureReferralTables();
  const [rewarded] = await db
    .update(referrals)
    .set({ rewardedAt: new Date() })
    .where(and(eq(referrals.referredUserId, userId), isNull(referrals.rewardedAt)))
    .returning();
  return rewarded || null;
}

export async function getReferralCounts(userId: string): Promise<{ invited: number; rewarded: number }> {
  await ensureReferralTables();
  const [row] = await db
    .select({
      invited: sql<number>`count(*)::int`,
      rewarded: sql<number>`count(${referrals.rewardedAt})::int`,
    })
    .from(referrals)
    .where(eq(referrals.referrerUserId, userId));
  return { invited: Number(row?.invited || 0), rewarded: Number(row?.rewarded || 0) };
}

export async function countRewardedReferrals(userId: string): Promise<number> {
  await ensureReferralTables();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referrals)
    .where(and(eq(referrals.referrerUserId, userId), isNotNull(referrals.rewardedAt)));
  return Number(row?.count || 0);
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
