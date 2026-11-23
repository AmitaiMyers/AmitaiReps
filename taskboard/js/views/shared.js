// Actions available on every page: navigation, the mission checkbox, status changes, star, quick-actions menu, delete.
//
// Status changes follow DESIGN.md §6.2: the row first shows its new state in place (pill color, check), pauses
// briefly so you can see it, then the re-render animates it into its new group. Every change can be undone.

import { colorRadios, field, itemTitle, sheetTitle, statusChips, statusSheet } from '../components.js';
import { afterRender } from '../effects.js';
import { icon } from '../icons.js';
import { HAPTIC, burst, haptic, pop, settle } from '../motion.js';
import { goBack, paths, replaceRoute } from '../router.js';
import { closeSheet, openSheet } from '../sheet.js';
import {
  deleteItem,
  getItem,
  getItemStatuses,
  getProject,
  isDone,
  nextStatus,
  toggleDone,
  updateItem,
} from '../store.js';
import { withUndo } from '../undo.js';
import { esc, findById, readableTextColor } from '../util.js';

/** Every rendered row/card of an item (it can appear more than once, e.g. in Focus and Starred). */
function rowsFor(itemId) {
  return [...document.querySelectorAll(`.item[data-id="${CSS.escape(itemId)}"]`)];
}

function previewDone(row, done) {
  row.classList.toggle('is-done', done);
  const check = row.querySelector('.check');
  if (check === null) return;
  check.classList.toggle('on', done);
  if (done) pop(check.querySelector('.check-box'));
}

function previewStatus(row, status) {
  const pill = row.querySelector('.pill');
  pill.style.setProperty('--pill-bg', status.color);
  pill.style.setProperty('--pill-fg', readableTextColor(status.color));
  pill.textContent = status.name;
}

/** Changes an item's status with in-place preview, a short pause (when rows are visible) and Undo. */
async function changeStatus(itemId, statusId) {
  const item = getItem(itemId);
  if (item.status === statusId) return;
  const status = findById(getItemStatuses(item), statusId, 'Status');
  const rows = rowsFor(itemId);
  const becomesDone = item.kind === 'mission' && statusId === getProject(item.projectId).doneStatusId;
  for (const row of rows) {
    previewStatus(row, status);
    previewDone(row, becomesDone);
  }
  haptic(HAPTIC.tap);
  withUndo(`Moved to “${status.name}”`, () => updateItem(itemId, { status: statusId }));
  if (rows.length > 0) await settle();
}

/** Deletes an item with an Undo toast; its row fades out while the list closes the gap. */
export function deleteWithUndo(item) {
  haptic(HAPTIC.remove);
  withUndo(`Deleted “${itemTitle(item)}”`, () => deleteItem(item.id));
}

function itemMenuSheet(item) {
  return `
    ${sheetTitle(itemTitle(item))}
    ${field('Status', `<div class="chips">${statusChips(item)}</div>`)}
    ${field('Color label', colorRadios({ name: 'menu-label', selected: item.label, allowNone: true, changeAction: 'item-label', data: { id: item.id } }))}
    <div class="sheet-row">
      <button type="button" class="btn" data-action="toggle-star" data-id="${esc(item.id)}">${icon('star')} ${item.starred ? 'Unstar' : 'Star'}</button>
      <a class="btn" href="${paths.item(item.id)}">${icon('note')} Open</a>
    </div>
    <button type="button" class="btn btn-danger btn-block" data-action="delete-item-quick" data-id="${esc(item.id)}">${icon('trash')} Delete</button>`;
}

export const handlers = {
  click: {
    back: (element) => goBack(element.dataset.fallback),
    'replace-route': (element) => replaceRoute(element.dataset.href),
    'close-sheet': () => closeSheet(),

    'toggle-done': async (element) => {
      const item = getItem(element.dataset.id);
      const willBeDone = !isDone(item);
      const rows = rowsFor(item.id);
      for (const row of rows) previewDone(row, willBeDone);
      haptic(HAPTIC.tap);
      withUndo(willBeDone ? `Done: ${itemTitle(item)}` : `Reopened: ${itemTitle(item)}`, () => toggleDone(item.id));
      if (rows.length > 0) await settle();
    },

    'toggle-star': (element) => {
      const item = getItem(element.dataset.id);
      updateItem(item.id, { starred: !item.starred });
      haptic(HAPTIC.tap);
      if (item.starred && element.classList.contains('star')) {
        afterRender(() => {
          if (!element.isConnected) return;
          pop(element.querySelector('.icon'));
          burst(element);
        });
      }
    },

    'pick-status': (element) => openSheet(statusSheet(getItem(element.dataset.id))),
    'set-status': (element) => changeStatus(element.dataset.id, element.dataset.status),
    'next-status': (element) => {
      const item = getItem(element.dataset.id);
      return changeStatus(item.id, nextStatus(item).id);
    },

    'item-menu': (element) => openSheet(itemMenuSheet(getItem(element.dataset.id))),
    'delete-item-quick': (element) => deleteWithUndo(getItem(element.dataset.id)),
  },
};
