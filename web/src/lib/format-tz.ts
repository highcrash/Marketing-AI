/**
 * Timezone-aware date/time formatters for the Marketing AI UI.
 *
 * The business's IANA timezone (e.g. "Asia/Dhaka") is stored on the
 * Business record and surfaced on the analysis result. All UI dates
 * and AI prompts should render in that zone — not the browser's local
 * zone — so that "Today" / "8pm tonight" / "Friday" agree with the
 * owner's wall clock regardless of where the request comes from.
 */

/** YYYY-MM-DD in the given IANA zone. */
export function todayInTz(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** "Fri, May 15" — short weekday + month/day in the business zone. */
export function formatDateShort(
  iso: string | number | Date,
  timezone: string,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** "May 15, 2026" — for stable absolute references. */
export function formatDateLong(
  iso: string | number | Date,
  timezone: string,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** "May 15, 8:42 PM" in the business zone. */
export function formatDateTime(
  iso: string | number | Date,
  timezone: string,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** "8:42 PM" in the business zone. */
export function formatTime(
  iso: string | number | Date,
  timezone: string,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** "20:00" / "8 PM" for an hour-of-day already expressed in the business zone. */
export function formatHourOfDay(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display} ${suffix}`;
}

/** Weekday name (Mon, Tue…) for a 0=Sun..6=Sat index. */
export function dayOfWeekShort(dow: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][((dow % 7) + 7) % 7];
}

/**
 * Find the next instant (from `now`) whose wall-clock in `timezone`
 * matches (dayOfWeek, hour, minute). Used for "the next time it's
 * Thursday 10:00 in Asia/Dhaka." Implemented by walking minute-grained
 * candidates forward up to 14 days and comparing the formatted parts
 * — avoids pulling in a tz math library.
 */
export function nextWeeklyFireInTz(
  timezone: string,
  dayOfWeek: number,
  hour: number,
  minute: number,
  now: Date = new Date(),
): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const dayNames: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  // Walk candidates at one-minute resolution starting from "now rounded
  // up to the next minute." We stop after 14 days * 1440 minutes
  // (worst case ~20 000 iterations).
  const start = new Date(Math.ceil(now.getTime() / 60_000) * 60_000);
  for (let step = 0; step < 14 * 1440; step++) {
    const candidate = new Date(start.getTime() + step * 60_000);
    const parts = fmt.formatToParts(candidate);
    let dow = -1;
    let h = -1;
    let m = -1;
    for (const p of parts) {
      if (p.type === 'weekday') dow = dayNames[p.value] ?? -1;
      else if (p.type === 'hour') h = Number(p.value) % 24;
      else if (p.type === 'minute') m = Number(p.value);
    }
    if (dow === dayOfWeek && h === hour && m === minute) return candidate;
  }
  // Fallback (should never happen for a valid weekly schedule).
  return new Date(now.getTime() + 7 * 24 * 3600 * 1000);
}
