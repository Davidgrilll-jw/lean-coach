// Date helpers. All dates are local-calendar strings "YYYY-MM-DD" so that
// day arithmetic never depends on time zones or the time of day.

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const WEEKDAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export function toStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValid(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toStr(parse(s)) === s;
}

export function today() {
  return toStr(new Date());
}

export function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

/** Number of days from a to b (b - a). */
export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}

/** Monday of the week containing s. */
export function weekStart(s) {
  const wd = (parse(s).getDay() + 6) % 7;
  return addDays(s, -wd);
}

/** Inclusive list of dates from..to. */
export function range(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekday(s) {
  return parse(s).getDay();
}

export function fmtShort(s) {
  const d = parse(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtLong(s) {
  const d = parse(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export function fmtRelative(s, ref = today()) {
  const n = diffDays(s, ref);
  if (n === 0) return 'วันนี้';
  if (n === 1) return 'เมื่อวาน';
  if (n === -1) return 'พรุ่งนี้';
  return fmtLong(s);
}
