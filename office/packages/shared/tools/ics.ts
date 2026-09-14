/**
 * .ics generation for proposed call times.
 *
 * Free, no dependency, works in every calendar app. The alternative — a paid
 * scheduling API — buys nothing a .ics plus a Cal.com link does not already do.
 */

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export interface CallInvite {
  summary: string;
  description: string;
  startsAt: number;
  minutes: number;
  organiserEmail: string;
  attendeeEmail: string;
  location?: string;
}

export function buildIcs(invite: CallInvite): string {
  const start = new Date(invite.startsAt);
  const end = new Date(invite.startsAt + invite.minutes * 60_000);
  const uid = `${invite.startsAt}-${Math.random().toString(36).slice(2, 10)}@thecreativecurrent.co.za`;

  // CRLF line endings are required by RFC 5545 — Outlook is unforgiving about it.
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Creative Current//Office//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(invite.summary)}`,
    `DESCRIPTION:${escapeText(invite.description)}`,
    ...(invite.location ? [`LOCATION:${escapeText(invite.location)}`] : []),
    `ORGANIZER;CN=The Creative Current:mailto:${invite.organiserEmail}`,
    `ATTENDEE;RSVP=TRUE;CN=${invite.attendeeEmail}:mailto:${invite.attendeeEmail}`,
    "STATUS:TENTATIVE",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Two specific times in the next five working days, SAST office hours.
 * Specific beats "let me know what suits" — it gives them something to say yes to.
 */
export function proposeCallTimes(from: number = Date.now()): { at: number; label: string }[] {
  const SAST = 2 * 60 * 60 * 1000;
  const out: { at: number; label: string }[] = [];
  const slots = [10, 14]; // 10:00 and 14:00 SAST
  let day = new Date(from + SAST);
  day.setUTCHours(0, 0, 0, 0);

  for (let i = 1; i <= 7 && out.length < 2; i++) {
    const candidate = new Date(day.getTime() + i * 24 * 60 * 60 * 1000);
    const weekday = candidate.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const hour = slots[out.length % slots.length];
    candidate.setUTCHours(hour, 0, 0, 0);
    const at = candidate.getTime() - SAST;
    out.push({
      at,
      label: `${candidate.toLocaleDateString("en-ZA", { weekday: "long", timeZone: "UTC" })} at ${hour}:00`,
    });
  }
  return out;
}
