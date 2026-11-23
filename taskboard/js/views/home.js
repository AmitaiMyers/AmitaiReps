// Home: the "Today" Focus strip, then Projects | Starred tabs.

import { preferredExportMethod } from '../backup.js';
import {
  chevron,
  collapsible,
  colorRadios,
  emptyState,
  itemCard,
  pageHeader,
  projectDot,
  projectTitle,
  segmented,
  sheetTitle,
  statusBattery,
  tabPanel,
} from '../components.js';
import { BACKUP_REMINDER_DAYS, COLORS, DEFAULT_KIND } from '../constants.js';
import { afterNavigation } from '../effects.js';
import { icon } from '../icons.js';
import { getLastBackupAt, getLastTab, getShowArchived, toggleShowArchived } from '../prefs.js';
import { navigate, paths } from '../router.js';
import { openSheet } from '../sheet.js';
import {
  createProject,
  getFocusItems,
  getItems,
  getProjects,
  getStarredItems,
  getState,
  isDone,
  sortItems,
} from '../store.js';
import { daysFromToday, daysSince, esc, formValue, plural } from '../util.js';

/** The Focus strip shows this many rows until "Show all" is tapped. */
const FOCUS_PREVIEW_COUNT = 5;
let focusExpanded = false;

function backupReminder() {
  if (getState().items.length === 0) return '';
  const lastBackupAt = getLastBackupAt();
  if (lastBackupAt !== null && daysSince(lastBackupAt) < BACKUP_REMINDER_DAYS) return '';
  const message =
    lastBackupAt === null ? 'You haven’t backed up yet.' : `Last backup was ${plural(daysSince(lastBackupAt), 'day')} ago.`;
  return `
    <div class="banner" role="note">
      <span class="banner-text">${esc(message)} Your data lives only on this phone.</span>
      <button type="button" class="btn btn-small btn-primary" data-action="export-backup" data-method="${preferredExportMethod()}">Back up</button>
    </div>`;
}

function focusSummary(items) {
  const overdue = items.filter((item) => daysFromToday(item.dueDate) < 0).length;
  const today = items.length - overdue;
  const parts = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (today > 0) parts.push(`${today} due today`);
  return parts.join(' · ');
}

function focusStrip() {
  if (getProjects().length === 0) return '';
  const items = getFocusItems();
  if (items.length === 0) return `<p class="focus-clear">${icon('checkCircle')} Nothing due today</p>`;
  const visible = focusExpanded ? items : items.slice(0, FOCUS_PREVIEW_COUNT);
  const toggle =
    items.length <= FOCUS_PREVIEW_COUNT
      ? ''
      : `<button type="button" class="section-toggle focus-more" data-action="toggle-focus-all" aria-expanded="${focusExpanded}">
           ${focusExpanded ? 'Show less' : `Show all ${items.length}`}
         </button>`;
  return `
    <section class="focus" aria-labelledby="focus-title">
      <div class="focus-head">
        <h2 class="focus-title" id="focus-title">${icon('sun')} Today</h2>
        <span class="focus-summary">${esc(focusSummary(items))}</span>
      </div>
      <div class="item-list">${visible.map((item) => itemCard(item, { context: 'focus', showProject: true })).join('')}</div>
      ${toggle}
    </section>`;
}

function projectCard(project) {
  const missions = getItems(project.id, 'mission');
  const ideaCount = getItems(project.id, 'idea').length;
  const doneCount = missions.filter(isDone).length;
  return `
    <a class="project-card" id="project-card-${esc(project.id)}" data-flip href="${paths.project(project.id, getLastTab(project.id))}">
      <div class="project-card-top">
        ${projectDot(project, { shared: true })}
        <span class="project-name" dir="auto">${esc(projectTitle(project))}</span>
        ${icon('chevronRight')}
      </div>
      <div class="project-card-stats">${doneCount}/${missions.length} missions done · ${plural(ideaCount, 'idea')}</div>
      ${statusBattery(project.statuses, missions)}
    </a>`;
}

