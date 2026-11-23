// Small DOM side effects around rendering: post-render hooks, textarea autosize, keyboard inset,
// the "page is scrolled" flag and the "Saved" indicator.

let afterRenderQueue = [];
let afterNavigationQueue = [];
let savedTimer = null;

const SAVED_VISIBLE_MS = 1500;

/** Runs after the next re-render of the current page (dropped if the user navigates away first). */
export function afterRender(callback) {
  afterRenderQueue.push(callback);
}

/** Runs after the next page change has rendered (e.g. focus the composer of a just-created project). */
export function afterNavigation(callback) {
  afterNavigationQueue.push(callback);
}

export function flushRenderHooks(root, { navigated }) {
  const queue = navigated ? afterNavigationQueue : afterRenderQueue;
  afterRenderQueue = [];
  if (navigated) afterNavigationQueue = [];
  for (const callback of queue) callback(root);
}

/** Grows a textarea to fit its content. */
export function autosize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

/** iOS overlays the keyboard on the page; expose its height so the composer can sit above it. */
export function trackKeyboardInset() {
  const viewport = window.visualViewport;
  if (viewport === null || viewport === undefined) return;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  update();
}

/** Toggles html.is-scrolled, which fades in the app bar's hairline. */
export function trackScrolled() {
  let scheduled = false;
  const update = () => {
    scheduled = false;
    document.documentElement.classList.toggle('is-scrolled', window.scrollY > 4);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}

/** Briefly shows "Saved ✓" on pages that have a save indicator (the item page). */
export function flashSaved() {
  const indicator = document.querySelector('.save-indicator');
  if (indicator === null) return;
  clearTimeout(savedTimer);
  indicator.classList.add('is-visible');
  savedTimer = setTimeout(() => indicator.classList.remove('is-visible'), SAVED_VISIBLE_MS);
}
