// Project page: Ideas | Missions tabs, each as a grouped list or a board, plus the bottom composer for adding items.

import {
  chevron,
  choiceChips,
  collapsible,
  emptyState,
  itemCard,
  pageHeader,
  projectTitle,
  segmented,
  sheetTitle,
  statusBattery,
  tabPanel,
} from '../components.js';
import { KIND_ORDER, KINDS } from '../constants.js';
import { requestRender } from '../dispatch.js';
import { afterRender } from '../effects.js';
import { icon } from '../icons.js';
import { HAPTIC, haptic, prefersReducedMotion } from '../motion.js';
import { getViewMode, isCollapsed, setViewMode, toggleCollapsed } from '../prefs.js';
import { paths } from '../router.js';
import { openSheet } from '../sheet.js';
import { createItem, firstOpenStatus, getItems, getProject, isDone, sortItems, statusesForKind } from '../store.js';
import { assert, dataAttrs, esc, findById, formValue, plural } from '../util.js';

const VIEW_MODES = ['list', 'board'];
const BOARD_SCROLL_SETTLE_MS = 120;

/** Where the composer adds new items, per project tab (kept for this session only). */
const composerTargets = new Map();
let boardScrollTimer = null;

function tabKey(projectId, kind) {
  return `${projectId}:${kind}`;
}

function groupKey(projectId, kind, statusId) {
  return `${projectId}:${kind}:${statusId}`;
}

/** The composer's target status; a remembered target whose status was deleted falls back to the default. */
function composerTarget(project, kind) {
  const statuses = statusesForKind(project, kind);
  const key = tabKey(project.id, kind);
  if (composerTargets.has(key) && statuses.some((status) => status.id === composerTargets.get(key))) {
    return findById(statuses, composerTargets.get(key), 'Status');
  }
  return kind === 'idea' ? statuses[0] : firstOpenStatus(project);
}

function groupByStatus(statuses, items) {
  return statuses.map((status) => ({ status, items: sortItems(items.filter((item) => item.status === status.id)) }));
}

function renderList(project, kind, groups) {
  const groupsHtml = groups
    .map(({ status, items }) => {
      const name = `<span class="group-bar"></span><span class="group-name" dir="auto">${esc(status.name)}</span><span class="count">${items.length}</span>`;
      if (items.length === 0) {
        return `<section class="group" id="group-${esc(status.id)}" style="--status:${status.color}"><div class="group-head group-head-empty">${name}</div></section>`;
      }
      const key = groupKey(project.id, kind, status.id);
      const open = !isCollapsed(key);
      const regionId = `group-body-${status.id}`;
      return `
        <section class="group" id="group-${esc(status.id)}" style="--status:${status.color}">
          <button type="button" class="group-head" data-action="toggle-group" data-key="${esc(key)}" aria-expanded="${open}" aria-controls="${esc(regionId)}">
            ${chevron()}${name}
          </button>
          ${collapsible({ id: regionId, open, content: `<div class="group-body">${items.map((item) => itemCard(item, { context: 'list' })).join('')}</div>` })}
        </section>`;
    })
    .join('');
  return `<div class="groups">${groupsHtml}</div>`;
}

function renderBoard(project, kind, groups, target) {
  const columns = groups
    .map(
      ({ status, items }) => `
      <section class="column ${status.id === target.id ? 'is-current' : ''}" id="column-${esc(status.id)}" data-status="${esc(status.id)}"
        style="--status:${status.color}" aria-label="${esc(status.name)}">
        <header class="column-head"><span class="group-name" dir="auto">${esc(status.name)}</span><span class="count">${items.length}</span></header>
        ${items.length === 0 ? `<p class="column-empty">Nothing here</p>` : items.map((item) => itemCard(item, { context: 'board', layout: 'card' })).join('')}
      </section>`,
    )
    .join('');
  return `<div class="board" data-keep-scroll="board:${esc(project.id)}:${kind}" ${dataAttrs({ projectId: project.id, kind })}>${columns}</div>`;
}

function composer(project, kind, target) {
  const label = KINDS[kind].label.toLowerCase();
  return `
    <form class="composer" id="composer" data-submit="composer-add" ${dataAttrs({ projectId: project.id, kind, status: target.id })}>
      <div class="composer-bar">
        <button type="button" class="composer-target" data-action="pick-composer-status" ${dataAttrs({ projectId: project.id, kind })}
          aria-label="Adds to ${esc(target.name)}. Change">
          <span class="dot" style="--dot:${target.color}"></span>
          <span class="composer-target-name" dir="auto">${esc(target.name)}</span>
          ${icon('chevronDown')}
        </button>
        <input class="composer-input" id="composer-input" name="text" placeholder="Add ${label}…" aria-label="New ${label} title"
          autocomplete="off" enterkeyhint="send" dir="auto" maxlength="500">
        <button type="submit" class="composer-send" aria-label="Add ${label}">${icon('arrowUp')}</button>
      </div>
    </form>`;
}

function summary(kind, items) {
  if (kind === 'mission') return `${items.filter(isDone).length} of ${plural(items.length, 'mission')} done`;
  return plural(items.length, 'idea');
}

