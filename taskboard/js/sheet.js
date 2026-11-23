// Bottom sheet built on <dialog> (focus trap, Escape/back to close for free).
// Opens with a slide, closes with a slide, and can be dragged down by its handle to dismiss.

import { animateSheetIn, animateSheetOut } from './motion.js';
import { assert } from './util.js';

const sheet = document.getElementById('sheet');
/** Drag further than this share of the sheet's height (or flick faster than FLICK_SPEED) to dismiss. */
const DISMISS_RATIO = 0.3;
const FLICK_SPEED = 0.6; // px per ms

let drag = null;

function stopAnimations() {
  for (const animation of sheet.getAnimations({ subtree: false })) animation.cancel();
}

/** `html` must contain a heading with id="sheet-title" (the dialog's accessible name). */
export function openSheet(html) {
  assert(html.includes('id="sheet-title"'), 'Every sheet needs a title with id="sheet-title"');
  stopAnimations();
  sheet.style.transform = '';
  sheet.innerHTML = `
    <div class="sheet-handle-zone" data-sheet-handle aria-hidden="true"><span class="sheet-handle"></span></div>
    <div class="sheet-body">${html}</div>`;
  if (!sheet.open) sheet.showModal();
  animateSheetIn(sheet);
}

/**
 * Closes the sheet immediately (a copy animates away), so the page is interactive again right now.
 * restoreFocus: false when an action inside the sheet is about to run (it decides where focus goes, e.g. navigation);
 * otherwise the dialog returns focus to the button that opened it.
 */
export function closeSheet({ restoreFocus = true } = {}) {
  if (!sheet.open) return;
  if (!restoreFocus && sheet.contains(document.activeElement)) document.activeElement.blur();
  animateSheetOut(sheet);
  stopAnimations();
  sheet.close();
  sheet.style.transform = '';
}

// Tapping the dimmed backdrop (the <dialog> itself, outside its content) closes the sheet.
sheet.addEventListener('click', (event) => {
  if (event.target === sheet) closeSheet();
});

// Escape / Android back: animate out instead of the dialog's instant close.
sheet.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSheet();
});

// ---------- Drag the handle down to dismiss ----------

sheet.addEventListener('pointerdown', (event) => {
  if (event.target.closest('[data-sheet-handle]') === null) return;
  drag = { startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, pointerId: event.pointerId };
  sheet.setPointerCapture(event.pointerId);
});

sheet.addEventListener('pointermove', (event) => {
  if (drag === null || event.pointerId !== drag.pointerId) return;
  const elapsed = Math.max(event.timeStamp - drag.lastTime, 1);
  drag.velocity = (event.clientY - drag.lastY) / elapsed;
  drag.lastY = event.clientY;
  drag.lastTime = event.timeStamp;
  const offset = Math.max(0, event.clientY - drag.startY);
  sheet.style.transform = `translateY(${offset}px)`;
});

function endDrag(event) {
  if (drag === null || event.pointerId !== drag.pointerId) return;
  const offset = Math.max(0, event.clientY - drag.startY);
  const shouldClose = offset > sheet.offsetHeight * DISMISS_RATIO || drag.velocity > FLICK_SPEED;
  drag = null;
  if (shouldClose) {
    closeSheet();
    return;
  }
  sheet.animate([{ transform: `translateY(${offset}px)` }, { transform: 'none' }], { duration: 200, easing: 'ease-out' });
  sheet.style.transform = '';
}

sheet.addEventListener('pointerup', endDrag);
sheet.addEventListener('pointercancel', endDrag);
