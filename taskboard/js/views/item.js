// Item page: edit one idea or mission. Text saves as you type ("Saved ✓" confirms); taps save immediately.
// Checklist and color label sit under "More details" until they are used (progressive disclosure).

import {
  checkButton,
  chevron,
  choiceChips,
  collapsible,
  colorRadios,
  dueTone,
  field,
  inlineAddForm,
  pageHeader,
  projectTitle,
  starButton,
  statusChips,
} from '../components.js';
import { COLORS, KINDS, PRIORITIES } from '../constants.js';
import { autosize } from '../effects.js';
import { icon } from '../icons.js';
import { pop } from '../motion.js';
import { goBack, paths } from '../router.js';
import {
  addChecklistEntry,
  convertIdeaToMission,
  deleteChecklistEntry,
  getItem,
  getProject,
  updateChecklistEntry,
  updateItem,
} from '../store.js';
import { withUndo } from '../undo.js';
import { esc, findById, formatDueDate, formatTimestamp, formValue } from '../util.js';
import { deleteWithUndo } from './shared.js';

const NO_PRIORITY = { id: '', name: 'None', color: COLORS.find((color) => color.name === 'Gray').hex };

/** Explicit open/closed choices for "More details", per item, for this session. */
const moreDetailsChoice = new Map();

function moreDetailsOpen(item) {
  if (moreDetailsChoice.has(item.id)) return moreDetailsChoice.get(item.id);
  return item.label !== null || item.checklist.length > 0;
}

function priorityChips(item) {
  return `
    <div class="chips">
      ${choiceChips({
        options: [NO_PRIORITY, ...PRIORITIES],
        selectedId: item.priority === null ? '' : item.priority,
        action: 'set-priority',
        data: { id: item.id },
        valueKey: 'priority',
      })}
    </div>`;
}

function dueDateEditor(item) {
  const hasDate = item.dueDate !== null;
  return `
    <div class="due-editor">
      <input type="date" class="input date-input" value="${hasDate ? esc(item.dueDate) : ''}"
        data-change="item-due" data-id="${esc(item.id)}" aria-label="Due date">
      ${hasDate ? `<span class="meta due-${dueTone(item)}">${esc(formatDueDate(item.dueDate))}</span>` : ''}
      ${hasDate ? `<button type="button" class="btn btn-small" data-action="clear-due" data-id="${esc(item.id)}">Clear</button>` : ''}
    </div>`;
}

function checklistEditor(item) {
  const doneCount = item.checklist.filter((entry) => entry.done).length;
  const progress =
    item.checklist.length === 0
      ? ''
      : `<div class="progress" role="progressbar" aria-label="Checklist progress" aria-valuemin="0"
           aria-valuemax="${item.checklist.length}" aria-valuenow="${doneCount}">
           <span style="width:${Math.round((doneCount / item.checklist.length) * 100)}%"></span>
         </div>`;
  const entries = item.checklist
    .map((entry) => {
      const attrs = `data-id="${esc(item.id)}" data-entry-id="${esc(entry.id)}"`;
      return `
        <li class="checklist-entry ${entry.done ? 'is-done' : ''}" id="entry-${esc(entry.id)}">
          ${checkButton({ done: entry.done, color: '#00c875', attrs: `data-action="checklist-toggle" ${attrs}`, label: entry.done ? 'Mark as not done' : 'Mark as done' })}
          <input class="checklist-text" value="${esc(entry.text)}" data-input="checklist-text" ${attrs} dir="auto" aria-label="Checklist item">
          <button type="button" class="icon-btn" data-action="checklist-delete" ${attrs} aria-label="Delete checklist item">${icon('x')}</button>
        </li>`;
    })
    .join('');
  const label = item.checklist.length === 0 ? 'Checklist' : `Checklist · ${doneCount}/${item.checklist.length}`;
  return field(
    label,
    `${progress}
     <div class="checklist-box">
       ${entries === '' ? '' : `<ul class="checklist">${entries}</ul>`}
       ${inlineAddForm({ submitAction: 'checklist-add', data: { id: item.id }, placeholder: 'Add checklist item' })}
     </div>`,
  );
}

