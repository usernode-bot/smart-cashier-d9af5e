/* Pure helpers for the finance summary and insights. The SQL returns grouped
 * rows; these shape them. Period bounds are computed in the shop's time zone
 * from a given "now" — never from the server clock. Weeks start Monday.
 */
'use strict';

const DAY_MS = 86400000;

// Local calendar parts of an instant in a zone: {y, mo, d, h, mi, dow}
// dow: 0 = Sunday … 6 = Saturday, as Date.getUTCDay would give.
function zonedParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return {
    y: +parts.year, mo: +parts.month, d: +parts.day,
    h: +parts.hour, mi: +parts.minute, s: +parts.second, dow,
  };
}

// Two-pass conversion of local wall-clock parts to a UTC instant: find the
// offset at the first guess, apply it, then re-check (covers DST edges).
function zonedToUTC(y, mo, d, h, mi, s, tz) {
  const L = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  const p = zonedParts(new Date(L), tz);
  const off1 = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - L;
  const u = L - off1;
  const p2 = zonedParts(new Date(u), tz);
  const off2 = Date.UTC(p2.y, p.mo - 1, p.d, p2.h, p2.mi, p2.s) - u;
  return new Date(L - off2);
}

// Local midnight (as a UTC instant) of the day an instant falls on, in tz.
function startOfDay(date, tz) {
  const p = zonedParts(date, tz);
  return zonedToUTC(p.y, p.mo, p.d, 0, 0, 0, tz);
}

// The Monday (in tz) that starts the week containing `date`.
function startOfWeek(date, tz) {
  const p = zonedParts(date, tz);
  const back = (p.dow + 6) % 7; // Monday-first
  const d = new Date(startOfDay(date, tz).getTime() - back * DAY_MS);
  return startOfDay(d, tz);
}

function startOfMonth(date, tz) {
  const p = zonedParts(date, tz);
  return zonedToUTC(p.y, p.mo, 1, 0, 0, 0, tz);
}

function addMonths(y, mo, n) { const v = y * 12 + (mo - 1) + n; return { y: Math.floor(v / 12), mo: (v % 12) + 1 }; }

// Bounds for a finance period or an insights range: start/end of the
// period and of the one before it, all UTC instants, in the shop's zone.
// period: 'today' | 'week' | 'month' | '7d' | '30d'
function periodBounds(now, tz, period) {
  let start, prevStart, spanMs = 0;
  if (period === 'today') {
    start = startOfDay(now, tz);
    prevStart = new Date(start.getTime() - DAY_MS);
    spanMs = DAY_MS;
  } else if (period === 'week') {
    start = startOfWeek(now, tz);
    prevStart = new Date(start.getTime() - 7 * DAY_MS);
    spanMs = 7 * DAY_MS;
  } else if (period === 'month') {
    const p = zonedParts(now, tz);
    start = startOfMonth(now, tz);
    const pm = addMonths(p.y, p.mo, -1);
    prevStart = zonedToUTC(pm.y, pm.mo, 1, 0, 0, 0, tz);
    spanMs = start.getTime() - prevStart.getTime();
  } else {
    const days = period === '30d' ? 30 : 7;
    // "7 days" includes today and the six before it; the previous period
    // is the equal-length window before that.
    const todayStart = startOfDay(now, tz).getTime();
    start = new Date(todayStart - (days - 1) * DAY_MS);
    prevStart = new Date(start.getTime() - days * DAY_MS);
    spanMs = days * DAY_MS;
  }
  const end = new Date(start.getTime() + spanMs);
  const prevEnd = new Date(start.getTime());
  return { start, end, prevStart, prevEnd, period };
}

// Percent change, or null when the previous period had nothing to compare.
function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// Fill a per-day series with zero rows for every local day in [start, end),
// labelled by local day number. rows: [{day: 'YYYY-MM-DD', total, count}]
function fillDays(rows, bounds, tz) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (let t = bounds.start.getTime(); t < bounds.end.getTime(); t += DAY_MS) {
    const label = fmt.format(new Date(t)); // en-CA gives YYYY-MM-DD
    const r = byDay.get(label);
    out.push({ day: label, total: r ? Number(r.total) : 0, count: r ? Number(r.count) : 0 });
  }
  return out;
}

// Fill a per-hour series (0–23) with zeros. rows: [{hour, total, count}]
function fillHours(rows) {
  const byHour = new Map(rows.map((r) => [Number(r.hour), r]));
  const out = [];
  for (let h = 0; h < 24; h++) {
    const r = byHour.get(h);
    out.push({ hour: h, total: r ? Number(r.total) : 0, count: r ? Number(r.count) : 0 });
  }
  return out;
}

// The busiest hour of the day: highest count, earliest hour on a tie.
// Returns null when every hour is zero.
function busiestHour(hours) {
  let best = null;
  for (const h of hours) {
    if (h.count <= 0) continue;
    if (!best || h.count > best.count) best = h;
  }
  return best ? best.hour : null;
}

// 8..11 → "8 to 9 am"; 13..16 → "1 to 2 pm"; 23..2 → "11 to 12 pm"
function hourLabel(h) {
  const name = (x) => {
    const ampm = x < 12 ? 'am' : 'pm';
    let hr = x % 12; if (hr === 0) hr = 12;
    return hr + ' ' + ampm;
  };
  return name(h) + ' to ' + name((h + 1) % 24);
}

module.exports = {
  zonedParts, zonedToUTC, startOfDay, startOfWeek, startOfMonth,
  periodBounds, percentChange, fillDays, fillHours, busiestHour, hourLabel,
};
