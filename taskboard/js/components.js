// Reusable HTML building blocks (DESIGN.md §4). Every function returns an HTML string; user text always goes through esc().
// Elements that move between renders carry a stable id (idiomorph keeps the same DOM node) and data-flip (layout animation).

import { COLORS, PRIORITIES } from './constants.js';
import { icon } from './icons.js';
import { paths } from './router.js';
import {
  firstOpenStatus,
  getDoneStatus,
  getItemStatus,
  getItemStatuses,
  getProject,
  isDone,
  nextStatus,
} from './store.js';
import { assert, daysFromToday, dataAttrs, displayName, esc, formatDueDate, readableTextColor } from './util.js';

const PRIORITY_BY_ID = new Map(PRIORITIES.map((priority) => [priority.id, priority]));

export function itemTitle(item) {
  return displayName(item.title, 'Untitled');
}

export function projectTitle(project) {
  return displayName(project.name, 'Untitled project');
}

/** CSS variables for a filled pill with readable text. */
export function pillStyle(color) {
  return `--pill-bg:${color};--pill-fg:${readableTextColor(color)}`;
}

function chipStyle(color) {
  return `--chip-color:${color};--chip-fg:${readableTextColor(color)}`;
}

/**
 * A project's color dot. `shared` gives it a view-transition name so it glides between the project card
 * and the app bar during navigation (only one shared dot per project may exist on a page).
 */
export function projectDot(project, { shared = false } = {}) {
  const transitionName = shared ? `;view-transition-name:pdot-${project.id}` : '';
  return `<span class="dot" style="--dot:${project.color}${transitionName}"></span>`;
}

// ---------- Page structure ----------

/** `accent` is the project whose color dot leads the title (or null). */
export function pageHeader({ title, subtitle = '', accent = null, backFallback = null, actions = '' }) {
  const back =
    backFallback === null
      ? ''
      : `<button type="button" class="icon-btn" data-action="back" data-fallback="${esc(backFallback)}" aria-label="Back">${icon('chevronLeft')}</button>`;
  return `
    <header class="app-header ${backFallback === null ? 'app-header-root' : ''}">
      ${back}
      <div class="header-titles">
        <h1 class="header-title" tabindex="-1">
          ${accent === null ? '' : projectDot(accent, { shared: true })}
          <span class="header-title-text" dir="auto">${esc(title)}</span>
        </h1>
        ${subtitle === '' ? '' : `<p class="header-subtitle" dir="auto">${esc(subtitle)}</p>`}
      </div>
      <div class="header-actions">${actions}</div>
    </header>`;
}

/**
 * Segmented control with a sliding thumb.
 * variant 'tabs': ARIA tabs controlling #panel (options need `key` and `label`);
 * variant 'toggle': icon buttons with aria-pressed (options need `icon` and `label`).
 */
export function segmented({ label, variant, options }) {
  const activeIndex = options.findIndex((option) => option.active);
  assert(activeIndex !== -1, `Segmented control "${label}" has no active option`);
  const isTabs = variant === 'tabs';
  const buttons = options
    .map((option) => {
      const role = isTabs
        ? `role="tab" id="tab-${esc(option.key)}" aria-selected="${option.active}" aria-controls="panel"`
        : `aria-pressed="${option.active}" aria-label="${esc(option.label)}"`;
      const content = isTabs ? `<span>${esc(option.label)}</span>` : icon(option.icon);
      const count = option.count === undefined ? '' : `<span class="seg-count">${option.count}</span>`;
      return `<button type="button" class="seg-btn ${option.active ? 'is-active' : ''}" ${role} ${option.attrs}>${content}${count}</button>`;
    })
    .join('');
  return `
    <div class="segmented ${isTabs ? '' : 'segmented-icons'}" role="${isTabs ? 'tablist' : 'group'}" aria-label="${esc(label)}"
      style="--count:${options.length};--index:${activeIndex}">
      <span class="segmented-thumb" aria-hidden="true"></span>
      ${buttons}
    </div>`;
}

export function tabPanel(activeKey, content) {
  return `<section id="panel" role="tabpanel" aria-labelledby="tab-${esc(activeKey)}">${content}</section>`;
}

/** Empty state: a tinted icon tile, one sentence, and at most one action ({ label, name, icon }). */
export function emptyState({ iconName, title, text, action = null }) {
  const button =
    action === null ? '' : `<button type="button" class="btn btn-primary" data-action="${esc(action.name)}">${icon(action.icon)} ${esc(action.label)}</button>`;
  return `
    <div class="empty">
      <span class="icon-tile">${icon(iconName)}</span>
      <p class="empty-title">${esc(title)}</p>
      <p class="empty-text">${esc(text)}</p>
      ${button}
    </div>`;
}

export function field(label, content) {
  return `<section class="field"><h2 class="field-label">${esc(label)}</h2>${content}</section>`;
}

