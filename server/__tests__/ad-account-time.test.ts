import { describe, expect, it } from "vitest";
import { formatZoneOffset, isValidTimeZone, wallTimeInZoneToUtc } from "../ad-account-time.js";

describe("wallTimeInZoneToUtc", () => {
  it.each([
    ["2026-10-07T09:00", "Europe/Ljubljana", "2026-10-07T07:00:00.000Z"],
    ["2026-12-07T09:00", "Europe/Ljubljana", "2026-12-07T08:00:00.000Z"],
    ["2026-10-07T09:00:00", "America/Los_Angeles", "2026-10-07T16:00:00.000Z"],
    ["2026-10-07T09:00", "Asia/Kolkata", "2026-10-07T03:30:00.000Z"],
    ["2026-10-07T09:00", "UTC", "2026-10-07T09:00:00.000Z"],
  ])("reads %s in %s", (wall, zone, expected) => {
    expect(wallTimeInZoneToUtc(wall, zone)?.toISOString()).toBe(expected);
  });

  it("moves a time skipped by the spring DST change forward", () => {
    expect(wallTimeInZoneToUtc("2026-03-29T02:30", "Europe/Ljubljana")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("rejects anything that is not a plain wall-clock time", () => {
    expect(wallTimeInZoneToUtc("2026-10-07T09:00:00Z", "UTC")).toBeNull();
    expect(wallTimeInZoneToUtc("tomorrow", "UTC")).toBeNull();
  });
});

describe("time zone helpers", () => {
  it("validates zone names", () => {
    expect(isValidTimeZone("Europe/Ljubljana")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("formats the offset at a given instant", () => {
    expect(formatZoneOffset(new Date("2026-07-01T00:00:00Z"), "Europe/Ljubljana")).toBe("UTC+02:00");
    expect(formatZoneOffset(new Date("2026-07-01T00:00:00Z"), "Asia/Kolkata")).toBe("UTC+05:30");
  });
});
