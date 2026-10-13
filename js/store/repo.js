// Repository: the only module the UI uses to read and write data.
// Reads are synchronous from an in-memory cache loaded at start-up;
// writes go through to the storage adapter before the cache is updated.
import { DEFAULT_EXERCISES, DEFAULT_PLANS, USER_ID, defaultSettings } from '../data/defaults.js';
import { DEFAULT_FOODS } from '../data/foods.js';
import { STORES, createIndexedDbAdapter, createMemoryAdapter } from './adapters.js';

const EXPORT_FORMAT = 'lean-coach-export';
const EXPORT_VERSION = 1;

let adapter = null;
const cache = new Map();

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function loadAll() {
  for (const s of STORES) cache.set(s, await adapter.getAll(s));
}

async function seed() {
  const settings = defaultSettings();
  for (const f of DEFAULT_FOODS) await adapter.put('foodItems', { ...f, userId: USER_ID });
  for (const e of DEFAULT_EXERCISES) await adapter.put('exercises', { ...e, userId: USER_ID });
  for (const p of DEFAULT_PLANS) await adapter.put('workoutPlans', { ...p, userId: USER_ID });
  await adapter.put('settings', { ...settings, userId: USER_ID, seeded: true });
}

export async function init(customAdapter) {
  if (customAdapter) {
    adapter = customAdapter;
  } else {
    try {
      adapter = await createIndexedDbAdapter();
    } catch (err) {
      console.warn('IndexedDB unavailable, data will not persist:', err);
      adapter = createMemoryAdapter();
    }
  }
  await loadAll();
  if (!cache.get('settings').some((s) => s.id === 'main')) {
    await seed();
    await loadAll();
  }
  return { persistent: adapter.kind !== 'memory', kind: adapter.kind };
}

export const isPersistent = () => adapter?.kind !== 'memory';

export function list(store) {
  return cache.get(store) || [];
}

export function get(store, id) {
  return list(store).find((r) => r.id === id) || null;
}

/** Insert or update. Returns the stored record. */
export async function save(store, record) {
  const now = new Date().toISOString();
  const existing = record.id ? get(store, record.id) : null;
  const rec = {
    ...record,
    id: record.id || newId(),
    userId: USER_ID,
    createdAt: existing?.createdAt || record.createdAt || now,
    updatedAt: now,
  };
  await adapter.put(store, rec);
  const arr = list(store);
  const i = arr.findIndex((r) => r.id === rec.id);
  if (i >= 0) arr[i] = rec;
  else arr.push(rec);
  return rec;
}

export async function remove(store, id) {
  await adapter.remove(store, id);
  const arr = list(store);
  const i = arr.findIndex((r) => r.id === id);
  if (i >= 0) arr.splice(i, 1);
}

export function settings() {
  return get('settings', 'main');
}

export async function saveSettings(patch) {
  const cur = settings();
  return save('settings', {
    ...cur,
    ...patch,
    profile: { ...cur.profile, ...(patch.profile || {}) },
    goals: { ...cur.goals, ...(patch.goals || {}) },
  });
}

/** Change goals and keep a dated record of what changed and why. */
export async function changeGoals(goalsPatch, reason, date) {
  const cur = settings();
  const entry = { date, reason, changes: {} };
  for (const [k, v] of Object.entries(goalsPatch)) {
    if (cur.goals[k] !== v) entry.changes[k] = { from: cur.goals[k], to: v };
  }
  if (!Object.keys(entry.changes).length) return cur;
  return saveSettings({ goals: goalsPatch, goalHistory: [...(cur.goalHistory || []), entry].slice(-50) });
}

export function exportAll({ includePhotos = true } = {}) {
  const data = {};
  for (const s of STORES) {
    if (s === 'photos' && !includePhotos) continue;
    data[s] = list(s);
  }
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Replace all data with a previously exported backup. Throws on an invalid file. */
export async function importAll(backup) {
  if (!backup || backup.format !== EXPORT_FORMAT || typeof backup.data !== 'object') {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองข้อมูลของ Lean Coach');
  }
  if (backup.version > EXPORT_VERSION) throw new Error('ไฟล์สำรองมาจากเวอร์ชันที่ใหม่กว่าแอปนี้');
  const main = (backup.data.settings || []).find((s) => s && s.id === 'main');
  if (!main || !main.profile || !main.goals) throw new Error('ไฟล์สำรองไม่มีข้อมูลการตั้งค่า');
  for (const s of STORES) {
    const rows = backup.data[s];
    if (rows === undefined) continue; // e.g. backup made without photos: keep current photos
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r.id !== 'string')) {
      throw new Error(`ข้อมูลส่วน "${s}" ในไฟล์สำรองไม่ถูกต้อง`);
    }
  }
  for (const s of STORES) {
    const rows = backup.data[s];
    if (rows === undefined) continue;
    await adapter.clear(s);
    for (const r of rows) await adapter.put(s, { ...r, userId: USER_ID });
  }
  await loadAll();
}

/** Delete everything and start again from the defaults. */
export async function wipe() {
  for (const s of STORES) await adapter.clear(s);
  await seed();
  await loadAll();
}
