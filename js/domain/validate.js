// Input validation shared by every form.
import { isValid, today } from './dates.js';

export class ValidationError extends Error {}

/** Accepts "80.5" and "80,5". Returns NaN for anything that is not a plain number. */
export function parseNum(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export function num(v, { label, min, max, integer = false, optional = false }) {
  if (optional && String(v ?? '').trim() === '') return null;
  const n = parseNum(v);
  if (!Number.isFinite(n)) throw new ValidationError(`${label}: กรุณากรอกตัวเลข`);
  if (integer && !Number.isInteger(n)) throw new ValidationError(`${label}: ต้องเป็นจำนวนเต็ม`);
  if (min != null && n < min) throw new ValidationError(`${label}: ต้องไม่น้อยกว่า ${min}`);
  if (max != null && n > max) throw new ValidationError(`${label}: ต้องไม่เกิน ${max}`);
  return n;
}

export function date(v, { label = 'วันที่', allowFuture = false } = {}) {
  if (!isValid(v)) throw new ValidationError(`${label}: รูปแบบวันที่ไม่ถูกต้อง`);
  if (!allowFuture && v > today()) throw new ValidationError(`${label}: ยังไม่ถึงวันที่นี้`);
  return v;
}

export function text(v, { label, max = 200, optional = true } = {}) {
  const s = String(v ?? '').trim();
  if (!optional && !s) throw new ValidationError(`${label}: กรุณากรอกข้อมูล`);
  if (s.length > max) throw new ValidationError(`${label}: ยาวเกิน ${max} ตัวอักษร`);
  return s;
}

export const LIMITS = {
  weightKg: { label: 'น้ำหนัก (กก.)', min: 30, max: 250 },
  waistCm: { label: 'รอบเอว (ซม.)', min: 40, max: 200 },
  grams: { label: 'ปริมาณ (กรัม)', min: 0.1, max: 5000 },
  steps: { label: 'จำนวนก้าว', min: 0, max: 100000, integer: true },
  minutes: { label: 'ระยะเวลา (นาที)', min: 1, max: 600, integer: true },
  dumbbellKg: { label: 'น้ำหนักดัมเบล (กก.)', min: 0, max: 200 },
  reps: { label: 'จำนวนครั้ง', min: 1, max: 600, integer: true },
};