/** A region whose height animates open/closed. Collapsed content stays in the DOM but is inert (not focusable). */
export function collapsible({ id, open, content }) {
  return `<div class="collapse ${open ? '' : 'is-collapsed'}" id="${esc(id)}" ${open ? '' : 'inert'}><div class="collapse-inner">${content}</div></div>`;
}

export function chevron() {
  return `<span class="disclosure-chevron">${icon('chevronDown')}</span>`;
}

/** Stacked bar showing how many items are in each status (a progress "battery"). */
export function statusBattery(statuses, items) {
  const segments = statuses
    .map((status) => ({ status, count: items.filter((item) => item.status === status.id).length }))
    .filter((segment) => segment.count > 0);
  if (segments.length === 0) return '<div class="battery" aria-hidden="true"></div>';
  const description = segments.map((segment) => `${segment.count} ${segment.status.name}`).join(', ');
  return `
    <div class="battery" role="img" aria-label="${esc(description)}">
      ${segments.map((segment) => `<span style="flex-grow:${segment.count};background:${segment.status.color}"></span>`).join('')}
    </div>`;
}

// ---------- Item pieces ----------

export function starButton(item) {
  return `
    <button type="button" class="star ${item.starred ? 'on' : ''}" data-action="toggle-star" data-id="${esc(item.id)}"
      aria-pressed="${item.starred}" aria-label="${item.starred ? 'Unstar' : 'Star'}">${icon('star')}</button>`;
}

export function checkButton({ done, color, attrs, label }) {
  return `
    <button type="button" class="check ${done ? 'on' : ''}" style="--done:${color};--done-fg:${readableTextColor(color)}"
      ${attrs} aria-pressed="${done}" aria-label="${esc(label)}">
      <span class="check-box">${icon('check')}</span>
    </button>`;
}

function missionCheckButton(item) {
  const done = isDone(item);
  return checkButton({
    done,
    color: getDoneStatus(getProject(item.projectId)).color,
    attrs: `data-action="toggle-done" data-id="${esc(item.id)}"`,
    label: done ? 'Mark as not done' : 'Mark as done',
  });
}

export function statusPill(item) {
  const status = getItemStatus(item);
  return `
    <button type="button" class="pill" style="${pillStyle(status.color)}" data-action="pick-status" data-id="${esc(item.id)}"
      aria-label="Status: ${esc(status.name)}. Change status">${esc(status.name)}</button>`;
}

/** 'overdue' | 'today' | 'normal' — done missions are never overdue. */
export function dueTone(item) {
  const days = daysFromToday(item.dueDate);
  if (days < 0 && !isDone(item)) return 'overdue';
  if (days === 0) return 'today';
  return 'normal';
}

function itemMeta(item, showProject) {
  const parts = [];
  if (showProject) {
    const project = getProject(item.projectId);
    parts.push(`<span class="meta">${projectDot(project)}<span dir="auto">${esc(projectTitle(project))}</span></span>`);
  }
  if (item.priority !== null) {
    const priority = PRIORITY_BY_ID.get(item.priority);
    parts.push(`<span class="tag" style="${pillStyle(priority.color)}">${esc(priority.name)}</span>`);
  }
  if (item.dueDate !== null) {
    const tone = dueTone(item);
    const label = tone === 'overdue' ? `Overdue · ${formatDueDate(item.dueDate)}` : formatDueDate(item.dueDate);
    parts.push(`<span class="meta due-${tone}">${icon('calendar')}${esc(label)}</span>`);
  }
  if (item.checklist.length > 0) {
    const doneCount = item.checklist.filter((entry) => entry.done).length;
    parts.push(`<span class="meta" aria-label="Checklist ${doneCount} of ${item.checklist.length}">${icon('checklist')}${doneCount}/${item.checklist.length}</span>`);
  }
  if (item.notes.trim() !== '') parts.push(`<span class="meta" aria-label="Has notes">${icon('note')}</span>`);
  return parts.length === 0 ? '' : `<div class="item-meta">${parts.join('')}</div>`;
}

/** Swipe metadata for list rows: left = next status, right = done/not done (missions only). */
function swipeDetails(item) {
  const next = nextStatus(item);
  const attrs = [`data-swipe`, `data-swipe-left="${esc(next.name)}"`];
  const styles = [`--swipe-left-bg:${next.color}`, `--swipe-left-fg:${readableTextColor(next.color)}`];
  if (item.kind === 'mission') {
    const project = getProject(item.projectId);
    const target = isDone(item) ? firstOpenStatus(project) : getDoneStatus(project);
    attrs.push(`data-swipe-right="${isDone(item) ? 'Not done' : 'Done'}"`);
    styles.push(`--swipe-right-bg:${target.color}`, `--swipe-right-fg:${readableTextColor(target.color)}`);
  }
  return { attrs: attrs.join(' '), styles };
}

