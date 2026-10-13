// Storage adapters. The rest of the app only talks to the repository
// (repo.js), which needs these four async methods. To move to a server
// database later, implement the same interface over HTTP and pass it to
// repo.init() — no UI code has to change.
//
//   getAll(store) -> Promise<object[]>
//   put(store, record) -> Promise<void>      (record.id is the key)
//   remove(store, id) -> Promise<void>
//   clear(store) -> Promise<void>

export const STORES = [
  'settings', // Users + UserProfiles + UserGoals (one document, id "main")
  'weightLogs',
  'waistLogs',
  'foodItems',
  'foodLogs',
  'mealTemplates',
  'workoutPlans',
  'exercises',
  'workoutSessions', // WorkoutSets are embedded as session.sets
  'activityLogs',
  'photos',
  'weeklyReports',
];

const DB_NAME = 'lean-coach';
const DB_VERSION = 1;

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createIndexedDbAdapter() {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    for (const s of STORES) {
      if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    }
  };
  const db = await wrap(open);
  const tx = (store, mode) => db.transaction(store, mode).objectStore(store);
  return {
    kind: 'indexeddb',
    getAll: (store) => wrap(tx(store, 'readonly').getAll()),
    put: (store, record) => wrap(tx(store, 'readwrite').put(record)).then(() => {}),
    remove: (store, id) => wrap(tx(store, 'readwrite').delete(id)).then(() => {}),
    clear: (store) => wrap(tx(store, 'readwrite').clear()).then(() => {}),
  };
}

/** Non-persistent fallback (private windows that block storage, and tests). */
export function createMemoryAdapter() {
  const data = new Map(STORES.map((s) => [s, new Map()]));
  return {
    kind: 'memory',
    getAll: async (store) => [...data.get(store).values()].map((r) => structuredClone(r)),
    put: async (store, record) => void data.get(store).set(record.id, structuredClone(record)),
    remove: async (store, id) => void data.get(store).delete(id),
    clear: async (store) => void data.get(store).clear(),
  };
}
