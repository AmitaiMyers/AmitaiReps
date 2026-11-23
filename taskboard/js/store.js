// In-memory app state, read helpers ("selectors") and every allowed change ("mutations").
// Each mutation validates its result before applying it, then schedules a save to IndexedDB.
// Rendering is not triggered here: the app re-renders after every user action (see app.js).

import { COLORS, DEFAULT_MISSION_STATUSES, IDEA_STATUSES, PRIORITIES } from './constants.js';
import { saveState } from './db.js';
import { validateItem, validateProject, validateState } from './schema.js';
import { assert, assertAllowedKeys, daysFromToday, findById, uid } from './util.js';

const SAVE_DELAY_MS = 400;
const PROJECT_FIELDS = ['name', 'color', 'archived'];
const STATUS_FIELDS = ['name', 'color'];
const ITEM_FIELDS = ['title', 'notes', 'status', 'priority', 'dueDate', 'starred', 'label'];
const CHECKLIST_FIELDS = ['text', 'done'];
const PRIORITY_RANK = new Map(PRIORITIES.map((priority) => [priority.id, priority.rank]));

let state = null;
let saveTimer = null;
let revision = 0;
let savedRevision = 0;
const savedListeners = [];

export function initStore(initialState) {
  state = validateState(initialState);
}

// ---------- Saving ----------
// Every change bumps `revision`. Data counts as saved only once a write for that revision has succeeded,
// so a failed write is retried by the next save instead of being forgotten.

function commit() {
  revision += 1;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
}

/** Increases on every change; used by undo to detect that something else changed in the meantime. */
export function getRevision() {
  return revision;
}

export function onSaved(listener) {
  savedListeners.push(listener);
}

/** Writes pending changes now (used when the app goes to the background or before reloading). */
export async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (revision === savedRevision) return;
  const savingRevision = revision;
  await saveState(state);
  savedRevision = Math.max(savedRevision, savingRevision);
  for (const listener of savedListeners) listener();
}

// ---------- Selectors ----------

export function getState() {
  return state;
}

export function getProjects() {
  return state.projects;
}

export function hasProject(projectId) {
  return state.projects.some((project) => project.id === projectId);
}

export function getProject(projectId) {
  return findById(state.projects, projectId, 'Project');
}

export function hasItem(itemId) {
  return state.items.some((item) => item.id === itemId);
}

export function getItem(itemId) {
  return findById(state.items, itemId, 'Item');
}

export function getItems(projectId, kind) {
  return state.items.filter((item) => item.projectId === projectId && item.kind === kind);
}

export function getStarredItems() {
  return state.items.filter((item) => item.starred);
}

export function statusesForKind(project, kind) {
  return kind === 'idea' ? IDEA_STATUSES : project.statuses;
}

export function getItemStatus(item) {
  return findById(statusesForKind(getProject(item.projectId), item.kind), item.status, 'Status');
}

export function getItemStatuses(item) {
  return statusesForKind(getProject(item.projectId), item.kind);
}

export function isDone(item) {
  return item.kind === 'mission' && item.status === getProject(item.projectId).doneStatusId;
}

export function getDoneStatus(project) {
  return findById(project.statuses, project.doneStatusId, 'Status');
}

/** The status a mission returns to when it is un-checked, or receives when its status is deleted. */
export function firstOpenStatus(project, excludedStatusId = null) {
  const open = project.statuses.find((status) => status.id !== project.doneStatusId && status.id !== excludedStatusId);
  assert(open !== undefined, `Project "${project.name}" has no open status`);
  return open;
}

export function countMissionsWithStatus(projectId, statusId) {
  return getItems(projectId, 'mission').filter((item) => item.status === statusId).length;
}

function priorityRank(item) {
  return item.priority === null ? 0 : PRIORITY_RANK.get(item.priority);
}

