// IndexedDB persistence. The whole app state is stored as a single record — simple, and plenty fast for personal use.

const DB_NAME = 'taskboard';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const STATE_KEY = 'state';

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb() {
  if (dbPromise === null) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    dbPromise = requestToPromise(request);
  }
  return dbPromise;
}

/** Returns the saved state, or null on first launch. */
export async function loadState() {
  const db = await openDb();
  const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
  const saved = await requestToPromise(store.get(STATE_KEY));
  return saved === undefined ? null : saved;
}

export async function saveState(state) {
  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
