import { describe, expect, it } from "vitest";
import { db } from "../db.js";
import { jobQueue } from "../../shared/schema.js";
import { launchCount, launchUsageWhere } from "../job-queue.js";
import { FREE_CREDITS_COUNT_FROM, FREE_LAUNCH_CREDITS, freeLaunchLimit } from "../billing.js";
import { normalizeReferralCode, readCookie, REFERRAL_BONUS_CREDITS } from "../referrals.js";

// Renders the usage query; nothing is sent to a database.
function usageSql() {
  return db
    .select({ count: launchCount })
    .from(jobQueue)
    .where(launchUsageWhere("user-1", FREE_CREDITS_COUNT_FROM))
    .toSQL();
}

describe("free launch usage", () => {
  it("counts launches, not the queue rows their retries add", () => {
    expect(usageSql().sql).toMatch(/count\(distinct "(job_queue"\.")?job_id"\)/);
  });

  it("counts a cancelled launch only once it had started", () => {
    const { sql, params } = usageSql();
    expect(params).toContain("cancelled");
    expect(sql).toMatch(/"job_queue"\."started_at" is not null/);
  });

  it("does not count failed launches", () => {
    expect(usageSql().params).not.toContain("failed");
  });

  it("counts from the credit start date with no monthly cut-off", () => {
    const { sql } = usageSql();
    expect(sql).toMatch(/"job_queue"\."created_at" >= \$/);
    expect(sql).not.toMatch(/"job_queue"\."created_at" < \$/);
  });
});

describe("free launch credits", () => {
  it("starts at five and grows by five per rewarded referral", () => {
    expect(FREE_LAUNCH_CREDITS).toBe(5);
    expect(REFERRAL_BONUS_CREDITS).toBe(5);
    expect(freeLaunchLimit(0)).toBe(5);
    expect(freeLaunchLimit(3)).toBe(20);
  });
});

describe("referral codes", () => {
  it("accepts codes in any case and rejects anything else", () => {
    expect(normalizeReferralCode(" ab3k9qzx ")).toBe("AB3K9QZX");
    expect(normalizeReferralCode("ab")).toBeNull();
    expect(normalizeReferralCode("abc-123")).toBeNull();
    expect(normalizeReferralCode(undefined)).toBeNull();
  });

  it("reads the referral cookie from a cookie header", () => {
    expect(readCookie("a=1; aa_ref=AB3K9QZX; b=2", "aa_ref")).toBe("AB3K9QZX");
    expect(readCookie("a=1", "aa_ref")).toBeNull();
    expect(readCookie(undefined, "aa_ref")).toBeNull();
  });
});
