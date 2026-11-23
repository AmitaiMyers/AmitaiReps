// Routes DOM events to named handlers and re-renders after them.
//
//   <button data-action="toggle-star">   → handlers.click['toggle-star'](element, event)
//   <input  data-input="item-title">     → handlers.input['item-title']   (typing never re-renders, so focus stays)
//   <input  data-change="item-due">      → handlers.change['item-due']
//   <form   data-submit="composer-add">  → handlers.submit['composer-add']
//
// After a click/change/submit handler finishes, the page re-renders, unless the handler started a navigation
// (the 'hashchange' that follows renders the new page). A handler may return render options, e.g. { animate: 'none' }.
// Acting on something inside the sheet or the toast closes it first.

import { isNavigating } from './router.js';
import { closeSheet } from './sheet.js';
import { hideToast } from './toast.js';
import { assert } from './util.js';

const EVENT_ATTRIBUTES = { click: 'action', input: 'input', change: 'change', submit: 'submit' };

const registry = Object.fromEntries(Object.keys(EVENT_ATTRIBUTES).map((type) => [type, new Map()]));
let renderer = null;

export function registerHandlers(handlerSets) {
  for (const handlerSet of handlerSets) {
    for (const [type, namedHandlers] of Object.entries(handlerSet)) {
      assert(Object.hasOwn(registry, type), `Unknown handler type "${type}"`);
      for (const [name, handler] of Object.entries(namedHandlers)) {
        assert(!registry[type].has(name), `Duplicate ${type} handler "${name}"`);
        registry[type].set(name, handler);
      }
    }
  }
}

export function setRenderer(render) {
  renderer = render;
}

/** Re-renders the current page (no-op while a navigation is about to render a new one). */
export function requestRender(options = {}) {
  assert(renderer !== null, 'No renderer registered');
  if (!isNavigating()) renderer(options);
}

function handlerFor(type, name) {
  const handler = registry[type].get(name);
  assert(handler !== undefined, `No ${type} handler named "${name}"`);
  return handler;
}

async function run(handler, element, event) {
  if (element.closest('#sheet') !== null) closeSheet({ restoreFocus: false });
  if (element.closest('#toast') !== null) hideToast();
  const options = await handler(element, event);
  requestRender(options === undefined ? {} : options);
}

/** Runs a click handler by name for an element (used by gestures: swipe and long-press). */
export function runAction(name, element) {
  return run(handlerFor('click', name), element, null);
}

export function listenForEvents() {
  for (const [type, attribute] of Object.entries(EVENT_ATTRIBUTES)) {
    document.addEventListener(type, (event) => {
      const element = event.target.closest(`[data-${attribute}]`);
      if (element === null) return;
      const handler = handlerFor(type, element.dataset[attribute]);
      if (type === 'click' || type === 'submit') event.preventDefault();
      if (type === 'input') {
        handler(element, event);
        return;
      }
      run(handler, element, event);
    });
  }
}
