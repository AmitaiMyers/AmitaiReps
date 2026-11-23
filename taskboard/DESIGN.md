# Taskboard Design System

> Status: **implemented** (Phase 2). Tokens live in `css/tokens.css`, components in `css/components/*.css` and
> `js/components.js`, motion in `js/motion.js` + `css/motion.css`. Where the build differs from the original
> proposal, the text below says so. Verified by `tests/taskboard/e2e.cjs` (85 checks, light/dark screenshots).

Design principle in one line: **calm surface, tactile response.** The screen stays quiet so your projects stand out,
and every touch gets an immediate, physical-feeling answer.

---

## 0. Audit of the current UI (what this design fixes)

| # | Problem today | Why it matters | Fix (section) |
|---|---|---|---|
| A1 | Unselected status/priority chips are faded to 50% opacity: white-on-purple drops to **1.9:1** contrast. | Fails WCAG AA (needs 4.5:1); options are hard to read. | Tinted chips with full-contrast text (§4.3) |
| A2 | Checkbox ring `#c3c7d6` on white is ~1.7:1. | Fails the 3:1 rule for controls; the done-target is hard to see. | `--border-control` (§1.2) |
| A3 | Star (36px) and checkbox (38px) tap areas are under 44px. | Mis-taps on a phone. | 44px hit areas with smaller visuals (§3.3) |
| A4 | Every status group shows its own "Add mission" row; 4 empty groups = 4 inputs. | Noise and decision cost: "which one do I type in?". | One thumb-zone composer (§5.3, decision D2) |
| A5 | The page is rebuilt with `innerHTML` on every tap, so nothing can animate between states. | No motion continuity: items "teleport" between groups. | DOM morphing + FLIP (§6, decision D1) |
| A6 | Deletes use the browser's `confirm()` box. | Breaks immersion; blocks the thread; can't be styled or undone. | Undo toasts and in-app confirm sheet (§4.8) |
| A7 | No press, hover or loading states; no page transitions. | The app feels static and unresponsive. | Interaction states + motion tokens (§2, §3) |
| A8 | No "what's due today" view: you have to open every project. | High cognitive load for the most common question. | Home "Focus" strip (§5.2, decision D4) |

---

## 1. Color

### 1.1 Brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `#4F5BD5` | `#8C95FF` | Primary buttons, active tab text, focus ring, links |
| `--primary-pressed` | `#3D47B8` | `#A7AEFF` | `:active` state of primary |
| `--primary-soft` | `#ECEEFF` | `#2B2F63` | Selected backgrounds, tinted icons, hover |
| `--on-primary` | `#FFFFFF` (5.5:1) | `#12142A` (6.8:1) | Text/icons on `--primary` |
| `--secondary` (Sunrise) | `#F5B400` | `#FFC83D` | Star, "today" highlights. **Never for text.** |

Indigo was chosen because it is calm, has no status meaning (green/orange/red are taken by statuses),
and reads well in both themes.

### 1.2 Neutrals (surfaces and ink)

| Token | Light | Dark | Measured contrast |
|---|---|---|---|
| `--canvas` (page background) | `#F6F7FB` | `#12142A` | — |
| `--surface` (cards, rows) | `#FFFFFF` | `#1E2140` | — |
| `--surface-sunken` (tracks, segmented bg) | `#EDEFF6` | `#272A4C` | — |
| `--surface-raised` (sheets, toasts) | `#FFFFFF` + shadow | `#2A2E55` | — |
| `--ink` (primary text) | `#1F2033` | `#ECEDF7` | 16.0 / 13.4 on surface |
| `--ink-secondary` (meta, labels) | `#5C6078` | `#A9ACC6` | 6.2 / 7.0 on surface, 5.4 / 6.2 on sunken |
| `--border` (hairlines) | `#E2E5EE` | `#34385C` | decorative only |
| `--border-control` (checkbox ring, inputs) | `#8D92AB` | `#6B7099` | 3.1:1, meets the 3:1 control rule |

Rule: **no text uses a color lighter than `--ink-secondary`.** Placeholders use `--ink-secondary` too.

### 1.3 Semantic

| Token | Light text | Dark text | Fill (icons, bars) |
|---|---|---|---|
| `--success` | `#0A7D4F` (5.2:1) | `#3DDC97` (8.8:1) | `#00C875` |
| `--warning` / today | `#9A5B00` (5.4:1) | `#FFB547` (8.9:1) | `#FDAB3D` |
| `--danger` / overdue | `#C62A45` (5.5:1) | `#FF7A8F` (6.3:1) | `#E2445C` |
| `--info` | `#2F6FE0` | `#7FB0FF` | `#579BFC` |

### 1.4 Data colors (statuses, labels, projects)

