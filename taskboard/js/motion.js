// All animation goes through this module, so "reduce motion" is honored in one place. DESIGN.md §6.
//
// Layout animation ("FLIP"): before a re-render we record where every [data-flip] element is; after the
// DOM is morphed we slide moved elements from their old spot, fade in new ones, and fade out a "ghost"
// copy of removed ones, while their neighbours close the gap.

import { assert } from './util.js';

/** How long a changed row stays in place before moving to its new group (so you see what happened). */
const SETTLE_MS = 350;

export const HAPTIC = { tap: 10, press: 15, remove: [10, 40, 10] };

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion() {
  return reducedMotionQuery.matches;
}

/** Reads a motion token from tokens.css (single source of truth for durations and easings). */
function token(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  assert(value !== '', `Motion token ${name} is not defined`);
  return value;
}

function duration(name) {
  const value = token(name);
  assert(value.endsWith('ms'), `Motion token ${name} must be in ms`);
  return Number(value.slice(0, -2));
}

/** Vibration feedback (Android; iOS web has no vibration API). */
export function haptic(pattern) {
  if (prefersReducedMotion() || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(pattern);
}

/** Lets a change be seen in place before the layout moves. */
export function settle() {
  const ms = prefersReducedMotion() ? 0 : SETTLE_MS;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Layout (FLIP) ----------

function isVisible(rect) {
  return rect.width > 0 && rect.height > 0;
}

/** Records the position of every [data-flip] element (they all have unique ids). */
export function captureLayout(root) {
  const layout = new Map();
  for (const element of root.querySelectorAll('[data-flip]')) {
    assert(element.id !== '', 'Elements with data-flip need an id');
    layout.set(element.id, { element, rect: element.getBoundingClientRect() });
  }
  return layout;
}

function ghostLayer() {
  let layer = document.querySelector('.ghost-layer');
  if (layer === null) {
    layer = document.createElement('div');
    layer.className = 'ghost-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
  }
  return layer;
}

function animateGhostOut(element, rect) {
  const ghost = element;
  ghost.classList.add('ghost');
  ghost.removeAttribute('id');
  Object.assign(ghost.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  ghostLayer().append(ghost);
  ghost
    .animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], {
      duration: duration('--dur-quick'),
      easing: token('--ease-exit'),
      fill: 'forwards',
    })
    .finished.then(() => ghost.remove());
}

/** Animates the difference between `before` (from captureLayout) and the current DOM. */
export function animateLayout(root, before) {
  if (prefersReducedMotion()) return;
  const base = duration('--dur-base');
  const easing = token('--ease-standard');
  for (const element of root.querySelectorAll('[data-flip]')) {
    const now = element.getBoundingClientRect();
    if (!isVisible(now)) continue;
    if (!before.has(element.id)) {
      element.animate([{ opacity: 0, transform: 'translateY(8px) scale(0.98)' }, { opacity: 1, transform: 'none' }], {
        duration: base,
        easing: token('--ease-emphasized'),
      });
      continue;
    }
    const old = before.get(element.id).rect;
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (!isVisible(old) || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) continue;
    element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: base, easing });
  }
  for (const { element, rect } of before.values()) {
    if (!element.isConnected && isVisible(rect)) animateGhostOut(element, rect);
  }
}

// ---------- Small effects ----------

/** A springy "pop" used by the checkbox and star. */
export function pop(element) {
  if (prefersReducedMotion()) return;
  element.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3) rotate(-8deg)' }, { transform: 'scale(1)' }], {
    duration: 280,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  });
}

/** Six dots flying out of a just-starred star. */
export function burst(element) {
  if (prefersReducedMotion()) return;
  const container = document.createElement('span');
  container.className = 'burst';
  const DOTS = 6;
  for (let index = 0; index < DOTS; index += 1) {
    const dot = document.createElement('i');
    const angle = (index / DOTS) * Math.PI * 2;
    dot.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * 18}px, ${Math.sin(angle) * 18}px) scale(0.4)`, opacity: 0 },
      ],
      { duration: 420, easing: token('--ease-emphasized'), fill: 'forwards' },
    );
    container.append(dot);
  }
  element.append(container);
  setTimeout(() => container.remove(), 450);
}

export function fadeIn(element) {
  if (prefersReducedMotion()) return;
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration('--dur-quick'), easing: token('--ease-standard') });
}

export function animateSheetIn(sheet) {
  if (prefersReducedMotion()) return;
  const options = { duration: duration('--dur-slow'), easing: token('--ease-emphasized') };
  sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], options);
  sheet.animate([{ opacity: 0 }, { opacity: 1 }], { ...options, pseudoElement: '::backdrop' });
}

/**
 * Slides a copy of the sheet away. The real <dialog> is closed at once by the caller: while a modal dialog is open
 * (even mid-animation) the rest of the page is inert, so animating the real one would block taps, typing and focus.
 */
export function animateSheetOut(sheet) {
  if (prefersReducedMotion()) return;
  const rect = sheet.getBoundingClientRect(); // includes any drag offset
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim-ghost';
  const ghost = document.createElement('div');
  ghost.className = 'sheet sheet-ghost';
  ghost.innerHTML = sheet.innerHTML;
  for (const element of ghost.querySelectorAll('[id]')) element.removeAttribute('id');
  Object.assign(ghost.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  ghostLayer().append(scrim, ghost);
  const options = { duration: duration('--dur-quick'), easing: token('--ease-exit'), fill: 'forwards' };
  scrim.animate([{ opacity: 1 }, { opacity: 0 }], options);
  ghost
    .animate([{ transform: 'none' }, { transform: `translateY(${rect.height + 40}px)` }], options)
    .finished.then(() => {
      scrim.remove();
      ghost.remove();
    });
}

export function animateToastIn(toast) {
  if (prefersReducedMotion()) return;
  toast.animate([{ opacity: 0, transform: 'translate(-50%, 16px) scale(0.96)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], {
    duration: duration('--dur-base'),
    easing: token('--ease-emphasized'),
  });
}

// ---------- Page transitions ----------

/**
 * Runs `update` inside a View Transition that slides forward/back (where supported), then `whenInteractive`
 * once the new page can take focus. (Inside the update callback rendering is suppressed, so focus() does nothing.)
 * Unsupported browsers and reduced motion just run both immediately.
 */
export function withViewTransition(direction, update, whenInteractive) {
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    update();
    whenInteractive();
    return;
  }
  document.documentElement.dataset.nav = direction;
  const transition = document.startViewTransition(update);
  // `ready` also rejects when the browser merely skips the animation; the page is live either way.
  // A real error thrown by `update` still surfaces through `finished` below.
  transition.ready.then(whenInteractive, whenInteractive);
  transition.finished.finally(() => {
    delete document.documentElement.dataset.nav;
  });
}
