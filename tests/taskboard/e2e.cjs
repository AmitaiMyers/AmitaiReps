// End-to-end tests for Taskboard, in an emulated iPhone (Chromium via Playwright).
//
//   cd tests/taskboard && npm install && npx playwright install chromium   (first time only)
//   node e2e.cjs                       → runs all checks, writes screenshots to ./screenshots
//
// Passes:
//   1. Functional  — every feature, with reduced motion so timing is deterministic (localhost: no service worker).
//   2. Motion      — the same core flows with full animation (view transitions, layout animation, sheet drag).
//   3. Offline     — service worker on 127.0.0.1; the app reloads without network and keeps its data.
//   4. Screenshots — seeded data, light/dark, 390px and 768px wide, for visual review.

const { chromium, devices } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '../../taskboard');
const SHOTS_DIR = path.resolve(__dirname, 'screenshots');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};
const IPHONE = devices['iPhone 13'];

// ---------- Harness ----------

function startServer() {
  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const filePath = path.join(APP_DIR, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath);
    if (!filePath.startsWith(APP_DIR) || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pass(message) {
  console.log(`  ok - ${message}`);
}

function check(condition, message) {
  if (!condition) throw new Error(`CHECK FAILED: ${message}`);
  pass(message);
}

/** Polls `probe` until it returns true (anything else is reported as the last seen value on timeout). */
async function eventually(probe, message, timeout = 4000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await probe();
    if (last === true) {
      pass(message);
      return;
    }
    await sleep(40);
  }
  throw new Error(`CHECK FAILED: ${message} (last value: ${JSON.stringify(last)})`);
}

function watchErrors(page, errors) {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
}

const row = (page, title, scope = '#panel') => page.locator(`${scope} .item`, { has: page.locator('.item-title', { hasText: title }) });
const groupTitles = (page, statusName) =>
  page.locator('.group', { has: page.locator(`.group-name:text-is("${statusName}")`) }).locator('.item-title').allInnerTexts();
const toastText = (page) => page.locator('#toast').evaluate((toast) => (toast.hidden ? '' : toast.innerText));

async function addViaComposer(page, text) {
  await page.fill('#composer-input', text);
  await page.press('#composer-input', 'Enter');
  await row(page, text).first().waitFor();
}

/** Centers the element on screen first: a finger can't reach rows hidden under the fixed composer either. */
async function boxInView(locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  return locator.boundingBox();
}

async function swipe(page, locator, dx) {
  const box = await boxInView(locator);
  const y = box.y + box.height / 2;
  const startX = dx > 0 ? box.x + 30 : box.x + box.width - 30;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(startX + (dx * step) / 10, y);
    await sleep(16);
  }
  await page.mouse.up();
}

