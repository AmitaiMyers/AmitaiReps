// Undo for one action at a time: snapshot the (plain-data) state, apply the change, offer "Undo" in a toast.
// If anything else changed after that action, undo is refused rather than silently reverting the newer change too.

import { getRevision, getState, replaceState } from './store.js';
import { showToast } from './toast.js';
import { assert } from './util.js';

let pending = null;

/** Applies `mutate` and shows `message` with an Undo button. Returns whatever `mutate` returns. */
export function withUndo(message, mutate) {
  const snapshot = structuredClone(getState());
  const result = mutate();
  pending = { snapshot, revision: getRevision() };
  showToast(message, { action: { label: 'Undo', name: 'undo' } });
  return result;
}

export const handlers = {
  click: {
    undo: () => {
      assert(pending !== null, 'There is nothing to undo');
      const { snapshot, revision } = pending;
      pending = null;
      if (revision !== getRevision()) {
        showToast('Can’t undo: something else changed since.');
        return;
      }
      replaceState(snapshot);
      showToast('Undone');
    },
  },
};