function compareDueDates(a, b) {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

/** List order: starred first, then higher priority, then earlier due date, then oldest first. */
function compareItems(a, b) {
  if (a.starred !== b.starred) return a.starred ? -1 : 1;
  if (priorityRank(a) !== priorityRank(b)) return priorityRank(b) - priorityRank(a);
  const byDueDate = compareDueDates(a, b);
  if (byDueDate !== 0) return byDueDate;
  return a.createdAt - b.createdAt;
}

export function sortItems(items) {
  return [...items].sort(compareItems);
}

/** The status after this one (wrapping around); used by the swipe-left gesture. */
export function nextStatus(item) {
  const statuses = getItemStatuses(item);
  const index = statuses.findIndex((status) => status.id === item.status);
  assert(index !== -1, `Item "${item.title}" has an unknown status`);
  return statuses[(index + 1) % statuses.length];
}

/** Open missions due today or earlier, across all active projects: earliest first, then by priority. */
export function getFocusItems() {
  const activeProjectIds = new Set(state.projects.filter((project) => !project.archived).map((project) => project.id));
  const due = state.items.filter(
    (item) =>
      item.kind === 'mission' &&
      activeProjectIds.has(item.projectId) &&
      item.dueDate !== null &&
      !isDone(item) &&
      daysFromToday(item.dueDate) <= 0,
  );
  return due.sort((a, b) => compareDueDates(a, b) || priorityRank(b) - priorityRank(a) || a.createdAt - b.createdAt);
}

// ---------- Project mutations ----------

export function createProject({ name, color }) {
  const statuses = DEFAULT_MISSION_STATUSES.map((status) => ({ id: uid(), name: status.name, color: status.color }));
  const doneIndex = DEFAULT_MISSION_STATUSES.findIndex((status) => status.isDone);
  const project = {
    id: uid(),
    name: name.trim(),
    color,
    archived: false,
    createdAt: Date.now(),
    statuses,
    doneStatusId: statuses[doneIndex].id,
  };
  validateProject(project);
  state.projects.push(project);
  commit();
  return project;
}

/** Validates the project as it would look after `changes`, then applies them. */
function applyProjectChanges(project, changes) {
  const updated = { ...project, ...changes };
  validateProject(updated);
  Object.assign(project, updated);
  commit();
}

export function updateProject(projectId, patch) {
  assertAllowedKeys(patch, PROJECT_FIELDS, 'Project');
  applyProjectChanges(getProject(projectId), patch);
}

export function deleteProject(projectId) {
  getProject(projectId);
  state.projects = state.projects.filter((project) => project.id !== projectId);
  state.items = state.items.filter((item) => item.projectId !== projectId);
  commit();
}

// ---------- Status mutations ----------

export function addStatus(projectId) {
  const project = getProject(projectId);
  const usedColors = new Set(project.statuses.map((status) => status.color));
  const unusedColor = COLORS.find((color) => !usedColors.has(color.hex));
  const status = { id: uid(), name: 'New status', color: (unusedColor === undefined ? COLORS[0] : unusedColor).hex };
  // Insert just before the "done" status so finished work stays last.
  const doneIndex = project.statuses.findIndex((existing) => existing.id === project.doneStatusId);
  const statuses = [...project.statuses];
  statuses.splice(doneIndex, 0, status);
  applyProjectChanges(project, { statuses });
  return status;
}

export function updateStatus(projectId, statusId, patch) {
  assertAllowedKeys(patch, STATUS_FIELDS, 'Status');
  const project = getProject(projectId);
  findById(project.statuses, statusId, 'Status');
  const statuses = project.statuses.map((status) => (status.id === statusId ? { ...status, ...patch } : status));
  applyProjectChanges(project, { statuses });
}

export function setDoneStatus(projectId, statusId) {
  applyProjectChanges(getProject(projectId), { doneStatusId: statusId });
}

export function moveStatus(projectId, statusId, offset) {
  const project = getProject(projectId);
  const from = project.statuses.findIndex((status) => status.id === statusId);
  assert(from !== -1, `Status "${statusId}" not found`);
  const to = from + offset;
  assert(to >= 0 && to < project.statuses.length, 'Status cannot move any further');
  const statuses = [...project.statuses];
  const [moved] = statuses.splice(from, 1);
  statuses.splice(to, 0, moved);
  applyProjectChanges(project, { statuses });
}

/** Deletes a status; its missions move to the first remaining open status. */
export function deleteStatus(projectId, statusId) {
  const project = getProject(projectId);
  findById(project.statuses, statusId, 'Status');
  assert(statusId !== project.doneStatusId, 'Pick another "Done" status before deleting this one');
  assert(project.statuses.length > 2, 'A project needs at least 2 statuses');
  const fallback = firstOpenStatus(project, statusId);
  applyProjectChanges(project, { statuses: project.statuses.filter((status) => status.id !== statusId) });
  const now = Date.now();
  for (const item of getItems(projectId, 'mission')) {
    if (item.status === statusId) {
      item.status = fallback.id;
      item.updatedAt = now;
    }
  }
}

// ---------- Item mutations ----------

export function createItem({ projectId, kind, title, status }) {
  const project = getProject(projectId);
  const now = Date.now();
  const item = {
    id: uid(),
    projectId,
    kind,
    title: title.trim(),
    notes: '',
    status,
    priority: null,
    dueDate: null,
    checklist: [],
    starred: false,
    label: null,
    createdAt: now,
    updatedAt: now,
  };
  validateItem(item, project);
  state.items.push(item);
  commit();
  return item;
}

/** Validates the item as it would look after `changes`, then applies them. */
function applyItemChanges(item, changes) {
  const updated = { ...item, ...changes, updatedAt: Date.now() };
  validateItem(updated, getProject(item.projectId));
  Object.assign(item, updated);
  commit();
}

export function updateItem(itemId, patch) {
  assertAllowedKeys(patch, ITEM_FIELDS, 'Item');
  applyItemChanges(getItem(itemId), patch);
}

export function deleteItem(itemId) {
  getItem(itemId);
  state.items = state.items.filter((item) => item.id !== itemId);
  commit();
}

/** The mission checkbox: done ⇄ first open status. */
export function toggleDone(itemId) {
  const item = getItem(itemId);
  assert(item.kind === 'mission', 'Only missions can be marked done');
  const project = getProject(item.projectId);
  applyItemChanges(item, { status: isDone(item) ? firstOpenStatus(project).id : project.doneStatusId });
}

export function convertIdeaToMission(itemId) {
  const item = getItem(itemId);
  assert(item.kind === 'idea', 'Only ideas can be turned into missions');
  applyItemChanges(item, { kind: 'mission', status: firstOpenStatus(getProject(item.projectId)).id });
}

export function addChecklistEntry(itemId, text) {
  const item = getItem(itemId);
  applyItemChanges(item, { checklist: [...item.checklist, { id: uid(), text: text.trim(), done: false }] });
}

export function updateChecklistEntry(itemId, entryId, patch) {
  assertAllowedKeys(patch, CHECKLIST_FIELDS, 'Checklist entry');
  const item = getItem(itemId);
  findById(item.checklist, entryId, 'Checklist entry');
  applyItemChanges(item, { checklist: item.checklist.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)) });
}

export function deleteChecklistEntry(itemId, entryId) {
  const item = getItem(itemId);
  findById(item.checklist, entryId, 'Checklist entry');
  applyItemChanges(item, { checklist: item.checklist.filter((entry) => entry.id !== entryId) });
}

// ---------- Whole-state ----------

/** Replaces all data (used by backup restore). */
export function replaceState(newState) {
  state = validateState(newState);
  commit();
}
