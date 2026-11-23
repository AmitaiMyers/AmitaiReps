// Hash-based routing (#/p/<id>/missions etc.), which gives the phone's back gesture/button for free.
//
// Every history entry is stamped with its depth inside the app, so the header back button can use
// history.back() when there is an in-app page behind it, and otherwise jump to the logical parent page.

import { KINDS } from './constants.js';

const KIND_BY_TAB = Object.fromEntries(Object.entries(KINDS).map(([kind, config]) => [config.tab, kind]));

export const paths = {
  home: () => '#/',
  starred: () => '#/starred',
  settings: () => '#/settings',
  projectRoot: (projectId) => `#/p/${projectId}`,
  project: (projectId, kind) => `#/p/${projectId}/${KINDS[kind].tab}`,
  projectSettings: (projectId) => `#/p/${projectId}/settings`,
  item: (itemId) => `#/i/${itemId}`,
};

export function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter((part) => part !== '');
  const [section, id, sub] = parts;
  if (parts.length === 0) return { name: 'home', tab: 'projects' };
  if (parts.length === 1 && section === 'starred') return { name: 'home', tab: 'starred' };
  if (parts.length === 1 && section === 'settings') return { name: 'settings' };
  if (parts.length === 2 && section === 'i') return { name: 'item', itemId: id };
  if (parts.length === 2 && section === 'p') return { name: 'projectRoot', projectId: id };
  if (parts.length === 3 && section === 'p' && sub === 'settings') return { name: 'projectSettings', projectId: id };
  if (parts.length === 3 && section === 'p' && Object.hasOwn(KIND_BY_TAB, sub)) {
    return { name: 'project', projectId: id, kind: KIND_BY_TAB[sub] };
  }
  return { name: 'notFound' };
}

let currentDepth = -1;
let replacing = false;
let navigating = false;

/**
 * Call on startup and on every 'hashchange'. Stamps new history entries with their depth and reports how we got here:
 * 'initial' (app start), 'forward' (deeper page), 'back' (shallower page) or 'replace' (tab switch / redirect).
 */
export function onRouteChanged() {
  const previousDepth = currentDepth;
  const wasReplacing = replacing;
  if (history.state === null) {
    const depth = replacing ? currentDepth : currentDepth + 1;
    history.replaceState({ depth: Math.max(depth, 0) }, '');
  }
  currentDepth = history.state.depth;
  replacing = false;
  navigating = false;
  if (previousDepth === -1) return 'initial';
  if (wasReplacing || currentDepth === previousDepth) return 'replace';
  return currentDepth > previousDepth ? 'forward' : 'back';
}

/** True between starting a navigation and its 'hashchange' (which renders the new page). */
export function isNavigating() {
  return navigating;
}

export function navigate(hash) {
  if (location.hash === hash) return;
  navigating = true;
  location.hash = hash;
}

/** Navigates without adding a history entry (used for tabs and redirects). */
export function replaceRoute(hash) {
  if (location.hash === hash) return;
  navigating = true;
  replacing = true;
  location.replace(hash);
}

export function goBack(fallbackHash) {
  if (currentDepth > 0) {
    navigating = true;
    history.back();
  } else {
    replaceRoute(fallbackHash);
  }
}
