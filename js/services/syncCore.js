// Sync engine, independent of any particular backend.
//
// The device stays the source for the UI (local-first). This engine keeps it
// in step with a remote copy:
//   1. pull rows changed on the server since the last cursor and apply them,
//   2. push the local changes waiting in the queue.
// Conflicts are resolved per record: the most recently edited copy wins.
// Deletions travel as rows with `deleted: true`.
//
// remote = {
//   pageSize,
//   pull(cursor, includePhotos) -> [{ store, id, data, deleted, clientUpdatedAt, updatedAt }]  (oldest first, updatedAt >= cursor)
//   push([{ store, id, data, deleted, clientUpdatedAt }])
// }
// meta = { get(key), set(key, value) }   small persistent key/value store
import { STORES } from '../store/adapters.js';

/** Timestamp for records that were seeded and never edited: any real edit is newer. */
export const EPOCH = '1970-01-01T00:00:00.000Z';

const keyOf = (store, id) => `${store}:${id}`;

export function createSync({ repo, remote, meta, includePhotos = () => false, pushBatch = 50 }) {
  let running = null;
  let again = false;

  /** Remember a local change until it has been pushed. One entry per record: the latest change wins. */
  function enqueue({ store, id, deleted, updatedAt }) {
    return repo.queuePut({ id: keyOf(store, id), store, recId: id, deleted: !!deleted, updatedAt: updatedAt || EPOCH });
  }

  async function runOnce() {
    const photos = includePhotos();
    const skipped = (store) => store === 'photos' && !photos;
    const first = !meta.get('initialized');
    const queue = new Map((await repo.queueAll()).map((e) => [e.id, e]));
    const seen = new Set();
    let cursor = meta.get('cursor') || null;
    let changed = 0;
    let pushed = 0;

    // 1) Pull.
    for (;;) {
      const rows = await remote.pull(cursor, photos);
      for (const row of rows) {
        if (skipped(row.store)) continue;
        const key = keyOf(row.store, row.id);
        seen.add(key);
        const pending = queue.get(key);
        // A local edit made after the server copy stays and will be pushed. On the very first
        // sync the server copy always wins, so a new device never overwrites the account's data.
        if (!first && pending && pending.updatedAt > row.clientUpdatedAt) continue;
        if (pending) {
          await repo.queueRemove(key);
          queue.delete(key);
        }
        const local = repo.get(row.store, row.id);
        if (row.deleted) {
          if (local) {
            await repo.applyRemote(row.store, row.id, null);
            changed += 1;
          }
        } else if (JSON.stringify(local) !== JSON.stringify(row.data)) {
          await repo.applyRemote(row.store, row.id, row.data);
          changed += 1;
        }
      }
      if (rows.length) {
        const next = rows[rows.length - 1].updatedAt;
        const stuck = next === cursor && rows.length >= remote.pageSize;
        cursor = next;
        meta.set('cursor', cursor);
        if (stuck) break;
      }
      if (rows.length < remote.pageSize) break;
    }

    // 2) First sync on this device: whatever exists only here is uploaded.
    if (first) {
      for (const store of STORES) {
        if (skipped(store)) continue;
        for (const rec of repo.list(store)) {
          const key = keyOf(store, rec.id);
          if (!seen.has(key) && !queue.has(key)) await enqueue({ store, id: rec.id, deleted: false, updatedAt: rec.updatedAt });
        }
      }
      meta.set('initialized', true);
    }

    // 3) Push.
    const entries = (await repo.queueAll()).filter((e) => !skipped(e.store));
    for (let i = 0; i < entries.length; i += pushBatch) {
      const batch = entries.slice(i, i + pushBatch);
      await remote.push(
        batch.map((e) => {
          const data = e.deleted ? null : repo.get(e.store, e.recId);
          return { store: e.store, id: e.recId, data, deleted: !data, clientUpdatedAt: e.updatedAt };
        })
      );
      // Keep an entry if the record changed again while the request was in flight.
      const now = new Map((await repo.queueAll()).map((e) => [e.id, e]));
      for (const e of batch) {
        if (now.get(e.id)?.updatedAt === e.updatedAt) await repo.queueRemove(e.id);
      }
      pushed += batch.length;
    }
    return { changed, pushed };
  }

  /** Run a sync. Calls made while one is running are folded into one follow-up run. */
  async function run() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      let total = { changed: 0, pushed: 0 };
      try {
        do {
          again = false;
          const r = await runOnce();
          total = { changed: total.changed + r.changed, pushed: total.pushed + r.pushed };
        } while (again);
        return total;
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** Forget the pull position so the next run fetches everything again (the queue is kept). */
  function rewind() {
    meta.set('cursor', null);
  }

  return { enqueue, run, rewind };
}
