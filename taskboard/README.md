# Taskboard

A simple, personal Monday/Jira-style app for projects, ideas and missions. It's a Progressive Web App (PWA):
install it on your phone's home screen and it works fully offline.

## Features

- **Projects** with a color, progress bar, archive and delete.
- **Today**: the home screen lists overdue and due-today missions from every project.
- Each project has two tabs:
  - **Ideas**: quick notes with a status (New / Maybe / Approved / Dropped) and a **Turn into mission** button.
  - **Missions**: tasks with a status, priority, due date (overdue ones turn red), notes and a checklist.
- **Add anything from the bar at the bottom**: type and press Enter (the keyboard stays up for the next one).
  Tap the status chip on the left of the bar to choose where new items go; on the board it follows the column you're looking at.
- **Mark** items: checkbox = done, ★ star (floats to the top and appears in the home "Starred" tab), color label.
- **Gestures** (each has a tap alternative): swipe right = done, swipe left = next status, long-press = quick actions.
- **Undo** for every change you might regret (done, status, delete, convert, archive, delete status).
- **Statuses are editable per project**: rename, recolor, add, reorder, delete, and choose which one counts as "Done".
- **List view** (collapsible groups) or **Board view** (columns you swipe through).
- Hebrew and English text both display in the right direction automatically.
- Light and dark theme follow your phone; animations respect "Reduce motion".

The design system (colors, type, spacing, motion, accessibility) is documented in [DESIGN.md](DESIGN.md).

## Your data

Everything is stored **only on your device** (IndexedDB). Nothing is sent anywhere.

- **Settings → Backup**: export a JSON backup (share it to Files/Drive/email, or download it).
  The home screen reminds you if you haven't backed up in 14 days.
- **Settings → Restore from backup** replaces all data with a backup file (it is fully validated first).
- Deleting the app or clearing the browser's site data deletes your data, so keep a backup.

## Deploy (one-time setup)

1. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge this folder into `main`. The workflow `.github/workflows/deploy-taskboard.yml` publishes it to
   `https://amitaimyers.github.io/AmitaiReps/`.

Every later push to `main` that touches `taskboard/` redeploys automatically. The installed app shows an
**"A new version is available → Update"** message the next time you open it.

## Install on your phone

- **iPhone:** open the URL in **Safari** → Share → **Add to Home Screen**.
- **Android:** open the URL in **Chrome** → ⋮ menu → **Install app** (or use the button in Settings).

## Run locally

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory taskboard
# open http://localhost:8000
```

The service worker is skipped on `localhost` so your edits show up on reload.
Use `http://127.0.0.1:8000` to test offline mode with the service worker.

## Code layout

No build step: plain HTML, CSS and JavaScript modules, plus one vendored library (idiomorph, for DOM morphing).

| Path | Purpose |
| --- | --- |
| `index.html`, `manifest.webmanifest`, `sw.js` | App shell, install metadata, offline cache |
| `css/tokens.css` | Design tokens: color, type, space, radius, elevation, motion (light + dark) |
| `css/base.css`, `css/components/*.css`, `css/motion.css`, `css/utilities.css` | Base styles, one file per component family, transitions |
| `js/app.js` | Startup, rendering (idiomorph morph + layout animation), page transitions |
| `js/dispatch.js` | Routes `data-action` / `data-input` / `data-change` / `data-submit` events to named handlers |
| `js/router.js` | Hash routes (`#/p/<id>/missions`, `#/i/<id>`, …), back-button handling, navigation direction |
| `js/store.js`, `js/schema.js`, `js/db.js` | All data reads and changes (validated, then saved), data shape, IndexedDB |
| `js/undo.js`, `js/gestures.js`, `js/motion.js` | Undo snapshots, swipe/long-press, all animation |
| `js/sheet.js`, `js/toast.js`, `js/effects.js` | Bottom sheet, toasts, post-render hooks and small DOM effects |
| `js/components.js`, `js/icons.js` | Shared HTML pieces and icons |
| `js/views/*.js` | One file per page, each exporting its render function and its event handlers |
| `js/prefs.js`, `js/backup.js`, `js/pwa.js` | Per-device preferences; backup export/import; service worker and install |
| `js/vendor/idiomorph.esm.js` | idiomorph 0.7.4 (0BSD), unmodified |

When you add a file to this folder, also add it to `ASSETS` in `sw.js` (the deploy workflow checks this).

## Tests

```sh
cd tests/taskboard
npm install && npx playwright install chromium   # first time only
npm test
```

Runs every feature in an emulated iPhone (with and without animation, and offline), then saves light/dark
screenshots at 390px and 768px to `tests/taskboard/screenshots/` for review.