/**
 * One idea/mission. layout 'row' (lists, swipeable) or 'card' (board).
 * `context` keeps DOM ids unique when the same item appears twice on a page (e.g. Focus and Starred).
 * The title is a link stretched over the whole row; the checkbox, star and pill sit above it.
 */
export function itemCard(item, { context, layout = 'row', showProject = false }) {
  assert(context !== undefined && context !== '', 'itemCard needs a context');
  const swipe = layout === 'row' ? swipeDetails(item) : { attrs: '', styles: [] };
  const styles = item.label === null ? swipe.styles : [...swipe.styles, `--label:${item.label}`];
  const classes = `item item--${layout}${isDone(item) ? ' is-done' : ''}${item.label === null ? '' : ' has-label'}`;
  return `
    <div class="${classes}" id="${esc(context)}-${esc(item.id)}" data-flip data-id="${esc(item.id)}" ${swipe.attrs}
      style="${styles.join(';')}">
      <div class="item-surface">
        ${item.kind === 'mission' ? missionCheckButton(item) : ''}
        <div class="item-main">
          <a class="item-link" href="${paths.item(item.id)}" dir="auto"><span class="item-title">${esc(itemTitle(item))}</span></a>
          ${itemMeta(item, showProject)}
        </div>
        <div class="item-side">
          ${starButton(item)}
          ${statusPill(item)}
        </div>
      </div>
    </div>`;
}

/**
 * Choice chips (statuses, priorities). Each option is { id, name, color }; the chosen id is sent as data-<valueKey>.
 */
export function choiceChips({ options, selectedId, action, data, valueKey }) {
  return options
    .map((option) => {
      const selected = option.id === selectedId;
      return `
        <button type="button" class="chip ${selected ? 'is-selected' : ''}" style="${chipStyle(option.color)}" aria-pressed="${selected}"
          data-action="${esc(action)}" ${dataAttrs({ ...data, [valueKey]: option.id })}>
          <span class="chip-dot"></span>${selected ? icon('check') : ''}<span dir="auto">${esc(option.name)}</span>
        </button>`;
    })
    .join('');
}

export function statusChips(item) {
  return choiceChips({
    options: getItemStatuses(item),
    selectedId: item.status,
    action: 'set-status',
    data: { id: item.id },
    valueKey: 'status',
  });
}

// ---------- Sheets ----------

/** The heading every sheet needs (it names the dialog for screen readers). */
export function sheetTitle(text) {
  return `<h2 class="sheet-title" id="sheet-title" dir="auto">${esc(text)}</h2>`;
}

export function statusSheet(item) {
  return `
    ${sheetTitle(itemTitle(item))}
    <div class="chips chips-stacked">${statusChips(item)}</div>
    <button type="button" class="btn btn-block" data-action="close-sheet">Cancel</button>`;
}

/** For the few actions that can't be undone (delete project, restore backup). */
export function confirmSheet({ title, message, confirmLabel, action, data = {} }) {
  return `
    ${sheetTitle(title)}
    <p class="sheet-text">${esc(message)}</p>
    <div class="sheet-actions">
      <button type="button" class="btn" data-action="close-sheet">Cancel</button>
      <button type="button" class="btn btn-danger-solid" data-action="${esc(action)}" ${dataAttrs(data)}>${esc(confirmLabel)}</button>
    </div>`;
}

// ---------- Form pieces ----------

/** Single-line "type and press Enter" form (checklist entries). */
export function inlineAddForm({ submitAction, data, placeholder }) {
  return `
    <form class="inline-add" data-submit="${esc(submitAction)}" ${dataAttrs(data)}>
      <span aria-hidden="true">${icon('plus')}</span>
      <input name="text" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"
        autocomplete="off" enterkeyhint="done" dir="auto" maxlength="500">
    </form>`;
}

/**
 * Color picker made of radio buttons (works inside a <form> or standalone with a change handler).
 * An empty value means "no color" (only offered when allowNone is true).
 */
export function colorRadios({ name, selected, allowNone = false, changeAction = null, data = {} }) {
  const options = allowNone ? [{ hex: '', name: 'No color' }, ...COLORS] : COLORS;
  const selectedValue = selected === null ? '' : selected;
  const changeAttrs = changeAction === null ? '' : `data-change="${esc(changeAction)}" ${dataAttrs(data)}`;
  return `
    <div class="swatches" role="radiogroup" aria-label="Color">
      ${options
        .map(
          (color) => `
        <label class="swatch ${color.hex === '' ? 'swatch-none' : ''}" style="--swatch:${color.hex === '' ? 'transparent' : color.hex}">
          <input type="radio" name="${esc(name)}" value="${color.hex}" aria-label="${esc(color.name)}"
            ${color.hex === selectedValue ? 'checked' : ''} ${changeAttrs}>
        </label>`,
        )
        .join('')}
    </div>`;
}
