// Export and import of all data as a JSON file.

import { setLastBackupAt } from './prefs.js';
import { validateState } from './schema.js';
import { getState } from './store.js';
import { assert, toIsoDate } from './util.js';

const BACKUP_FORMAT = 'taskboard-backup';

function buildBackupFile() {
  const payload = { format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), data: getState() };
  return new File([JSON.stringify(payload, null, 2)], `taskboard-backup-${toIsoDate(new Date())}.json`, {
    type: 'application/json',
  });
}

/** True when the device can hand a file to the system share sheet (iPhone: "Save to Files"). */
export function canShareFiles() {
  if (typeof navigator.canShare !== 'function') return false;
  const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
  return navigator.canShare({ files: [probe] });
}

export function preferredExportMethod() {
  return canShareFiles() ? 'share' : 'download';
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Resolves to false if the user closed the share sheet without sharing. */
function shareFile(file) {
  return navigator.share({ files: [file], title: file.name }).then(
    () => true,
    (error) => {
      // Closing the share sheet rejects with AbortError: a normal user choice, not a failure.
      if (error.name === 'AbortError') return false;
      throw error;
    },
  );
}

/** @param {'share' | 'download'} method  Resolves to true when the backup was actually handed off. */
export async function exportBackup(method) {
  assert(method === 'share' || method === 'download', `Unknown export method "${method}"`);
  const file = buildBackupFile();
  if (method === 'share') {
    const shared = await shareFile(file);
    if (!shared) return false;
  } else {
    downloadFile(file);
  }
  setLastBackupAt(Date.now());
  return true;
}

/** Reads and fully validates a backup file. Throws a readable error if it is not a valid backup. */
export async function readBackupFile(file) {
  const payload = JSON.parse(await file.text());
  assert(typeof payload === 'object' && payload !== null, 'This file is not a Taskboard backup');
  assert(payload.format === BACKUP_FORMAT, 'This file is not a Taskboard backup');
  assert(typeof payload.exportedAt === 'string', 'Backup file is missing its export date');
  validateState(payload.data);
  return payload;
}
