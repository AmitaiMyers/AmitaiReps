// Project settings: name, color, editable mission statuses, archive and delete.

import { colorRadios, confirmSheet, field, pageHeader, projectTitle, sheetTitle } from '../components.js';
import { IDEA_STATUSES } from '../constants.js';
import { afterRender } from '../effects.js';
import { icon } from '../icons.js';
import { getLastTab } from '../prefs.js';
import { paths, replaceRoute } from '../router.js';
import { openSheet } from '../sheet.js';
import {
  addStatus,
  countMissionsWithStatus,
  deleteProject,
  deleteStatus,
  firstOpenStatus,
  getItems,
  getProject,
  moveStatus,
  setDoneStatus,
  updateProject,
  updateStatus,
} from '../store.js';
import { showToast } from '../toast.js';
import { withUndo } from '../undo.js';
import { dataAttrs, esc, findById, plural } from '../util.js';

const MIN_STATUSES = 2;

function statusRow(project, status, index) {
  const isDoneStatus = status.id === project.doneStatusId;
  const isLast = index === project.statuses.length - 1;
  const canDelete = !isDoneStatus && project.statuses.length > MIN_STATUSES;
  const attrs = dataAttrs({ projectId: project.id, statusId: status.id });
  const deleteHint = isDoneStatus ? 'Pick another Done status first' : 'A project needs at least 2 statuses';
  return `
    <li class="status-edit-row" id="status-row-${esc(status.id)}" data-flip>
      <div class="status-edit-main">
        <button type="button" class="swatch-btn" style="--swatch:${status.color}" data-action="pick-status-color" ${attrs}
          aria-label="Change color of ${esc(status.name)}"></button>
        <input class="input" value="${esc(status.name)}" data-input="status-name" ${attrs} dir="auto" maxlength="40" aria-label="Status name">
      </div>
      <div class="status-edit-controls">
        <label class="done-toggle">
          <input type="radio" name="done-status" ${isDoneStatus ? 'checked' : ''} data-change="done-status" ${attrs}>
          Done status
        </label>
        <button type="button" class="icon-btn" data-action="move-status" data-offset="-1" ${attrs} ${index === 0 ? 'disabled' : ''}
          aria-label="Move up">${icon('arrowUp')}</button>
        <button type="button" class="icon-btn" data-action="move-status" data-offset="1" ${attrs} ${isLast ? 'disabled' : ''}
          aria-label="Move down">${icon('arrowDown')}</button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete-status" ${attrs} ${canDelete ? '' : 'disabled'}
          aria-label="${canDelete ? 'Delete status' : `Delete status (unavailable: ${deleteHint})`}">${icon('trash')}</button>
      </div>
    </li>`;
}

function statusEditor(project) {
  const ideaStatusNames = IDEA_STATUSES.map((status) => status.name).join(', ');
  return `
    <p class="field-hint">The “Done status” is what the mission checkbox sets. Ideas always use: ${esc(ideaStatusNames)}.</p>
    <ul class="status-editor">${project.statuses.map((status, index) => statusRow(project, status, index)).join('')}</ul>
    <button type="button" class="btn btn-block" data-action="add-status" data-project-id="${esc(project.id)}">${icon('plus')} Add status</button>`;
}

export function renderProjectSettings({ projectId }) {
  const project = getProject(projectId);
  const idAttr = `data-id="${esc(project.id)}"`;
  return `
    ${pageHeader({
      title: 'Project settings',
      subtitle: projectTitle(project),
      accent: project,
      backFallback: paths.project(projectId, getLastTab(projectId)),
    })}
    <main class="page">
      ${field(
        'Name',
        `<input class="input" value="${esc(project.name)}" data-input="project-name" ${idAttr} dir="auto" maxlength="120" aria-label="Project name">`,
      )}
      ${field('Color', colorRadios({ name: 'project-color', selected: project.color, changeAction: 'project-color', data: { id: project.id } }))}
      ${field('Mission statuses', statusEditor(project))}
      ${field(
        'Manage',
        `<button type="button" class="btn btn-block" data-action="toggle-project-archive" ${idAttr}>${icon('archive')} ${project.archived ? 'Unarchive project' : 'Archive project'}</button>
         <button type="button" class="btn btn-danger btn-block" data-action="delete-project" ${idAttr}>${icon('trash')} Delete project</button>`,
      )}
    </main>`;
}

function statusColorSheet(project, status) {
  return `
    ${sheetTitle(`Color for “${status.name}”`)}
    ${colorRadios({ name: 'status-color', selected: status.color, changeAction: 'status-color', data: { projectId: project.id, statusId: status.id } })}
    <button type="button" class="btn btn-block" data-action="close-sheet">Cancel</button>`;
}

export const handlers = {
  click: {
    'pick-status-color': (element) => {
      const project = getProject(element.dataset.projectId);
      openSheet(statusColorSheet(project, findById(project.statuses, element.dataset.statusId, 'Status')));
    },
    'move-status': (element) => {
      const { projectId, statusId, offset } = element.dataset;
      moveStatus(projectId, statusId, Number(offset));
    },
    'delete-status': (element) => {
      const { projectId, statusId } = element.dataset;
      const project = getProject(projectId);
      const status = findById(project.statuses, statusId, 'Status');
      const affected = countMissionsWithStatus(projectId, statusId);
      const movedNote = affected === 0 ? '' : ` · ${plural(affected, 'mission')} moved to “${firstOpenStatus(project, statusId).name}”`;
      withUndo(`Deleted “${status.name}”${movedNote}`, () => deleteStatus(projectId, statusId));
    },
    'add-status': (element) => {
      const status = addStatus(element.dataset.projectId);
      afterRender((root) => {
        const input = root.querySelector(`[data-input="status-name"][data-status-id="${CSS.escape(status.id)}"]`);
        input.focus();
        input.select();
      });
    },
    'toggle-project-archive': (element) => {
      const project = getProject(element.dataset.id);
      const archiving = !project.archived;
      withUndo(archiving ? 'Project archived' : 'Project restored', () => updateProject(project.id, { archived: archiving }));
    },
    'delete-project': (element) => {
      const project = getProject(element.dataset.id);
      const itemCount = getItems(project.id, 'idea').length + getItems(project.id, 'mission').length;
      openSheet(
        confirmSheet({
          title: `Delete “${projectTitle(project)}”?`,
          message: `This removes the project and its ${plural(itemCount, 'idea or mission', 'ideas and missions')} from this phone. It can’t be undone.`,
          confirmLabel: itemCount === 0 ? 'Delete project' : `Delete project and ${plural(itemCount, 'item')}`,
          action: 'delete-project-confirmed',
          data: { id: project.id },
        }),
      );
    },
    'delete-project-confirmed': (element) => {
      deleteProject(element.dataset.id);
      replaceRoute(paths.home());
      showToast('Project deleted');
    },
  },
  input: {
    'project-name': (element) => updateProject(element.dataset.id, { name: element.value }),
    'status-name': (element) => updateStatus(element.dataset.projectId, element.dataset.statusId, { name: element.value }),
  },
  change: {
    'project-color': (element) => updateProject(element.dataset.id, { color: element.value }),
    'status-color': (element) => updateStatus(element.dataset.projectId, element.dataset.statusId, { color: element.value }),
    'done-status': (element) => setDoneStatus(element.dataset.projectId, element.dataset.statusId),
  },
};
