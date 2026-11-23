// Per-device UI preferences (view mode, collapsed groups, last tab, last backup time).
// Kept in localStorage, separate from your data, so they are not part of backups.

import { DEFAULT_KIND } from './constants.js';

const STORAGE_KEY = 'taskboard.prefs';

function defaultPrefs() {
  return { viewMode: {}, lastTab: {}, collapsed: {}, showArchived: false, lastBackupAt: null };
}

function readPrefs() {
  const raw = localStorage.getItem(STORAGE_KEY);
  // Merging with defaults lets newly added preference keys work for existing users.
  return raw === null ? defaultPrefs() : { ...defaultPrefs(), ...JSON.parse(raw) };
}

const prefs = readPrefs();

function writePrefs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function viewKey(projectId, kind) {
  return `${projectId}:${kind}`;
}

export function getViewMode(projectId, kind) {
  return prefs.viewMode[viewKey(projectId, kind)] ?? 'list';
}

export function setViewMode(projectId, kind, mode) {
  prefs.viewMode[viewKey(projectId, kind)] = mode;
  writePrefs();
}

export function getLastTab(projectId) {
  return prefs.lastTab[projectId] ?? DEFAULT_KIND;
}

export function setLastTab(projectId, kind) {
  if (prefs.lastTab[projectId] === kind) return;
  prefs.lastTab[projectId] = kind;
  writePrefs();
}

export function isCollapsed(groupKey) {
  return prefs.collapsed[groupKey] === true;
}

export function toggleCollapsed(groupKey) {
  prefs.collapsed[groupKey] = !isCollapsed(groupKey);
  writePrefs();
}

export function getShowArchived() {
  return prefs.showArchived;
}

export function toggleShowArchived() {
  prefs.showArchived = !prefs.showArchived;
  writePrefs();
}

export function getLastBackupAt() {
  return prefs.lastBackupAt;
}

export function setLastBackupAt(timestamp) {
  prefs.lastBackupAt = timestamp;
  writePrefs();
}