function moreDetails(item) {
  const open = moreDetailsOpen(item);
  const isMission = item.kind === 'mission';
  const content = `
    <div class="disclosure-body">
      ${isMission ? checklistEditor(item) : ''}
      ${field('Color label', colorRadios({ name: 'item-label', selected: item.label, allowNone: true, changeAction: 'item-label', data: { id: item.id } }))}
    </div>`;
  return `
    <button type="button" class="disclosure-btn" data-action="toggle-more" data-id="${esc(item.id)}" aria-expanded="${open}" aria-controls="more-details">
      ${chevron()} More details
      <span class="disclosure-hint">${isMission ? 'Checklist · Color label' : 'Color label'}</span>
    </button>
    ${collapsible({ id: 'more-details', open, content })}`;
}

export function renderItem({ itemId }) {
  const item = getItem(itemId);
  const project = getProject(item.projectId);
  const kind = KINDS[item.kind];
  const isMission = item.kind === 'mission';
  const idAttr = `data-id="${esc(item.id)}"`;
  const saveIndicator = `<span class="save-indicator" role="status">${icon('check')} Saved</span>`;
  return `
    ${pageHeader({
      title: kind.label,
      subtitle: projectTitle(project),
      accent: project,
      backFallback: paths.project(project.id, item.kind),
      actions: `${saveIndicator}${starButton(item)}`,
    })}
    <main class="page">
      <textarea class="title-input" id="item-title" rows="1" dir="auto" placeholder="${kind.label} title" aria-label="Title"
        data-input="item-title" ${idAttr} data-autosize>${esc(item.title)}</textarea>
      ${field('Status', `<div class="chips">${statusChips(item)}</div>`)}
      ${isMission ? field('Priority', priorityChips(item)) : ''}
      ${isMission ? field('Due date', dueDateEditor(item)) : ''}
      ${field(
        'Notes',
        `<textarea class="input notes-input" id="item-notes" rows="4" dir="auto" placeholder="Write anything…" aria-label="Notes"
          data-input="item-notes" ${idAttr} data-autosize>${esc(item.notes)}</textarea>`,
      )}
      ${moreDetails(item)}
      ${isMission ? '' : `<button type="button" class="btn btn-primary btn-block" data-action="convert-idea" ${idAttr}>${icon('arrowRight')} Turn into mission</button>`}
      <p class="timestamps">Created ${esc(formatTimestamp(item.createdAt))} · Updated ${esc(formatTimestamp(item.updatedAt))}</p>
      <button type="button" class="btn btn-danger btn-block" data-action="delete-item" ${idAttr}>${icon('trash')} Delete ${kind.label.toLowerCase()}</button>
    </main>`;
}

export const handlers = {
  click: {
    'set-priority': (element) => {
      const { id, priority } = element.dataset;
      updateItem(id, { priority: priority === '' ? null : priority });
    },
    'clear-due': (element) => updateItem(element.dataset.id, { dueDate: null }),
    'toggle-more': (element) => {
      const item = getItem(element.dataset.id);
      moreDetailsChoice.set(item.id, !moreDetailsOpen(item));
    },
    'checklist-toggle': (element) => {
      const { id, entryId } = element.dataset;
      const entry = findById(getItem(id).checklist, entryId, 'Checklist entry');
      updateChecklistEntry(id, entryId, { done: !entry.done });
      if (!entry.done) pop(element.querySelector('.check-box'));
    },
    'checklist-delete': (element) => deleteChecklistEntry(element.dataset.id, element.dataset.entryId),
    'convert-idea': (element) => {
      withUndo('Moved to Missions', () => convertIdeaToMission(element.dataset.id));
    },
    'delete-item': (element) => {
      const item = getItem(element.dataset.id);
      deleteWithUndo(item);
      goBack(paths.project(item.projectId, item.kind));
    },
  },
  input: {
    'item-title': (element) => {
      updateItem(element.dataset.id, { title: element.value });
      autosize(element);
    },
    'item-notes': (element) => {
      updateItem(element.dataset.id, { notes: element.value });
      autosize(element);
    },
    'checklist-text': (element) => updateChecklistEntry(element.dataset.id, element.dataset.entryId, { text: element.value }),
  },
  change: {
    'item-due': (element) => updateItem(element.dataset.id, { dueDate: element.value === '' ? null : element.value }),
    'item-label': (element) => updateItem(element.dataset.id, { label: element.value === '' ? null : element.value }),
  },
  submit: {
    'checklist-add': (form) => {
      const text = formValue(form, 'text').trim();
      if (text === '') return;
      addChecklistEntry(form.dataset.id, text);
      // The focused input survives the re-render, so typing can continue straight away.
      form.reset();
    },
  },
};
