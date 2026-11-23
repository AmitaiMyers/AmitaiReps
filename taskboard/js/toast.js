// One toast at a time, at the bottom (above the composer). Actions are named handlers, e.g. { label: 'Undo', name: 'undo' },
// so they run through the same event dispatch as every other button.

import { animateToastIn } from './motion.js';
import { esc } from './util.js';

const toast = document.getElementById('toast');

export const TOAST_MS = { info: 3500, action: 5000 };

let hideTimer = null;

export function hideToast() {
  clearTimeout(hideTimer);
  toast.hidden = true;
}

/**
 * @param {string} message
 * @param {{ tone?: 'info' | 'error', action?: { label: string, name: string } | null }} options
 * Errors stay until dismissed; others disappear on their own (longer when they offer an action).
 */
export function showToast(message, { tone = 'info', action = null } = {}) {
  clearTimeout(hideTimer);
  toast.className = `toast toast-${tone}`;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <span class="toast-message">${esc(message)}</span>
    ${action === null ? '' : `<button type="button" class="toast-action" data-action="${esc(action.name)}">${esc(action.label)}</button>`}
    <button type="button" class="toast-close" data-action="dismiss-toast" aria-label="Dismiss">×</button>`;
  toast.hidden = false;
  animateToastIn(toast);
  if (tone !== 'error') {
    hideTimer = setTimeout(hideToast, action === null ? TOAST_MS.info : TOAST_MS.action);
  }
}

export const handlers = {
  click: {
    'dismiss-toast': () => hideToast(),
  },
};
