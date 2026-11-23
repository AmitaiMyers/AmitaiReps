// Touch gestures on ideas/missions. Every gesture has a tap alternative (checkbox, status pill, ⋯ menu).
//
//   swipe right  (rows with data-swipe-right) → 'toggle-done'
//   swipe left   (rows with data-swipe-left)  → 'next-status'
//   long-press, or right-click with a mouse   → 'item-menu' (quick actions sheet)
//
// A swipe only starts after a clearly horizontal move, so vertical scrolling and the board's horizontal
// scrolling keep working. The click a browser fires when the finger lifts after a gesture is swallowed: otherwise it
// would open the item (after a swipe) or tap whatever is now under the finger, e.g. a chip in the sheet a long-press opened.

import { runAction } from './dispatch.js';
import { HAPTIC, haptic } from './motion.js';

const LOCK_DISTANCE = 10; // px before deciding between swipe, scroll and tap
const COMMIT_RATIO = 0.33; // of the row width
const MAX_COMMIT_DISTANCE = 140; // px; wide screens shouldn't need a full third
const FLICK_SPEED = 0.5; // px per ms
const LONG_PRESS_MS = 500;
const SWALLOW_CLICK_MS = 300; // the click a browser fires right after the gesture's pointer is released

let gesture = null;
/** After a swipe or long-press: until when the release click (and only that one click) is swallowed. */
let swallowReleaseClickUntil = 0;
let lastPointerType = 'mouse';

function commitDistance(row) {
  return Math.min(row.offsetWidth * COMMIT_RATIO, MAX_COMMIT_DISTANCE);
}

function allows(row, direction) {
  const label = direction === 'right' ? row.dataset.swipeRight : row.dataset.swipeLeft;
  return label !== undefined && label !== '';
}

function resetVisuals(row) {
  row.classList.remove('is-swiping', 'swipe-right', 'swipe-left', 'is-armed');
  row.style.removeProperty('--swipe-x');
}

function swallowReleaseClick() {
  swallowReleaseClickUntil = performance.now() + SWALLOW_CLICK_MS;
}

function end() {
  clearTimeout(gesture.longPressTimer);
  gesture = null;
}

function startLongPress() {
  const { row } = gesture;
  gesture.mode = 'long-press';
  haptic(HAPTIC.press);
  runAction('item-menu', row);
}

function onPointerDown(event) {
  lastPointerType = event.pointerType;
  if (!event.isPrimary || event.button !== 0) return;
  const row = event.target.closest('.item');
  if (row === null) return;
  gesture = {
    row,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastTime: event.timeStamp,
    velocity: 0,
    offset: 0,
    armed: false,
    mode: 'pending', // → 'swipe' | 'long-press'
    longPressTimer: event.pointerType === 'mouse' ? null : setTimeout(startLongPress, LONG_PRESS_MS),
  };
}

function lockDirection(dx, dy) {
  const { row } = gesture;
  const horizontal = Math.abs(dx) > LOCK_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.2;
  if (horizontal && row.hasAttribute('data-swipe')) {
    clearTimeout(gesture.longPressTimer);
    gesture.mode = 'swipe';
    row.setPointerCapture(gesture.pointerId);
    row.classList.add('is-swiping');
    return;
  }
  // Scrolling (or a horizontal drag on a non-swipeable board card): not our gesture.
  if (Math.hypot(dx, dy) > LOCK_DISTANCE) end();
}

function updateSwipe(event, dx) {
  const { row } = gesture;
  const direction = dx > 0 ? 'right' : 'left';
  // Resist (a lot) in a direction the row doesn't support, so it still feels physical.
  const offset = allows(row, direction) ? dx : dx * 0.15;
  const elapsed = Math.max(event.timeStamp - gesture.lastTime, 1);
  gesture.velocity = (event.clientX - gesture.lastX) / elapsed;
  gesture.lastX = event.clientX;
  gesture.lastTime = event.timeStamp;
  gesture.offset = offset;
  row.style.setProperty('--swipe-x', `${offset}px`);
  row.classList.toggle('swipe-right', offset > 0 && allows(row, 'right'));
  row.classList.toggle('swipe-left', offset < 0 && allows(row, 'left'));
  const armed = allows(row, direction) && Math.abs(offset) >= commitDistance(row);
  if (armed !== gesture.armed) {
    gesture.armed = armed;
    row.classList.toggle('is-armed', armed);
    if (armed) haptic(HAPTIC.tap);
  }
}

function onPointerMove(event) {
  if (gesture === null || event.pointerId !== gesture.pointerId) return;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  if (gesture.mode === 'pending') lockDirection(dx, dy);
  if (gesture !== null && gesture.mode === 'swipe') updateSwipe(event, dx);
}

function finishSwipe() {
  const { row, offset, velocity, armed } = gesture;
  const direction = offset > 0 ? 'right' : 'left';
  const flicked = Math.abs(velocity) > FLICK_SPEED && Math.abs(offset) > LOCK_DISTANCE * 3 && Math.sign(velocity) === Math.sign(offset);
  const commit = allows(row, direction) && (armed || flicked);
  // Spring back first; the action's own feedback (check, new status) then shows in place.
  resetVisuals(row);
  if (commit) runAction(direction === 'right' ? 'toggle-done' : 'next-status', row);
}

function onPointerUp(event) {
  if (gesture === null || event.pointerId !== gesture.pointerId) return;
  if (gesture.mode !== 'pending') swallowReleaseClick();
  if (gesture.mode === 'swipe') finishSwipe();
  end();
}

function onPointerCancel(event) {
  if (gesture === null || event.pointerId !== gesture.pointerId) return;
  resetVisuals(gesture.row);
  end();
}

function onClickCapture(event) {
  const isReleaseClick = performance.now() <= swallowReleaseClickUntil;
  swallowReleaseClickUntil = 0; // one click at most: a later, deliberate tap always goes through
  if (isReleaseClick) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function onContextMenu(event) {
  const row = event.target.closest('.item');
  if (row === null) return;
  event.preventDefault();
  // Touch long-press is handled by its own timer; this path is the desktop right-click.
  if (lastPointerType === 'mouse') runAction('item-menu', row);
}

export function enableGestures() {
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('click', onClickCapture, { capture: true });
}
