// The shape of the saved data, and strict validation of it.
// Used when loading from the device, when importing a backup, and before every change is applied.

import { IDEA_STATUSES, PRIORITIES } from './constants.js';
import { assert } from './util.js';

export const SCHEMA_VERSION = 1;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KIND_VALUES = ['idea', 'mission'];

export function createEmptyState() {
  return { schemaVersion: SCHEMA_VERSION, projects: [], items: [] };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertId(value, label) {
  assert(typeof value === 'string' && value !== '', `${label} must be a non-empty id`);
}

function assertString(value, label) {
  assert(typeof value === 'string', `${label} must be text`);
}

function assertBoolean(value, label) {
  assert(typeof value === 'boolean', `${label} must be true or false`);
}

function assertTimestamp(value, label) {
  assert(Number.isFinite(value), `${label} must be a timestamp`);
}

function assertColor(value, label) {
  assert(typeof value === 'string' && HEX_COLOR.test(value), `${label} must be a color like #00c875`);
}

function assertUniqueId(seenIds, id, label) {
  assert(!seenIds.has(id), `Duplicate ${label} id "${id}"`);
  seenIds.add(id);
}

/**
 * Project shape:
 * { id, name, color, archived, createdAt, statuses: [{ id, name, color }], doneStatusId }
 * `doneStatusId` is the status the mission checkbox sets; at least one other status must exist to "reopen" to.
 */
export function validateProject(project) {
  assert(isObject(project), 'Project must be an object');
  const label = `Project "${project.name}"`;
  assertId(project.id, `${label} id`);
  assertString(project.name, 'Project name');
  assertColor(project.color, `${label} color`);
  assertBoolean(project.archived, `${label} archived flag`);
  assertTimestamp(project.createdAt, `${label} creation time`);
  assert(Array.isArray(project.statuses) && project.statuses.length >= 2, `${label} needs at least 2 statuses`);
  const statusIds = new Set();
  for (const status of project.statuses) {
    assert(isObject(status), `${label} has an invalid status`);
    assertId(status.id, `${label} status id`);
    assertUniqueId(statusIds, status.id, `${label} status`);
    assertString(status.name, `${label} status name`);
    assertColor(status.color, `${label} status color`);
  }
  assert(statusIds.has(project.doneStatusId), `${label} "done" status must be one of its statuses`);
}

function validateChecklist(checklist, label) {
  assert(Array.isArray(checklist), `${label} checklist must be a list`);
  const entryIds = new Set();
  for (const entry of checklist) {
    assert(isObject(entry), `${label} has an invalid checklist entry`);
    assertId(entry.id, `${label} checklist entry id`);
    assertUniqueId(entryIds, entry.id, `${label} checklist entry`);
    assertString(entry.text, `${label} checklist text`);
    assertBoolean(entry.done, `${label} checklist done flag`);
  }
}

/**
 * Item shape (ideas and missions share it; ideas simply don't use priority, due date or checklist):
 * { id, projectId, kind, title, notes, status, priority, dueDate, checklist, starred, label, createdAt, updatedAt }
 */
export function validateItem(item, project) {
  assert(isObject(item), 'Item must be an object');
  const label = `Item "${item.title}"`;
  assertId(item.id, `${label} id`);
  assert(item.projectId === project.id, `${label} does not belong to project "${project.name}"`);
  assert(KIND_VALUES.includes(item.kind), `${label} kind must be "idea" or "mission"`);
  assertString(item.title, `${label} title`);
  assertString(item.notes, `${label} notes`);
  const allowedStatuses = item.kind === 'idea' ? IDEA_STATUSES : project.statuses;
  assert(allowedStatuses.some((status) => status.id === item.status), `${label} has unknown status "${item.status}"`);
  assert(
    item.priority === null || PRIORITIES.some((priority) => priority.id === item.priority),
    `${label} has unknown priority "${item.priority}"`,
  );
  assert(
    item.dueDate === null || (typeof item.dueDate === 'string' && ISO_DATE.test(item.dueDate)),
    `${label} due date must be YYYY-MM-DD`,
  );
  validateChecklist(item.checklist, label);
  assertBoolean(item.starred, `${label} starred flag`);
  assert(item.label === null || (typeof item.label === 'string' && HEX_COLOR.test(item.label)), `${label} color label is invalid`);
  assertTimestamp(item.createdAt, `${label} creation time`);
  assertTimestamp(item.updatedAt, `${label} update time`);
}

/** Validates the whole saved state and returns it unchanged. Throws a readable error on the first problem. */
export function validateState(state) {
  assert(isObject(state), 'Data must be an object');
  assert(state.schemaVersion === SCHEMA_VERSION, `Unsupported data version ${state.schemaVersion} (expected ${SCHEMA_VERSION})`);
  assert(Array.isArray(state.projects), 'Data "projects" must be a list');
  assert(Array.isArray(state.items), 'Data "items" must be a list');

  const projectsById = new Map();
  for (const project of state.projects) {
    validateProject(project);
    assert(!projectsById.has(project.id), `Duplicate project id "${project.id}"`);
    projectsById.set(project.id, project);
  }

  const itemIds = new Set();
  for (const item of state.items) {
    assert(isObject(item), 'Item must be an object');
    assert(projectsById.has(item.projectId), `Item "${item.title}" points to a missing project`);
    validateItem(item, projectsById.get(item.projectId));
    assertUniqueId(itemIds, item.id, 'item');
  }
  return state;
}