function archivedSection(archivedProjects) {
  if (archivedProjects.length === 0) return '';
  const open = getShowArchived();
  return `
    <section class="archived">
      <button type="button" class="section-toggle" data-action="toggle-archived" aria-expanded="${open}" aria-controls="archived-projects">
        ${chevron()} Archived (${archivedProjects.length})
      </button>
      ${collapsible({ id: 'archived-projects', open, content: `<div class="project-list">${archivedProjects.map(projectCard).join('')}</div>` })}
    </section>`;
}

function projectsTab() {
  const projects = getProjects();
  const active = projects.filter((project) => !project.archived);
  const archived = archivedSection(projects.filter((project) => project.archived));
  if (active.length === 0) {
    const empty = emptyState({
      iconName: 'folder',
      title: projects.length === 0 ? 'Start your first project' : 'No active projects',
      text: 'A project holds your ideas and the missions that make them real.',
      action: { label: 'Create a project', name: 'new-project', icon: 'plus' },
    });
    return `${empty}${archived}`;
  }
  return `
    <div class="project-list">${active.map(projectCard).join('')}</div>
    <button type="button" class="btn btn-block" data-action="new-project">${icon('plus')} New project</button>
    ${archived}`;
}

function starredTab() {
  const starred = getStarredItems();
  if (starred.length === 0) {
    return emptyState({ iconName: 'star', title: 'Nothing starred yet', text: 'Tap the star on any idea or mission to pin it here.' });
  }
  return getProjects()
    .map((project) => ({ project, items: sortItems(starred.filter((item) => item.projectId === project.id)) }))
    .filter((group) => group.items.length > 0)
    .map(
      ({ project, items }) => `
      <section class="section">
        <h2 class="section-title">${projectDot(project)}<span dir="auto">${esc(projectTitle(project))}</span></h2>
        <div class="item-list">${items.map((item) => itemCard(item, { context: 'starred' })).join('')}</div>
      </section>`,
    )
    .join('');
}

export function renderHome(route) {
  const settingsLink = `<a class="icon-btn" href="${paths.settings()}" aria-label="Settings">${icon('settings')}</a>`;
  return `
    ${pageHeader({ title: 'Taskboard', actions: settingsLink })}
    <main class="page">
      ${backupReminder()}
      ${focusStrip()}
      ${segmented({
        label: 'Home sections',
        variant: 'tabs',
        options: [
          { key: 'projects', label: 'Projects', active: route.tab === 'projects', attrs: `data-action="replace-route" data-href="${paths.home()}"` },
          {
            key: 'starred',
            label: 'Starred',
            count: getStarredItems().length,
            active: route.tab === 'starred',
            attrs: `data-action="replace-route" data-href="${paths.starred()}"`,
          },
        ],
      })}
      ${tabPanel(route.tab, `<div class="tab-content">${route.tab === 'projects' ? projectsTab() : starredTab()}</div>`)}
    </main>`;
}

function newProjectSheet() {
  const suggestedColor = COLORS[getProjects().length % COLORS.length].hex;
  return `
    <form class="sheet-form" data-submit="create-project">
      ${sheetTitle('New project')}
      <label class="field">
        <span class="field-label">Name</span>
        <input class="input" name="name" required maxlength="120" placeholder="e.g. Home renovation" dir="auto" autocomplete="off" autofocus>
      </label>
      <div class="field">
        <span class="field-label">Color</span>
        ${colorRadios({ name: 'color', selected: suggestedColor })}
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn" data-action="close-sheet">Cancel</button>
        <button type="submit" class="btn btn-primary">Create</button>
      </div>
    </form>`;
}

export const handlers = {
  click: {
    'new-project': () => openSheet(newProjectSheet()),
    'toggle-archived': () => toggleShowArchived(),
    'toggle-focus-all': () => {
      focusExpanded = !focusExpanded;
    },
  },
  submit: {
    'create-project': (form) => {
      const project = createProject({ name: formValue(form, 'name'), color: formValue(form, 'color') });
      // Land in the new project ready to type the first mission.
      afterNavigation((root) => root.querySelector('.composer-input').focus());
      navigate(paths.project(project.id, DEFAULT_KIND));
    },
  },
};
