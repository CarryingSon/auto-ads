// Meta runs every ad account on its own clock (timezone_name, e.g.
// "Europe/Ljubljana"). A scheduled start the user picks is a wall-clock time
// on that clock, so it has to be converted with the account's time zone, not
// the server's (UTC on Vercel) or the browser's.

const WALL_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Milliseconds the zone is ahead of UTC at `instant` (DST included).
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallAsUtc - Math.floor(instant / 1000) * 1000;
}

// "2026-10-07T09:00" in `timeZone` → the instant it denotes. Returns null for
// anything that is not a plain wall-clock time. Around DST changes: a time the
// clock skips moves forward by the jump, and an hour that occurs twice
// resolves to its second occurrence.
export function wallTimeInZoneToUtc(wallTime: string, timeZone: string): Date | null {
  const match = WALL_TIME_PATTERN.exec(wallTime.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const wallAsUtc = Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second ?? 0),
  );
  if (!Number.isFinite(wallAsUtc)) return null;

  // The offset depends on the instant we are looking for; two passes settle
  // it, including around DST changes.
  let instant = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  instant = wallAsUtc - zoneOffsetMs(instant, timeZone);
  return new Date(instant);
}

// "UTC+02:00" for the zone's offset at `instant`.
export function formatZoneOffset(instant: Date, timeZone: string): string {
  const offsetMinutes = Math.round(zoneOffsetMs(instant.getTime(), timeZone) / 60000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}
