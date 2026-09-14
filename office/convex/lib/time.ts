/**
 * Everything in this app thinks in SAST (Africa/Johannesburg, UTC+2, no DST).
 * Convex crons think in UTC. This module is the only place that conversion
 * happens, so a schedule can never drift by two hours because someone forgot.
 */

export const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

/** YYYY-MM-DD for the given instant, in SAST. Used for daily budget rollups. */
export function sastDay(at: number = Date.now()): string {
  return new Date(at + SAST_OFFSET_MS).toISOString().slice(0, 10);
}

/** HH:MM in SAST. */
export function sastTime(at: number = Date.now()): string {
  return new Date(at + SAST_OFFSET_MS).toISOString().slice(11, 16);
}

/** 0 = Sunday … 6 = Saturday, in SAST. */
export function sastWeekday(at: number = Date.now()): number {
  return new Date(at + SAST_OFFSET_MS).getUTCDay();
}

export function isWeekdaySast(at: number = Date.now()): boolean {
  const d = sastWeekday(at);
  return d >= 1 && d <= 5;
}

/** True inside 08:00–17:00 SAST on a weekday. Outreach only sends in here. */
export function isOfficeHoursSast(at: number = Date.now()): boolean {
  if (!isWeekdaySast(at)) return false;
  const hour = new Date(at + SAST_OFFSET_MS).getUTCHours();
  return hour >= 8 && hour < 17;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysFromNow(n: number, from: number = Date.now()): number {
  return from + n * DAY_MS;
}

/** "3 minutes ago" / "in 2 hours". For the activity feed. */
export function relative(at: number, now: number = Date.now()): string {
  const diff = now - at;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [1000, "second"],
    [60 * 1000, "minute"],
    [60 * 60 * 1000, "hour"],
    [DAY_MS, "day"],
  ];
  let value = Math.round(abs / 1000);
  let unit = "second";
  for (const [ms, name] of units) {
    if (abs >= ms) {
      value = Math.floor(abs / ms);
      unit = name;
    }
  }
  const plural = value === 1 ? "" : "s";
  return diff >= 0 ? `${value} ${unit}${plural} ago` : `in ${value} ${unit}${plural}`;
}

/** The next occurrence of a given SAST hour, as an epoch ms timestamp. */
export function nextSastHour(hour: number, from: number = Date.now()): number {
  const local = new Date(from + SAST_OFFSET_MS);
  local.setUTCHours(hour, 0, 0, 0);
  let target = local.getTime() - SAST_OFFSET_MS;
  if (target <= from) target += DAY_MS;
  return target;
}

/**
 * Push a timestamp into the next weekday 08:00–17:00 SAST window.
 * Follow-ups scheduled for a Saturday land on Monday morning instead.
 */
export function nextSendWindow(at: number): number {
  let t = at;
  for (let i = 0; i < 14; i++) {
    if (isOfficeHoursSast(t)) return t;
    const local = new Date(t + SAST_OFFSET_MS);
    const hour = local.getUTCHours();
    if (isWeekdaySast(t) && hour < 8) {
      local.setUTCHours(8, 30, 0, 0);
      t = local.getTime() - SAST_OFFSET_MS;
    } else {
      local.setUTCHours(8, 30, 0, 0);
      t = local.getTime() - SAST_OFFSET_MS + DAY_MS;
    }
  }
  return t;
}