/** A real touch long-press (pointerType "touch") through the Chrome DevTools Protocol. */
async function longPress(context, page, locator) {
  const box = await boxInView(locator);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await sleep(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

function isoDay(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ---------- Pass 1: functional ----------

async function functionalPass(browser, base) {
  console.log('\n# Functional (reduced motion)');
  const errors = [];
  const context = await browser.newContext({ ...IPHONE, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(base);

  console.log('First launch');
  await page.locator('.empty-title', { hasText: 'Start your first project' }).waitFor();
  check((await page.locator('#panel button').count()) === 1, 'empty home has exactly one call to action');
  check((await page.locator('.focus, .focus-clear').count()) === 0, 'no Focus strip before any project exists');
  check((await page.locator('[role="tablist"] [role="tab"][aria-selected="true"]').count()) === 1, 'home tabs expose ARIA tab roles');

  console.log('Create project → lands ready to type');
  await page.click('[data-action="new-project"]');
  check(await page.locator('#sheet[open] #sheet-title').isVisible(), 'sheet opens with a labelled title');
  await page.fill('#sheet input[name="name"]', 'Home renovation');
  await page.click('#sheet button[type="submit"]');
  await page.waitForURL(/\/missions$/);
  await eventually(() => page.evaluate(() => document.activeElement.id === 'composer-input'), 'composer is focused in the new project');
  const projectUrl = page.url();

  console.log('Composer');
  for (const title of ['Buy paint', 'Call plumber', 'Fix door']) await addViaComposer(page, title);
  check(JSON.stringify(await groupTitles(page, 'Not started')) === JSON.stringify(['Buy paint', 'Call plumber', 'Fix door']), 'three missions added in order');
  check(await page.evaluate(() => document.activeElement.id === 'composer-input'), 'focus stays in the composer between adds');
  check((await page.inputValue('#composer-input')) === '', 'composer clears after each add');
  await page.click('[data-action="pick-composer-status"]');
  await page.locator('#sheet [data-action="set-composer-status"]', { hasText: 'Working on it' }).click();
  await eventually(async () => (await page.locator('.composer-target-name').innerText()) === 'Working on it', 'composer target can be changed');
  await addViaComposer(page, 'Paint walls');
  check((await groupTitles(page, 'Working on it')).includes('Paint walls'), 'composer adds to the chosen status');
  await page.click('[data-action="pick-composer-status"]');
  await page.locator('#sheet [data-action="set-composer-status"]', { hasText: 'Not started' }).click();

  console.log('Checkbox, undo, star, status sheet');
  await row(page, 'Buy paint').locator('[data-action="toggle-done"]').click();
  await eventually(async () => (await groupTitles(page, 'Done')).includes('Buy paint'), 'checkbox moves the mission to Done');
  await eventually(async () => (await toastText(page)).includes('Done: Buy paint'), 'toast confirms with Undo');
  await page.click('#toast [data-action="undo"]');
  await eventually(async () => (await groupTitles(page, 'Not started')).includes('Buy paint'), 'Undo puts it back');
  await row(page, 'Buy paint').locator('[data-action="toggle-done"]').click();
  await eventually(async () => (await groupTitles(page, 'Done')).includes('Buy paint'), 'done again');

  await row(page, 'Call plumber').locator('[data-action="toggle-star"]').click();
  await eventually(async () => (await row(page, 'Call plumber').locator('.star.on').count()) === 1, 'mission starred');
  await row(page, 'Call plumber').locator('[data-action="pick-status"]').click();
  await page.locator('#sheet [data-action="set-status"]', { hasText: 'Stuck' }).click();
  await eventually(async () => (await groupTitles(page, 'Stuck')).includes('Call plumber'), 'status sheet moves the mission');
  check((await toastText(page)).includes('Moved to “Stuck”'), 'status change is undoable');

  console.log('Stale undo is refused');
  await row(page, 'Fix door').locator('[data-action="toggle-done"]').click();
  await eventually(async () => (await groupTitles(page, 'Done')).includes('Fix door'), 'Fix door done');
  await row(page, 'Paint walls').locator('[data-action="toggle-star"]').click(); // not undoable; changes data
  await page.click('#toast [data-action="undo"]');
  await eventually(async () => (await toastText(page)).includes('Can’t undo'), 'undo after a newer change is refused');
  check((await groupTitles(page, 'Done')).includes('Fix door'), 'refused undo changed nothing');

  console.log('Swipe gestures');
  await swipe(page, row(page, 'Fix door'), 220);
  await eventually(async () => (await groupTitles(page, 'Not started')).includes('Fix door'), 'swipe right on a done mission reopens it');
  await swipe(page, row(page, 'Fix door'), -220);
  await eventually(async () => (await groupTitles(page, 'Working on it')).includes('Fix door'), 'swipe left moves to the next status');
  await swipe(page, row(page, 'Fix door'), 40);
  await sleep(150);
  check((await groupTitles(page, 'Working on it')).includes('Fix door'), 'a short swipe springs back without acting');
  check(new URL(page.url()).pathname === new URL(projectUrl).pathname && page.url() === projectUrl, 'a swipe never opens the item');

  console.log('Quick actions (long-press and right-click)');
  await longPress(context, page, row(page, 'Paint walls'));
  await page.locator('#sheet[open] #sheet-title', { hasText: 'Paint walls' }).waitFor();
  pass('touch long-press opens the quick-actions sheet');
  await page.locator('#sheet input[name="menu-label"][value="#a25ddc"]').check();
  await eventually(async () => (await row(page, 'Paint walls').getAttribute('class')).includes('has-label'), 'label set from the quick-actions sheet');
  check(page.url() === projectUrl, 'long-press did not navigate');
  await row(page, 'Paint walls').click({ button: 'right' });
  await page.locator('#sheet[open] [data-action="delete-item-quick"]').click();
  await eventually(async () => (await row(page, 'Paint walls').count()) === 0, 'delete from quick actions');
  await page.click('#toast [data-action="undo"]');
  await eventually(async () => (await row(page, 'Paint walls').count()) === 1, 'undo restores the deleted mission');

  console.log('Item page');
  await row(page, 'Call plumber').locator('.item-title').click();
  await page.waitForURL(/#\/i\//);
  const itemUrl = page.url();
  await page.locator('[data-action="set-priority"][data-priority="high"]').click();
  await eventually(async () => (await page.locator('[data-action="set-priority"][data-priority="high"]').getAttribute('aria-pressed')) === 'true', 'priority chip selected');
  await page.fill('input[type="date"]', isoDay(-1));
  check((await page.getAttribute('[data-action="toggle-more"]', 'aria-expanded')) === 'false', '"More details" starts collapsed when unused');
  check((await page.locator('#more-details').getAttribute('inert')) !== null, 'collapsed details are inert (not focusable)');
  await page.click('[data-action="toggle-more"]');
  await eventually(async () => (await page.getAttribute('[data-action="toggle-more"]', 'aria-expanded')) === 'true', '"More details" expands');
  for (const entry of ['Find number', 'Schedule visit']) {
    await page.fill('form[data-submit="checklist-add"] input', entry);
    await page.press('form[data-submit="checklist-add"] input', 'Enter');
    await page.locator('.checklist-text').last().waitFor();
  }
  check(await page.evaluate(() => document.activeElement.closest('form[data-submit="checklist-add"]') !== null), 'checklist input keeps focus');
  await page.locator('[data-action="checklist-toggle"]').first().click();
  await eventually(async () => (await page.locator('.field-label', { hasText: 'Checklist · 1/2' }).count()) === 1, 'checklist progress 1/2');
  await page.fill('#item-notes', 'Ask about the sink.\nשאלה על הכיור');
  await eventually(async () => (await page.locator('.save-indicator.is-visible').count()) === 1, '"Saved ✓" appears after typing');
  await page.fill('#item-title', 'Call plumber!');
  await page.click('[data-action="back"]');
  await page.waitForURL(projectUrl);
  const plumber = row(page, 'Call plumber!');
  await eventually(async () => (await plumber.count()) === 1, 'title edit is saved');
  check((await plumber.locator('.due-overdue').innerText()).includes('Overdue'), 'overdue date is red and says "Overdue"');
  check((await plumber.locator('.tag', { hasText: 'High' }).count()) === 1, 'priority tag shown');
  check((await plumber.locator('.item-meta').innerText()).includes('1/2'), 'checklist count shown');

  console.log('Focus strip (home)');
  await page.click('[data-action="back"]');
  await page.locator('#focus-title').waitFor();
  check((await page.locator('.focus-summary').innerText()) === '1 overdue', 'Focus strip summarises what is due');
  await row(page, 'Call plumber!', '.focus').locator('[data-action="toggle-done"]').click();
  await eventually(async () => (await page.locator('.focus-clear').count()) === 1, 'completing it clears the Focus strip');
  await page.click('#toast [data-action="undo"]');
  await eventually(async () => (await row(page, 'Call plumber!', '.focus').count()) === 1, 'undo brings it back');
  await page.click('.seg-btn:has-text("Starred")');
  await eventually(async () => (await page.locator('#panel .item').count()) === 2, 'Starred tab lists starred missions');
  await page.click('.seg-btn:has-text("Projects")');
  await page.click('.project-card');
  await page.waitForURL(projectUrl);

  console.log('Ideas');
  await page.click('.seg-btn:has-text("Ideas")');
  await page.locator('#composer-input[placeholder="Add idea…"]').waitFor();
  pass('composer switches to ideas');
  await addViaComposer(page, 'Paint the fence');
  await addViaComposer(page, 'Smart lights');
  await row(page, 'Paint the fence').locator('.item-title').click();
  await page.waitForURL(/#\/i\//);
  check((await page.locator('[data-action="set-priority"]').count()) === 0, 'ideas have no priority');
  await page.click('[data-action="convert-idea"]');
  await eventually(async () => (await page.locator('.header-title-text').innerText()) === 'Mission', 'idea becomes a mission');
  await page.click('#toast [data-action="undo"]');
  await eventually(async () => (await page.locator('.header-title-text').innerText()) === 'Idea', 'undo turns it back into an idea');
  await page.click('[data-action="convert-idea"]');
  await page.click('[data-action="back"]');
  await page.locator('.seg-btn.is-active:has-text("Ideas")').waitFor();
  check((await row(page, 'Paint the fence').count()) === 0, 'converted idea left Ideas');

  console.log('Board');
  await page.click('.seg-btn:has-text("Missions")');
  await page.locator('.seg-btn.is-active:has-text("Missions")').waitFor();
  await page.click('[data-action="set-view"][data-mode="board"]');
  await eventually(async () => (await page.locator('.board .column').count()) === 4, 'board shows one column per status');
  await page.locator('.board').evaluate((board) => {
    const column = board.querySelectorAll('.column')[2];
    board.scrollLeft = column.offsetLeft - parseFloat(getComputedStyle(board).paddingLeft);
  });
  await eventually(async () => (await page.locator('.composer-target-name').innerText()) === 'Stuck', 'composer follows the column in view');
  await addViaComposer(page, 'Order tiles');
  check((await page.locator('.column.is-current .item-title').allInnerTexts()).includes('Order tiles'), 'composer adds to the column in view');
  await page.click('[data-action="set-view"][data-mode="list"]');
  await page.locator('.groups').waitFor();

  console.log('Collapse');
  const doneHead = page.locator('.group', { has: page.locator('.group-name:text-is("Done")') }).locator('.group-head');
  await doneHead.click();
  await eventually(async () => (await doneHead.getAttribute('aria-expanded')) === 'false', 'group collapses');
  check((await page.locator('#group-body-' + (await doneHead.getAttribute('data-key')).split(':')[2]).getAttribute('inert')) !== null, 'collapsed group is inert');
  await doneHead.click();

  console.log('Project settings');
  await page.click('a[aria-label="Project settings"]');
  await page.waitForURL(/\/settings$/);
  await page.locator('[data-input="status-name"]').nth(1).fill('In progress');
  await page.click('[data-action="add-status"]');
  await eventually(() => page.evaluate(() => document.activeElement.value === 'New status' && document.activeElement.selectionEnd === 10), 'new status name is focused and selected');
  await page.keyboard.type('Waiting');
  // New statuses go just before the Done status (row 4 of 5); move it up one.
  await page.locator('.status-edit-row').nth(3).locator('[data-action="move-status"][data-offset="-1"]').click();
  await eventually(
    async () => (await page.locator('[data-input="status-name"]').evaluateAll((inputs) => inputs.map((input) => input.value).join('|'))) === 'Not started|In progress|Waiting|Stuck|Done',
    'statuses can be reordered',
  );
  check(await page.locator('.status-edit-row').last().locator('[data-action="delete-status"]').isDisabled(), 'the Done status cannot be deleted');
  await page.locator('.status-edit-row', { has: page.locator('input[value="Stuck"]') }).locator('[data-action="delete-status"]').click();
  await eventually(async () => (await toastText(page)).includes('moved to “Not started”'), 'deleting a status explains where its missions went');
  await page.click('#toast [data-action="undo"]');
  await eventually(async () => (await page.locator('input[value="Stuck"]').count()) === 1, 'status delete can be undone');
  await page.locator('.status-edit-row').first().locator('[data-action="pick-status-color"]').click();
  await page.locator('#sheet input[value="#579bfc"]').check();
  await eventually(async () => !(await page.locator('#sheet[open]').count()), 'color sheet closes after choosing');
  await page.click('[data-action="toggle-project-archive"]');
  await eventually(async () => (await toastText(page)).includes('Project archived'), 'archive is undoable');
  await page.click('#toast [data-action="undo"]');
  await page.click('[data-action="back"]');
  await page.waitForURL(projectUrl);
  const groups = await page.locator('.group-name').allInnerTexts();
  check(groups.join('|') === 'Not started|In progress|Waiting|Stuck|Done', `groups follow edited statuses (${groups.join(' | ')})`);

  console.log('Delete from item page (with undo)');
  await row(page, 'Order tiles').locator('.item-title').click();
  await page.waitForURL(/#\/i\//);
  await page.click('[data-action="delete-item"]');
  await page.waitForURL(projectUrl);
  await eventually(async () => (await row(page, 'Order tiles').count()) === 0, 'deleted and back on the list');
  await page.click('#toast [data-action="undo"]');
  await eventually(async () => (await row(page, 'Order tiles').count()) === 1, 'undo restores it');

  console.log('Persistence');
  await sleep(600);
  await page.goto(itemUrl);
  await page.reload();
  await page.locator('#item-title').waitFor();
  check((await page.inputValue('#item-title')) === 'Call plumber!', 'title persisted');
  check((await page.inputValue('#item-notes')).includes('שאלה'), 'Hebrew notes persisted');
  check((await page.getAttribute('#item-notes', 'dir')) === 'auto', 'text direction follows the text');

  console.log('Backup and restore');
  await page.goto(`${base}#/settings`);
  await page.locator('.settings-card').first().waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-backup"][data-method="download"]')]);
  const backupPath = path.join(SHOTS_DIR, 'backup.json');
  await download.saveAs(backupPath);
  check(JSON.parse(fs.readFileSync(backupPath, 'utf8')).data.projects.length === 1, 'backup file contains the project');
  await page.goto(projectUrl.replace(/\/missions$/, '/settings'));
  await page.click('[data-action="delete-project"]');
  await page.locator('#sheet[open] .btn-danger-solid').waitFor();
  check((await page.locator('#sheet .btn-danger-solid').innerText()).startsWith('Delete project and'), 'delete-project confirm names the consequence');
  await page.click('#sheet [data-action="close-sheet"]');
  await eventually(async () => !(await page.locator('#sheet[open]').count()), 'cancel keeps the project');
  await page.click('[data-action="delete-project"]');
  await page.click('#sheet [data-action="delete-project-confirmed"]');
  await page.waitForURL((url) => url.hash === '#/');
  await page.locator('.empty-title').waitFor();
  pass('project deleted after confirming');
  await page.goto(`${base}#/settings`);
  await page.setInputFiles('input[data-change="import-backup"]', backupPath);
  await page.click('#sheet [data-action="restore-backup-confirmed"]');
  await eventually(async () => (await toastText(page)).includes('Backup restored'), 'backup restored after confirming');
  await page.goto(`${base}#/`);
  await eventually(async () => (await page.locator('.project-card').count()) === 1, 'restored project is back');

  console.log('Invalid backup');
  const badPath = path.join(SHOTS_DIR, 'bad.json');
  fs.writeFileSync(badPath, JSON.stringify({ format: 'taskboard-backup', exportedAt: 'x', data: { schemaVersion: 1, projects: [{ id: 'p' }], items: [] } }));
  await page.goto(`${base}#/settings`);
  await page.setInputFiles('input[data-change="import-backup"]', badPath);
  await page.locator('.toast-error').waitFor();
  check(errors.length === 1 && errors[0].includes('Project name must be text'), 'an invalid backup is rejected with a clear error');
  errors.length = 0;

  console.log('Accessibility basics');
  await page.goto(projectUrl);
  await page.locator('.groups').waitFor();
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, a, input, textarea')]
      .filter((element) => !element.closest('[inert]'))
      .filter((element) => {
        const name = element.getAttribute('aria-label') || element.innerText || element.getAttribute('placeholder') || element.closest('label')?.innerText || '';
        return name.trim() === '' && element.type !== 'hidden';
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  check(unnamed.length === 0, `every control has an accessible name ${unnamed.length ? JSON.stringify(unnamed) : ''}`);
  check((await page.locator('h1').count()) === 1, 'one h1 per page');
  const smallTargets = await page.evaluate(() =>
    [...document.querySelectorAll('#panel .check, #panel .star, .icon-btn')]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && (rect.width < 44 || rect.height < 44)).length,
  );
  check(smallTargets === 0, 'checkbox, star and icon buttons are at least 44×44px');

  await context.close();
  return errors;
}

// ---------- Pass 2: motion ----------

async function motionPass(browser, base) {
  console.log('\n# Motion (full animation)');
  const errors = [];
  const context = await browser.newContext({ ...IPHONE, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(base);
  await page.click('[data-action="new-project"]');
  await page.fill('#sheet input[name="name"]', 'Motion');
  await page.click('#sheet button[type="submit"]');
  await page.waitForURL(/\/missions$/);
  for (const title of ['One', 'Two', 'Three']) await addViaComposer(page, title);
  await row(page, 'One').locator('[data-action="toggle-done"]').click();
  await eventually(async () => (await groupTitles(page, 'Done')).includes('One'), 'done animates into its group (after the pause)');
  await row(page, 'Two').locator('[data-action="toggle-star"]').click();
  await eventually(async () => (await page.locator('.burst').count()) === 1, 'star burst plays');
  await row(page, 'Three').locator('.item-title').click();
  await page.waitForURL(/#\/i\//);
  await page.click('[data-action="back"]');
  await page.waitForURL(/\/missions$/);
  pass('forward and back page transitions run');
  await row(page, 'Two').locator('[data-action="pick-status"]').click();
  await page.locator('#sheet[open]').waitFor();
  await page.locator('#sheet').evaluate((sheet) => Promise.all(sheet.getAnimations().map((animation) => animation.finished)));
  const handle = await page.locator('#sheet .sheet-handle-zone').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 400, { steps: 8 });
  await page.mouse.up();
  await eventually(async () => !(await page.locator('#sheet[open]').count()), 'dragging the sheet handle down dismisses it');
  await row(page, 'Three').click({ button: 'right' });
  await page.locator('#sheet[open] [data-action="delete-item-quick"]').click();
  await eventually(async () => (await page.locator('.ghost').count()) === 1, 'deleted row fades out as a ghost');
  await eventually(async () => (await page.locator('.ghost').count()) === 0, 'ghost is cleaned up');
  await page.click('.seg-btn:has-text("Ideas")');
  await page.locator('.seg-btn.is-active:has-text("Ideas")').waitFor();
  pass('tab switch slides the segmented thumb');
  await context.close();
  return errors;
}

// ---------- Pass 3: offline ----------

async function offlinePass(browser, port) {
  console.log('\n# Offline (service worker)');
  const errors = [];
  const context = await browser.newContext({ ...IPHONE, reducedMotion: 'reduce' });
  const page = await context.newPage();
  watchErrors(page, errors);
  const origin = `http://127.0.0.1:${port}/`;
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.click('[data-action="new-project"]');
  await page.fill('#sheet input[name="name"]', 'Offline project');
  await page.click('#sheet button[type="submit"]');
  await page.waitForURL(/\/missions$/);
  await sleep(600);
  await context.setOffline(true);
  await page.goto(origin);
  await page.locator('.project-name', { hasText: 'Offline project' }).waitFor();
  pass('app loads offline with its data');
  await context.close();
  return errors;
}

// ---------- Pass 4: screenshots ----------

function seedBackup() {
  const now = Date.now();
  const ids = () => crypto.randomUUID();
  const status = (name, color) => ({ id: ids(), name, color });
  const makeProject = (name, color, archived = false) => {
    const statuses = [status('Not started', '#c4c4c4'), status('Working on it', '#fdab3d'), status('Stuck', '#e2445c'), status('Done', '#00c875')];
    return { id: ids(), name, color, archived, createdAt: now, statuses, doneStatusId: statuses[3].id };
  };
  const home = makeProject('Home renovation', '#00c875');
  const app = makeProject('Side project app', '#579bfc');
  const trip = makeProject('Trip to Japan', '#ff158a');
  let order = 0;
  const item = (project, kind, title, statusIndex, extra = {}) => ({
    id: ids(),
    projectId: project.id,
    kind,
    title,
    notes: '',
    status: kind === 'idea' ? ['new', 'maybe', 'approved', 'dropped'][statusIndex] : project.statuses[statusIndex].id,
    priority: null,
    dueDate: null,
    checklist: [],
    starred: false,
    label: null,
    createdAt: now + (order += 1),
    updatedAt: now,
    ...extra,
  });
  const items = [
    item(home, 'mission', 'Call the plumber about the kitchen sink', 2, { priority: 'urgent', dueDate: isoDay(-1), starred: true, notes: 'Ask about the sink' }),
    item(home, 'mission', 'Choose paint colors', 1, {
      priority: 'high',
      dueDate: isoDay(0),
      checklist: [
        { id: ids(), text: 'Living room', done: true },
        { id: ids(), text: 'Bedroom', done: false },
      ],
      label: '#a25ddc',
    }),
    item(home, 'mission', 'לקנות ברגים לארון', 0, { dueDate: isoDay(3) }),
    item(home, 'mission', 'Measure the windows', 0, { priority: 'low' }),
    item(home, 'mission', 'Remove old wallpaper', 3),
    item(home, 'mission', 'Fix the squeaky door', 3),
    item(home, 'idea', 'Solar panels on the roof', 1, { starred: true }),
    item(home, 'idea', 'Herb garden by the window', 0),
    item(app, 'mission', 'Sketch the onboarding flow', 1, { dueDate: isoDay(0), priority: 'medium' }),
    item(app, 'mission', 'Set up the repository', 3),
    item(app, 'idea', 'Dark mode first', 2),
    item(trip, 'mission', 'Book the ryokan in Kyoto', 0, { dueDate: isoDay(5), label: '#ff158a' }),
  ];
  return { format: 'taskboard-backup', exportedAt: new Date().toISOString(), data: { schemaVersion: 1, projects: [home, app, trip], items } };
}

async function screenshotPass(browser, base) {
  console.log('\n# Screenshots');
  const errors = [];
  const seedPath = path.join(SHOTS_DIR, 'seed.json');
  fs.writeFileSync(seedPath, JSON.stringify(seedBackup()));
  const viewports = [
    { name: '390', options: { ...IPHONE } },
    { name: '768', options: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
  ];
  for (const viewport of viewports) {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ ...viewport.options, colorScheme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      watchErrors(page, errors);
      await page.goto(`${base}#/settings`);
      await page.setInputFiles('input[data-change="import-backup"]', seedPath);
      await page.click('#sheet [data-action="restore-backup-confirmed"]');
      await page.locator('#toast:not([hidden])').waitFor();
      await page.click('#toast [data-action="dismiss-toast"]');
      const shot = async (name) => {
        await sleep(120);
        await page.screenshot({ path: path.join(SHOTS_DIR, `${viewport.name}-${colorScheme}-${name}.png`), fullPage: true });
      };
      await page.goto(`${base}#/`);
      await page.locator('.project-card').first().waitFor();
      await shot('1-home');
      await page.click('.project-card');
      await page.locator('.groups').waitFor();
      await shot('2-project-list');
      await page.click('[data-action="set-view"][data-mode="board"]');
      await page.locator('.board').waitFor();
      await shot('3-project-board');
      await page.click('[data-action="set-view"][data-mode="list"]');
      await row(page, 'Choose paint colors').locator('.item-title').click();
      await page.locator('#item-title').waitFor();
      await shot('4-item');
      await page.click('[data-action="back"]');
      await page.locator('.groups').waitFor();
      await row(page, 'Measure the windows').click({ button: 'right' });
      await page.locator('#sheet[open]').waitFor();
      await sleep(200);
      await page.screenshot({ path: path.join(SHOTS_DIR, `${viewport.name}-${colorScheme}-5-quick-actions.png`) });
      await page.keyboard.press('Escape');
      await page.locator('#sheet[open]').waitFor({ state: 'detached' });
      await page.goto(`${base}#/settings`);
      await page.locator('.settings-card').first().waitFor();
      await shot('6-settings');
      await context.close();
      console.log(`  saved ${viewport.name}px ${colorScheme}`);
    }
  }
  return errors;
}

// ---------- Main ----------

(async () => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const base = `http://localhost:${port}/`;
  const browser = await chromium.launch();
  const errors = [
    ...(await functionalPass(browser, base)),
    ...(await motionPass(browser, base)),
    ...(await offlinePass(browser, port)),
    ...(await screenshotPass(browser, base)),
  ];
  await browser.close();
  server.close();
  if (errors.length > 0) {
    console.error(`\nBrowser errors:\n${errors.join('\n')}`);
    process.exit(1);
  }
  console.log(`\nALL CHECKS PASSED — screenshots in ${SHOTS_DIR}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
