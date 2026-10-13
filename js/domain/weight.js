// Weight-trend calculations. Pure functions.
import { addDays, diffDays, range, weekStart } from './dates.js';

/** Collapse logs to one value per date (mean of that day's weigh-ins). Returns Map(date -> kg). */
export function dailyWeights(logs) {
  const acc = new Map();
  for (const l of logs) {
    const a = acc.get(l.date) || { sum: 0, n: 0 };
    a.sum += l.kg;
    a.n += 1;
    acc.set(l.date, a);
  }
  const out = new Map();
  for (const [d, a] of acc) out.set(d, a.sum / a.n);
  return out;
}

/** Mean of the days that have a weigh-in within [from, to]. */
export function averageBetween(daily, from, to) {
  let sum = 0;
  let n = 0;
  for (const [d, kg] of daily) {
    if (d >= from && d <= to) {
      sum += kg;
      n += 1;
    }
  }
  return { avg: n ? sum / n : null, n };
}

/** 7-day average ending on `date` (the 7 calendar days date-6..date). */
export function rollingAverage(daily, date, window = 7) {
  return averageBetween(daily, addDays(date, -(window - 1)), date);
}

/** Calendar-week (Mon–Sun) average for the week starting at `monday`. */
export function weekAverage(daily, monday) {
  return averageBetween(daily, monday, addDays(monday, 6));
}

/** Series for charting: one row per day with the raw value and the 7-day average. */
export function trendSeries(daily, from, to, minPoints = 2) {
  return range(from, to).map((date) => {
    const r = rollingAverage(daily, date);
    return { date, kg: daily.has(date) ? daily.get(date) : null, avg: r.n >= minPoints ? r.avg : null };
  });
}

/**
 * Least-squares slope of daily weights in the `days` calendar days ending at `end`.
 * Returns kg/week, or null when there are too few points or too short a span.
 */
export function weeklyRate(daily, end, days = 21, { minPoints = 6, minSpan = 10 } = {}) {
  const from = addDays(end, -(days - 1));
  const pts = [];
  for (const [d, kg] of daily) {
    if (d >= from && d <= end) pts.push([diffDays(from, d), kg]);
  }
  if (pts.length < minPoints) return null;
  const xs = pts.map((p) => p[0]);
  if (Math.max(...xs) - Math.min(...xs) < minSpan) return null;
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? null : (num / den) * 7;
}

export function latestLog(logs) {
  let best = null;
  for (const l of logs) {
    if (!best || l.date > best.date || (l.date === best.date && (l.time || '') > (best.time || ''))) best = l;
  }
  return best;
}

/** 0..1 progress from start weight toward target (clamped). */
export function progressToTarget(startKg, currentKg, targetKg) {
  const total = startKg - targetKg;
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.min(1, Math.max(0, (startKg - currentKg) / total));
}

/** Everything the weight screens need, computed from raw logs. */
export function weightSummary(logs, { today, startKg, targetKg }) {
  const daily = dailyWeights(logs);
  const latest = latestLog(logs);
  const avg7 = rollingAverage(daily, today);
  const thisMonday = weekStart(today);
  const thisWeek = weekAverage(daily, thisMonday);
  const lastWeek = weekAverage(daily, addDays(thisMonday, -7));
  // The trend value prefers the 7-day average because single weigh-ins swing with water and glycogen.
  const current = avg7.n >= 3 ? avg7.avg : latest ? latest.kg : null;
  return {
    daily,
    latest,
    avg7,
    thisWeek,
    lastWeek,
    weekChange: thisWeek.n && lastWeek.n ? thisWeek.avg - lastWeek.avg : null,
    current,
    totalLost: current != null && Number.isFinite(startKg) ? startKg - current : null,
    rate: weeklyRate(daily, today),
    progress: current != null ? progressToTarget(startKg, current, targetKg) : null,
  };
}
