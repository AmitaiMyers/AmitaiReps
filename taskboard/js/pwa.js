// Progressive Web App plumbing: service worker + update prompt, install prompt (Android), persistent storage.

import { showToast } from './toast.js';
import { assert } from './util.js';

let installPromptEvent = null;
let waitingWorker = null;
let reloadRequested = false;
let flushBeforeReload = null;
let storagePersistence = 'checking'; // 'checking' | 'persistent' | 'best-effort' | 'unsupported'

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function canPromptInstall() {
  return installPromptEvent !== null;
}

export async function promptInstall() {
  const event = installPromptEvent;
  installPromptEvent = null;
  await event.prompt();
}

export function getStoragePersistence() {
  return storagePersistence;
}

/** Asks the browser not to evict our data under storage pressure. */
async function requestPersistentStorage() {
  if (navigator.storage === undefined || typeof navigator.storage.persist !== 'function') {
    storagePersistence = 'unsupported';
    return;
  }
  const granted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  storagePersistence = granted ? 'persistent' : 'best-effort';
}

function offerUpdate(worker) {
  waitingWorker = worker;
  showToast('A new version is available', { action: { label: 'Update', name: 'apply-update' } });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // The service worker serves cached files until the next deploy, which would hide local edits during development.
  if (location.hostname === 'localhost') return;

  const registration = await navigator.serviceWorker.register('./sw.js');

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) location.reload();
  });

  if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
    offerUpdate(registration.waiting);
  }
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker.addEventListener('statechange', () => {
      // Only an *update* waits; the very first install has no controller yet and needs no prompt.
      if (worker.state === 'installed' && navigator.serviceWorker.controller !== null) offerUpdate(worker);
    });
  });

  // Home-screen apps are rarely fully reloaded, so look for a new version whenever the app is shown.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Update checks are opportunistic: a failed check (e.g. offline) is simply retried next time.
    registration.update().catch((error) => console.warn('Update check failed', error));
  });
}

export function setupPwa({ flushBeforeReload: flush }) {
  flushBeforeReload = flush;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPromptEvent = event;
  });
  window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
  });
  requestPersistentStorage();
  registerServiceWorker();
}

export const handlers = {
  click: {
    'apply-update': async () => {
      assert(waitingWorker !== null, 'No update is waiting');
      await flushBeforeReload();
      reloadRequested = true;
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    },
    'install-app': () => promptInstall(),
  },
};
