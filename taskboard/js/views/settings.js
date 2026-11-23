// App settings: backup export/restore, storage status and install instructions.

import { canShareFiles, exportBackup, readBackupFile } from '../backup.js';
import { confirmSheet, pageHeader } from '../components.js';
import { icon } from '../icons.js';
import { getLastBackupAt, setLastBackupAt } from '../prefs.js';
import { canPromptInstall, getStoragePersistence, isStandalone } from '../pwa.js';
import { paths } from '../router.js';
import { openSheet } from '../sheet.js';
import { getState, replaceState } from '../store.js';
import { showToast } from '../toast.js';
import { assert, esc, formatTimestamp, plural } from '../util.js';

const PERSISTENCE_TEXT = {
  checking: 'Checking storage…',
  persistent: '✓ Storage is persistent: the browser will not clear your data on its own.',
  'best-effort': 'The browser may clear data if the phone runs very low on space. Install the app and export backups regularly.',
  unsupported: 'This browser does not report storage persistence. Export backups regularly.',
};

/** A validated backup waiting for the user to confirm the restore. */
let pendingBackup = null;

function cardTitle(iconName, text) {
  return `<h2 class="card-title"><span class="icon-tile" aria-hidden="true">${icon(iconName)}</span>${esc(text)}</h2>`;
}

function backupCard() {
  const lastBackupAt = getLastBackupAt();
  const shareAvailable = canShareFiles();
  const shareButton = shareAvailable
    ? `<button type="button" class="btn btn-primary btn-block" data-action="export-backup" data-method="share">${icon('share')} Save backup… (Files, Drive, email)</button>`
    : '';
  return `
    <section class="settings-card">
      ${cardTitle('download', 'Backup')}
      <p>Your data is stored only on this device. Export a backup now and then, and keep the file somewhere safe.</p>
      <p class="muted">Last backup: ${lastBackupAt === null ? 'never' : esc(formatTimestamp(lastBackupAt))}</p>
      ${shareButton}
      <button type="button" class="btn btn-block ${shareAvailable ? '' : 'btn-primary'}" data-action="export-backup" data-method="download">
        ${icon('download')} Download backup file
      </button>
      <label class="btn btn-block">
        ${icon('upload')} Restore from backup…
        <input type="file" class="visually-hidden" accept="application/json,.json" data-change="import-backup">
      </label>
    </section>`;
}

function storageCard() {
  const { projects, items } = getState();
  return `
    <section class="settings-card">
      ${cardTitle('database', 'Storage')}
      <p class="tabular">${plural(projects.length, 'project')} · ${plural(items.length, 'idea or mission', 'ideas and missions')}</p>
      <p class="muted">${esc(PERSISTENCE_TEXT[getStoragePersistence()])}</p>
    </section>`;
}

function installCard() {
  let body;
  if (isStandalone()) {
    body = '<p>✓ Installed: you are using Taskboard from your home screen.</p>';
  } else if (canPromptInstall()) {
    body = `<p>Add Taskboard to your home screen so it opens like an app and works offline.</p>
      <button type="button" class="btn btn-primary btn-block" data-action="install-app">${icon('phone')} Install app</button>`;
  } else {
    body = `
      <p><strong>iPhone / iPad:</strong> open this page in Safari, tap the Share button, then “Add to Home Screen”.</p>
      <p><strong>Android:</strong> open this page in Chrome, tap the ⋮ menu, then “Install app” or “Add to Home screen”.</p>`;
  }
  return `
    <section class="settings-card">
      ${cardTitle('phone', 'Install on your phone')}
      ${body}
    </section>`;
}

export function renderSettings() {
  return `
    ${pageHeader({ title: 'Settings', backFallback: paths.home() })}
    <main class="page">
      ${backupCard()}
      ${storageCard()}
      ${installCard()}
    </main>`;
}

export const handlers = {
  click: {
    'export-backup': async (element) => {
      element.setAttribute('aria-busy', 'true');
      const exported = await exportBackup(element.dataset.method);
      if (exported) showToast('Backup saved');
    },
    'restore-backup-confirmed': () => {
      assert(pendingBackup !== null, 'No backup is waiting to be restored');
      replaceState(pendingBackup.data);
      pendingBackup = null;
      setLastBackupAt(Date.now());
      showToast('Backup restored');
    },
  },
  change: {
    'import-backup': async (input) => {
      if (input.files.length === 0) return; // the user closed the file picker
      const file = input.files[0];
      input.value = ''; // lets the same file be picked again later
      pendingBackup = await readBackupFile(file);
      const { projects, items } = pendingBackup.data;
      openSheet(
        confirmSheet({
          title: 'Replace all data with this backup?',
          message:
            `Backup from ${formatTimestamp(Date.parse(pendingBackup.exportedAt))}: ` +
            `${plural(projects.length, 'project')}, ${plural(items.length, 'idea or mission', 'ideas and missions')}. ` +
            'Everything currently on this phone is replaced. This can’t be undone.',
          confirmLabel: 'Replace my data',
          action: 'restore-backup-confirmed',
        }),
      );
    },
  },
};
