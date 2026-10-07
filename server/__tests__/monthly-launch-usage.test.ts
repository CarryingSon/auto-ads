import { describe, expect, it } from "vitest";
import { db } from "../db.js";
import { jobQueue } from "../../shared/schema.js";
import { monthlyLaunchCount, monthlyLaunchUsageWhere } from "../job-queue.js";

// Renders the usage query; nothing is sent to a database.
function usageSql() {
  return db
    .select({ count: monthlyLaunchCount })
    .from(jobQueue)
    .where(monthlyLaunchUsageWhere("user-1", new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z")))
    .toSQL();
}

describe("monthly launch usage", () => {
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
});