function viewToggle(projectId, kind, activeMode) {
  const option = (mode, iconName, label) => ({
    icon: iconName,
    label,
    active: mode === activeMode,
    attrs: `data-action="set-view" ${dataAttrs({ projectId, kind, mode })}`,
  });
  return segmented({ label: 'View', variant: 'toggle', options: [option('list', 'list', 'List view'), option('board', 'board', 'Board view')] });
}

export function renderProject({ projectId, kind }) {
  const project = getProject(projectId);
  const items = getItems(projectId, kind);
  const statuses = statusesForKind(project, kind);
  const target = composerTarget(project, kind);
  const viewMode = getViewMode(projectId, kind);
  const groups = groupByStatus(statuses, items);
  const settingsLink = `<a class="icon-btn" href="${paths.projectSettings(projectId)}" aria-label="Project settings">${icon('more')}</a>`;
  const body =
    items.length === 0
      ? emptyState({
          iconName: kind === 'idea' ? 'lightbulb' : 'flag',
          title: `No ${KINDS[kind].plural.toLowerCase()} yet`,
          text: kind === 'idea' ? 'Jot ideas down below. Turn the good ones into missions later.' : 'Type your first mission below and press Enter.',
        })
      : viewMode === 'list'
        ? renderList(project, kind, groups)
        : renderBoard(project, kind, groups, target);
  return `
    ${pageHeader({ title: projectTitle(project), accent: project, backFallback: paths.home(), actions: settingsLink })}
    <main class="page page-with-composer">
      ${segmented({
        label: 'Project sections',
        variant: 'tabs',
        options: KIND_ORDER.map((tabKind) => ({
          key: tabKind,
          label: KINDS[tabKind].plural,
          count: getItems(projectId, tabKind).length,
          active: tabKind === kind,
          attrs: `data-action="replace-route" data-href="${paths.project(projectId, tabKind)}"`,
        })),
      })}
      ${tabPanel(
        kind,
        `<div class="toolbar">
           <span class="toolbar-summary">${esc(summary(kind, items))}</span>
           ${items.length === 0 ? '' : viewToggle(projectId, kind, viewMode)}
         </div>
         ${statusBattery(statuses, items)}
         ${body}`,
      )}
    </main>
    ${composer(project, kind, target)}`;
}

// ---------- Board: the column in view is the composer's target ----------

function syncComposerToBoard(board) {
  if (!board.isConnected) return;
  const { projectId, kind } = board.dataset;
  const leftEdge = board.getBoundingClientRect().left + parseFloat(getComputedStyle(board).paddingLeft);
  let closest = null;
  let closestDistance = Infinity;
  for (const column of board.querySelectorAll('.column')) {
    const distance = Math.abs(column.getBoundingClientRect().left - leftEdge);
    if (distance < closestDistance) {
      closest = column;
      closestDistance = distance;
    }
  }
  assert(closest !== null, 'The board has no columns');
  const key = tabKey(projectId, kind);
  if (composerTargets.get(key) === closest.dataset.status) return;
  composerTargets.set(key, closest.dataset.status);
  requestRender({ animate: 'none' });
}

export function enableBoardTracking() {
  // 'scroll' doesn't bubble, so listen in the capture phase to see every board's horizontal scroll.
  document.addEventListener(
    'scroll',
    (event) => {
      if (!(event.target instanceof Element) || !event.target.matches('.board')) return;
      clearTimeout(boardScrollTimer);
      boardScrollTimer = setTimeout(() => syncComposerToBoard(event.target), BOARD_SCROLL_SETTLE_MS);
    },
    { capture: true, passive: true },
  );
}

export const handlers = {
  click: {
    'set-view': (element) => {
      const { projectId, kind, mode } = element.dataset;
      assert(VIEW_MODES.includes(mode), `Unknown view mode "${mode}"`);
      setViewMode(projectId, kind, mode);
      return { animate: 'none' };
    },
    'toggle-group': (element) => toggleCollapsed(element.dataset.key),
    'pick-composer-status': (element) => {
      const { projectId, kind } = element.dataset;
      const project = getProject(projectId);
      openSheet(`
        ${sheetTitle(`Add new ${KINDS[kind].plural.toLowerCase()} to…`)}
        <div class="chips chips-stacked">
          ${choiceChips({
            options: statusesForKind(project, kind),
            selectedId: composerTarget(project, kind).id,
            action: 'set-composer-status',
            data: { projectId, kind },
            valueKey: 'status',
          })}
        </div>`);
    },
    'set-composer-status': (element) => {
      const { projectId, kind, status } = element.dataset;
      composerTargets.set(tabKey(projectId, kind), status);
      // On the board, bring the chosen column into view.
      afterRender((root) => {
        const column = root.querySelector(`#column-${CSS.escape(status)}`);
        if (column !== null) column.scrollIntoView({ inline: 'start', block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      });
    },
  },
  submit: {
    'composer-add': (form) => {
      const title = formValue(form, 'text').trim();
      if (title === '') return;
      const { projectId, kind, status } = form.dataset;
      const key = groupKey(projectId, kind, status);
      if (isCollapsed(key)) toggleCollapsed(key);
      const item = createItem({ projectId, kind, title, status });
      form.reset();
      haptic(HAPTIC.tap);
      // The focused input is kept by the morph, so the keyboard stays up for the next item.
      afterRender((root) => {
        const row = root.querySelector(`[data-id="${CSS.escape(item.id)}"].item`);
        assert(row !== null, 'The new item was not rendered');
        row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      });
    },
  },
};
