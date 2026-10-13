// Cloud sync: account session, when to sync, and the state shown in Settings.
// The merge rules live in syncCore.js; the HTTP calls in supabase.js.
import { SUPABASE_KEY, SUPABASE_URL } from '../config.js';
import { STORES } from '../store/adapters.js';
import * as repo from '../store/repo.js';
import { CloudError, createSupabase } from './supabase.js';
import { createSync } from './syncCore.js';

const SESSION_KEY = 'lc.session';
const META_KEY = 'lc.sync';
const LINKED_KEY = 'lc.syncUser'; // account this device's data belongs to
const PHOTOS_KEY = 'lc.syncPhotos';

const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked: sync state just won't survive a reload */
    }
  },
};

export const state = {
  configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
  user: null,
  status: 'off', // off | idle | syncing | offline | error
  lastSyncAt: null,
  error: null,
  pending: 0,
};

const watchers = new Set();
/** Subscribe to state changes (status line in Settings). */
export function onUpdate(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
function update(patch) {
  Object.assign(state, patch);
  for (const fn of watchers) fn(state);
}

let api = null;
let engine = null;
let session = null;
let timer = null;
let dataChanged = () => {};

export const syncPhotos = () => store.get(PHOTOS_KEY) === true;

const meta = {
  get: (key) => (store.get(META_KEY) || {})[key] ?? null,
  set: (key, value) => store.set(META_KEY, { ...(store.get(META_KEY) || {}), [key]: value }),
};

function setSession(next) {
  session = next;
  store.set(SESSION_KEY, next);
  update({ user: next ? next.user : null, status: next ? 'idle' : 'off', error: null });
}

async function getToken() {
  if (!session) throw new CloudError('ยังไม่ได้เข้าสู่ระบบ', 401);
  if (session.expiresAt - 60_000 < Date.now()) {
    try {
      const next = await api.refresh(session.refreshToken);
      session = next;
      store.set(SESSION_KEY, next);
    } catch (err) {
      if (err.status >= 400 && err.status < 500) {
        setSession(null);
        throw new CloudError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
      }
      throw err;
    }
  }
  return session.accessToken;
}

async function countPending() {
  update({ pending: (await repo.queueAll()).length });
}

/** Sync now. Never throws: the outcome is in `state`. */
export async function syncNow() {
  if (!session) return;
  clearTimeout(timer);
  update({ status: 'syncing', error: null });
  try {
    const result = await engine.run();
    update({ status: 'idle', lastSyncAt: Date.now() });
    await countPending();
    if (result.changed) dataChanged();
  } catch (err) {
    console.warn('sync failed:', err);
    if (session) update({ status: err.status === 0 ? 'offline' : 'error', error: err.message });
    await countPending();
  }
}

function schedule(delay) {
  if (!session) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

async function enqueueStores(stores) {
  for (const s of stores) {
    for (const rec of repo.list(s)) await engine.enqueue({ store: s, id: rec.id, deleted: false, updatedAt: rec.updatedAt });
  }
}

/**
 * Link this device to an account. If the device holds another account's data,
 * `confirmReplace()` must resolve true before that data is removed.
 */
async function link(next, confirmReplace) {
  const linked = store.get(LINKED_KEY);
  const switching = Boolean(linked && linked !== next.user.id);
  if (switching && !(await confirmReplace())) {
    await api.signOut(next.accessToken);
    return false;
  }
  if (switching) {
    await repo.clearLocal();
    store.set(META_KEY, null);
  }
  store.set(LINKED_KEY, next.user.id);
  setSession(next);
  await syncNow();
  // A brand-new account on a device that was just emptied: start from the defaults and upload them.
  if (await repo.ensureSeeded()) {
    await enqueueStores(STORES.filter((s) => s !== 'photos'));
    await syncNow();
  }
  dataChanged();
  return true;
}

export async function signIn(email, password, confirmReplace) {
  return link(await api.signIn(email, password), confirmReplace);
}

/** Returns 'linked', 'confirm-email' (account created, e-mail confirmation pending) or 'cancelled'. */
export async function signUp(email, password, confirmReplace) {
  const next = await api.signUp(email, password);
  if (!next) return 'confirm-email';
  return (await link(next, confirmReplace)) ? 'linked' : 'cancelled';
}

/** Stop syncing. Data stays on this device and keeps being queued for the next sign-in. */
export async function signOut() {
  clearTimeout(timer);
  const token = session?.accessToken;
  setSession(null);
  if (token) await api.signOut(token);
}

export async function setSyncPhotos(on) {
  store.set(PHOTOS_KEY, on ? true : null);
  if (on && session) {
    await enqueueStores(['photos']);
    engine.rewind(); // photos already on the server are older than the pull position
    await syncNow();
  }
}

export function init(onDataChanged) {
  if (!state.configured) return;
  dataChanged = onDataChanged;
  api = createSupabase({ url: SUPABASE_URL, key: SUPABASE_KEY });
  engine = createSync({ repo, remote: api.remote(getToken), meta, includePhotos: syncPhotos });

  // Once a device belongs to an account, every change is queued, signed in or not.
  repo.onChange(async (change) => {
    if (!store.get(LINKED_KEY)) return;
    await engine.enqueue(change);
    schedule(2000);
  });

  const saved = store.get(SESSION_KEY);
  if (saved?.refreshToken && saved?.user?.id) {
    session = saved;
    update({ user: saved.user, status: 'idle' });
    schedule(0);
  }
  window.addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0);
  });
}