The 12-color palette in `js/constants.js` stays. These are **data colors** the user picks, so they are never used for
UI chrome. Text on them keeps the existing rule: white or ink, whichever has the higher contrast (`readableTextColor`).

---

## 2. Typography

**Font:** the system stack (`-apple-system, "SF Pro Text", Roboto, "Segoe UI", "Noto Sans Hebrew", sans-serif`).
It costs nothing to download, works offline, matches the OS, and has excellent Hebrew glyphs on both iOS and Android.

**Scale** (ratio ≈ 1.2, rem-based so the phone's text-size setting is respected):

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--text-display` | 1.75rem / 1.2 (28px) | 750 | Item title on the item page |
| `--text-title` | 1.25rem / 1.25 (20px) | 700 | App bar title, sheet titles |
| `--text-heading` | 1.0625rem / 1.3 (17px) | 650 | Project card name, group headers |
| `--text-body` | 1rem / 1.45 (16px) | 450 | Item titles, inputs (16px also prevents iOS zoom-on-focus) |
| `--text-label` | 0.875rem / 1.35 (14px) | 600 | Buttons, chips, tabs |
| `--text-meta` | 0.8125rem / 1.35 (13px) | 500 | Due date, counts, timestamps |
| `--text-overline` | 0.75rem / 1.3 (12px), `letter-spacing: .06em`, uppercase | 700 | Field labels ("STATUS") |

- Counts and progress use `font-variant-numeric: tabular-nums` so numbers don't jiggle as they change.
- Long titles wrap; they are never truncated in lists (the full text is the point). Pills and group names truncate with an ellipsis.

---

## 3. Space, shape, elevation, sizing

### 3.1 Spacing: 4px base grid

`--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px` (page gutter) · `--space-5: 20px` ·
`--space-6: 24px` (between sections) · `--space-8: 32px` · `--space-10: 40px`

Rules: inside a component use 4–12; between components use 16; between sections use 24–32.
Related things sit closer than unrelated things (proximity carries the grouping, not extra borders).

### 3.2 Radius

`--radius-xs: 6px` (tags) · `--radius-sm: 10px` (chips, inputs, pills) · `--radius-md: 14px` (cards, groups) ·
`--radius-lg: 22px` (sheets) · `--radius-full` (avatars, checkbox, swatches)

### 3.3 Sizing and touch

- **Minimum hit area 44×44px** for anything tappable. A visual element can be smaller (checkbox 24px, star 22px),
  but its button is 44px.
- Row height ≥ 56px; list rows have 8px of vertical padding so neighboring targets never touch.
- Primary actions sit in the **bottom third** of the screen (thumb zone): composer, sheet buttons, toasts.

### 3.4 Elevation (light theme; dark theme uses surface lightness instead of shadows)

| Level | Shadow | Use |
|---|---|---|
| 0 | none | Canvas, sunken tracks |
| 1 | `0 1px 2px rgb(20 22 50/6%), 0 2px 8px rgb(20 22 50/4%)` | Cards, rows, active tab |
| 2 | `0 4px 16px rgb(20 22 50/10%)` | Card being dragged/pressed-and-held, composer |
| 3 | `0 12px 40px rgb(20 22 50/18%)` | Sheets, toasts |

---

## 4. Components and their states

Every interactive component defines the same six states. Hover only applies on devices with a real pointer
(`@media (hover: hover)`), so phones never get "stuck" hover styles.

| State | Treatment |
|---|---|
| Rest | As specified per component |
| Hover (pointer only) | Background mixes 6% of `--ink` (or `--primary-soft` for primary-tinted items) |
| Pressed (`:active`) | `transform: scale(.97)` + 10% ink overlay, 90ms; release springs back over 180ms |
| Focus-visible | 2px `--primary` ring, 2px offset (never removed; keyboard and switch-control users depend on it) |
| Disabled | 40% opacity, `cursor: default`, `aria-disabled="true"`; still focusable with an explanation in `aria-describedby` where useful |
| Busy | Inline spinner replaces the icon, the label stays, `aria-busy="true"`; only used for async work over 300ms (backup export) |

### 4.1 App bar
Sticky, translucent (`--canvas` at 85% + 16px blur). Left: back button (44px) or the app name. Center/left: title with
the project color dot. Right: at most two icon actions. While the page scrolls, a hairline border fades in
(it's hidden at the top to reduce chrome).

### 4.2 Segmented control (Projects/Starred, Ideas/Missions, List/Board)
Sunken track with a **sliding raised thumb** that animates to the selected segment (240ms, emphasized easing).
`role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` pointing to the panel (`role="tabpanel"`).

### 4.3 Chip (status/priority choice) — fixes A1
- Unselected: `--surface-sunken` background, a 10px color dot in the status color, `--ink` text (≥ 5.4:1).
- Selected: filled with the status color, readable text, a check icon, 2px ring in the status color.
- Selection change: the fill grows from the dot outwards (`clip-path` circle, 200ms).

### 4.4 Item row / card
- Left: 44px checkbox (missions only). Middle: title (wraps) + meta line. Right: star + status pill.
- Color label: a 4px stripe on the leading edge (the **start** side, so it flips for RTL text, see §5.5).
- Done: title gets a strikethrough that **draws left-to-right** (200ms) and fades to `--ink-secondary`.
- Overdue: due date in `--danger` with a calendar icon; today in `--warning`.
- Long-press (500ms; right-click with a mouse) opens a quick-actions sheet: status, color label, Star, Open, Delete.
  The finger-release click after a gesture is swallowed, so lifting your finger never taps the sheet that just opened.

### 4.5 Checkbox
24px ring (`--border-control`). On check: the ring fills with the project's done-status color (scale 0.6→1.1→1,
spring) and the check mark **draws** via `stroke-dashoffset` (180ms). Android also gets a 10ms vibration.

### 4.6 Star toggle
Outline in `--ink-secondary`; on: filled `--secondary`, a "pop" (scale 1→1.35→1 with a 12° wiggle, 280ms) and
a burst of 6 tiny dots (CSS only, `prefers-reduced-motion` turns it off).

### 4.7 Bottom sheet
Grab handle on top; slides up 320ms (emphasized-decelerate), the backdrop fades in. It can be **dragged down to
dismiss** (closes past 30% of its height or at fast flick velocity). Focus is trapped inside (`<dialog>` gives this),
`aria-labelledby` points to its title, and Escape/back gesture closes it.
On close, the real `<dialog>` closes **immediately** and an inert copy slides away: a modal dialog makes the rest of
the page inert, so animating the real one would swallow taps and typing for the length of the animation.

### 4.8 Toast — fixes A6
Bottom, above the composer. Undoable actions (done, delete, convert, archive, status change) show
**"Mission deleted · Undo"** for 5s; tapping Undo restores the exact previous state. This replaces `confirm()` for
everything except **Delete project** and **Restore backup**, which use an in-app confirm sheet with a red
primary button labeled with the consequence ("Delete 12 missions").
`role="status"` + `aria-live="polite"`; errors use `role="alert"`.

### 4.9 Composer (new) — fixes A4
A pill-shaped input docked at the bottom (thumb zone, above the safe area): "Add mission…" + a status chip showing where it
will land (defaults to the first open status; tap the chip to change). On submit, the new row **slides into place** in
its group, the input stays focused, and the counter ticks up. In board view the target is the column in view.

### 4.10 Empty states
A tinted icon tile (48px, `--primary-soft`), one sentence, and one primary action. Never more than one call to action.

### 4.11 Loading
Data loads from IndexedDB in well under 100ms, so there is **no spinner**. If startup takes longer than 150ms,
skeleton rows (shimmering `--surface-sunken` bars) appear and are replaced by the real content.

### 4.12 Save feedback
Editing autosaves. A small "Saved ✓" appears in the item page's app bar once the write (400ms after typing stops)
succeeds, and fades out after 1.5s. If a save fails, a persistent red error toast says so; the data counts as unsaved
until a write succeeds, so the next change (or backgrounding the app) retries it.

---

## 5. Usability and user journeys

### 5.1 Information architecture (3 levels, no dead ends)

```
Home ── Focus strip (overdue + today, all projects)
 │      Projects | Starred
 ├── Project ── Ideas | Missions   (List ⇄ Board)
 │     └── Item (idea or mission)
 │     └── Project settings
 └── Settings (backup, storage, install)
```
The back gesture always goes one level up; switching tabs never adds history (already implemented).

### 5.2 Core journeys (target: fewest taps)

| Journey | Taps today | Target | How |
|---|---|---|---|
| First launch → first mission | 5 | **3** | Empty home CTA → name → Create lands in Missions with the composer **focused** (Android opens the keyboard; iOS only allows that from a tap) |
| Add a mission to an open project | 2 | **1** | Composer is always visible; type + Enter |
| Mark a mission done | 1 | 1 (+ swipe) | Checkbox, or swipe right on the row (decision D3) |
| Change a status | 2 | 2 (or 1 swipe) | Pill → sheet; swipe left reveals the next status |
| "What do I need to do today?" | open each project | **0** | Home Focus strip (decision D4) |
| Recover from a mistake | impossible (confirm only) | **1** | Undo in the toast |

### 5.3 Cognitive-load rules
1. **One primary action per screen** (filled indigo button); everything else is secondary or an icon.
2. **Progressive disclosure:** the item page shows Status, Priority, Due date and Notes; Checklist and Color label
   collapse into "More details" until used.
3. **Recognition over recall:** statuses are always shown as color + text, never color alone.
4. **Consistent placement:** destructive actions are always last and red; primary actions are always bottom-right or full-width.

### 5.4 Accessibility checklist (WCAG 2.2 AA)
- Text contrast ≥ 4.5:1 and control contrast ≥ 3:1 in both themes (measured in §1).
- Touch targets ≥ 44px (§3.3). Gestures always have a tap alternative (swipe = checkbox/pill).
- Landmarks: `header`, `main`, `nav`; one `h1` per page.
- ARIA: tabs (§4.2), `aria-pressed` on toggles, `aria-expanded` on collapsible groups, labelled dialogs,
  live-region toasts, `aria-describedby` on inputs with hints.
- `prefers-reduced-motion`: replace movement with 120ms opacity fades; no bursts, no parallax.
- Text scales with the OS setting (rem units; no fixed-height text containers).
- Color is never the only signal (overdue has an icon + word, done has strikethrough + check).

### 5.5 Hebrew and English (bidirectional)
- All user text uses `dir="auto"`; layout chrome stays LTR (English UI).
- Rows lay out with **logical properties** (`inset-inline-start` for the label stripe) and set `dir="auto"` on
  the title cell only, so a Hebrew title aligns to the right *within its cell* while the checkbox and pill stay put.
- Notes use `unicode-bidi: plaintext`, so every paragraph picks its own direction (a Hebrew line under an English one).

---

## 6. Motion

### 6.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 90ms | Press feedback |
| `--dur-quick` | 160ms | Color/opacity changes, toggles |
| `--dur-base` | 240ms | Layout moves (FLIP), segmented thumb, page transitions |
| `--dur-slow` | 320ms | Sheets, large enter/exit |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | Most transitions |
| `--ease-emphasized` | `cubic-bezier(.05, .7, .1, 1)` | Things entering (sheets, new rows) |
| `--ease-exit` | `cubic-bezier(.3, 0, .8, .15)` | Things leaving (delete, dismiss) |
| spring (JS, WAAPI) | overshoot 1.1, settle 280ms | Checkbox, star pop |

### 6.2 Choreography
- **Page navigation:** View Transitions API (Chrome/Android 111+, iOS Safari 18+). Forward slides in from the right
  with the old page shifting 30% left; back reverses. The project color dot is a shared element that morphs from the
  project card into the app bar. Unsupported browsers just swap instantly.
- **Status change / done:** the row first shows its new state in place (pill color, check), **pauses 350ms** so you see it,
  then FLIP-animates to its new group while the group counters tick.
- **Add:** the new row expands from 0 height + fades in (240ms, emphasized). **Delete:** it collapses to 0 height (200ms, exit).
- **Group collapse:** height animates via `grid-template-rows: 0fr ⇄ 1fr` (no JS measuring).
- **Board:** columns snap; the column under your thumb highlights its header.

### 6.3 Haptics (Android only; iOS web has no vibration API)
10ms on check/complete, 15ms on long-press open, a 10-40-10 pattern on delete. Skipped when reduced motion is on.

---

## 7. Front-end architecture changes for Phase 2

| Change | Why |
|---|---|
| `css/tokens.css`: every value in §1–§3 and §6 as a custom property, plus dark-theme overrides | One source of truth; components never use raw hex/px |
| Split `styles.css` into `base.css`, `components/*.css`, `utilities.css` | Find and change a component in one place |
| **DOM morphing** instead of `innerHTML` swaps (decision D1) | Elements persist between renders, so FLIP/CSS transitions, focus and scroll all survive |
| `js/motion.js`: `flip(elements, mutate)`, `withViewTransition(fn)`, `prefersReducedMotion()` | All motion goes through one tested helper and respects reduced motion |
| `js/undo.js`: snapshot before undoable mutations, restore on Undo | Replaces `confirm()`; tiny because the whole state is plain data |
| `js/gestures.js`: pointer-event swipe/long-press with axis lock and a 10px threshold | Swipe actions without breaking vertical scroll |
| Screenshots for review (light/dark, 390px and 768px) captured by the e2e script (`tests/taskboard/screenshots/`) | Design stays consistent as features change |

---

## 8. Decisions (resolved)

All four recommendations were accepted and built:

- **D1 Rendering:** idiomorph 0.7.4 (0BSD; ~10 KB minified) vendored unmodified as readable ESM in `js/vendor/`.
  Only the focused *text field* is protected from re-rendering (focused buttons still update).
- **D2 Adding items:** one bottom composer; per-group "Add" rows removed (checklists keep an inline add row).
- **D3 Swipe gestures:** right = done/not done (missions), left = next status (ideas and missions), list rows only
  (board cards scroll horizontally, so they use taps and long-press).
- **D4 Focus strip:** "Today" on the home screen, first 5 with "Show all".
