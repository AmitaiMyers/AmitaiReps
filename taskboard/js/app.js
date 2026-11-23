// App entry point: loads data, renders the current route and wires up events, gestures and PWA plumbing.
//
// Rendering: each view returns an HTML string, and idiomorph morphs #app into it. Unchanged DOM nodes are kept
// (focus, scroll and CSS transitions survive), elements with the same id are moved instead of recreated, and
// motion.js animates what moved, appeared or disappeared. Page changes run inside a View Transition.

import { loadState } from './db.js';
import { listenForEvents, registerHandlers, setRenderer } from './dispatch.js';
import { autosize, flashSaved, flushRenderHooks, trackKeyboardInset, trackScrolled } from './effects.js';
import { enableGestures } from './gestures.js';
import { animateLayout, captureLayout, fadeIn, withViewTransition } from './motion.js';
import { getLastTab, setLastTab } from './prefs.js';
import { handlers as pwaHandlers, setupPwa } from './pwa.js';
import { onRouteChanged, parseRoute, paths, replaceRoute } from './router.js';
import { createEmptyState } from './schema.js';
import { closeSheet } from './sheet.js';
import { flushSave, hasItem, hasProject, initStore, onSaved } from './store.js';
import { handlers as toastHandlers, showToast } from './toast.js';
import { handlers as undoHandlers } from './undo.js';
import { assert } from './util.js';
import { Idiomorph } from './vendor/idiomorph.esm.js';
import { handlers as homeHandlers, renderHome } from './views/home.js';
import { handlers as itemHandlers, renderItem } from './views/item.js';
import { handlers as projectSettingsHandlers, renderProjectSettings } from './views/project-settings.js';
import { enableBoardTracking, handlers as projectHandlers, renderProject } from './views/project.js';
import { handlers as settingsHandlers, renderSettings } from './views/settings.js';
import { handlers as sharedHandlers } from './views/shared.js';

const root = document.getElementById('app');
const scrollByHash = new Map();
const keptScroll = new Map();

registerHandlers([
  sharedHandlers,
  homeHandlers,
  projectHandlers,
  itemHandlers,
  projectSettingsHandlers,
  settingsHandlers,
  undoHandlers,
  toastHandlers,
  pwaHandlers,
]);

// ---------- Rendering ----------

/** A route that cannot be shown (deleted project/item, unknown URL) redirects instead. Returns null when renderable. */
function redirectFor(route) {
  if (route.name === 'notFound') return paths.home();
  if (Object.hasOwn(route, 'projectId') && !hasProject(route.projectId)) return paths.home();
  if (route.name === 'item' && !hasItem(route.itemId)) return paths.home();
  if (route.name === 'projectRoot') return paths.project(route.projectId, getLastTab(route.projectId));
  return null;
}

function renderRoute(route) {
  switch (route.name) {
    case 'home':
      return renderHome(route);
    case 'settings':
      return renderSettings();
    case 'project':
      setLastTab(route.projectId, route.kind);
      return renderProject(route);
    case 'projectSettings':
      return renderProjectSettings(route);
    case 'item':
      return renderItem(route);
    default:
      throw new Error(`No page for route "${route.name}"`);
  }
}

/** Remembers horizontal board scroll (and any other [data-keep-scroll] element) per page. */
function captureKeptScroll() {
  for (const element of root.querySelectorAll('[data-keep-scroll]')) {
    keptScroll.set(element.dataset.keepScroll, { left: element.scrollLeft, top: element.scrollTop });
  }
}

function restoreKeptScroll() {
  for (const element of root.querySelectorAll('[data-keep-scroll]')) {
    const saved = keptScroll.has(element.dataset.keepScroll) ? keptScroll.get(element.dataset.keepScroll) : { left: 0, top: 0 };
    element.scrollLeft = saved.left;
    element.scrollTop = saved.top;
  }
}

/**
 * @param {{ animate?: 'layout' | 'none', navigated?: boolean }} options
 *   animate 'layout' slides moved rows, fades in new ones and fades out removed ones (same-page updates).
 */
function render({ animate = 'layout', navigated = false } = {}) {
  const route = parseRoute(location.hash);
  const redirect = redirectFor(route);
  if (redirect !== null) {
    replaceRoute(redirect);
    return;
  }
  captureKeptScroll();
  const before = animate === 'layout' ? captureLayout(root) : null;
  Idiomorph.morph(root, renderRoute(route), {
    morphStyle: 'innerHTML',
    callbacks: { beforeNodeMorphed: (oldNode) => !isFieldBeingTyped(oldNode) },
  });
  if (navigated) restoreKeptScroll();
  root.querySelectorAll('[data-autosize]').forEach(autosize);
  if (before !== null) animateLayout(root, before);
  // After a page change, focus and hooks wait until the page is interactive (see finishPageChange).
  if (!navigated) flushRenderHooks(root, { navigated: false });
}

/** Input types that are picked or clicked rather than typed into; those are safe to re-render while focused. */
const NON_TYPED_INPUTS = new Set(['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'color', 'range']);

/**
 * The focused text field is left exactly as it is during a re-render, so what the user is typing is never overwritten.
 * (Focused buttons still update: only typed fields are protected.)
 */
function isFieldBeingTyped(node) {
  if (node !== document.activeElement) return false;
  if (node instanceof HTMLTextAreaElement) return true;
  return node instanceof HTMLInputElement && !NON_TYPED_INPUTS.has(node.type);
}

/** Moves focus to the new page's heading (screen readers announce it); navigation hooks may then focus something else. */
function finishPageChange() {
  const heading = root.querySelector('h1');
  assert(heading !== null, 'Every page needs an h1');
  heading.focus({ preventScroll: true });
  flushRenderHooks(root, { navigated: true });
}

function onHashChange(event) {
  scrollByHash.set(new URL(event.oldURL).hash, window.scrollY);
  const direction = onRouteChanged();
  closeSheet();
  const showPage = () => {
    render({ animate: 'none', navigated: true });
    window.scrollTo(0, scrollByHash.has(location.hash) ? scrollByHash.get(location.hash) : 0);
  };
  if (direction !== 'replace') {
    withViewTransition(direction, showPage, finishPageChange);
    return;
  }
  // Tab switches: the segmented thumb slides and the content cross-fades.
  showPage();
  finishPageChange();
  const panel = root.querySelector('#panel');
  if (panel !== null) fadeIn(panel);
}

// ---------- Startup ----------

function reportError(message) {
  showToast(`Something went wrong: ${message}`, { tone: 'error' });
}

function installErrorReporting() {
  window.addEventListener('error', (event) => reportError(event.message));
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportError(reason instanceof Error ? reason.message : String(reason));
  });
}

async function start() {
  installErrorReporting();
  listenForEvents();
  enableGestures();
  enableBoardTracking();
  trackKeyboardInset();
  trackScrolled();
  setRenderer(render);
  history.scrollRestoration = 'manual';

  const saved = await loadState();
  initStore(saved === null ? createEmptyState() : saved);
  onSaved(flashSaved);

  window.addEventListener('hashchange', onHashChange);
  onRouteChanged();
  render({ animate: 'none', navigated: true });
  finishPageChange();

  // Save immediately when the app is backgrounded or closed (phones may kill it without warning).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', () => flushSave());

  setupPwa({ flushBeforeReload: flushSave });
}

start();
