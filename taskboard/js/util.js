// Small, dependency-free helpers shared across the app.

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text so it is safe inside HTML content and attribute values. */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export function uid() {
  return crypto.randomUUID();
}

/** Returns the entry with the given id, or throws if it does not exist. */
export function findById(list, id, label) {
  const found = list.find((entry) => entry.id === id);
  assert(found !== undefined, `${label} "${id}" not found`);
  return found;
}

export function assertAllowedKeys(patch, allowedKeys, label) {
  for (const key of Object.keys(patch)) {
    assert(allowedKeys.includes(key), `${label}: field "${key}" cannot be changed`);
  }
}

/** Shows `fallback` when the user left a name empty. */
export function displayName(text, fallback) {
  return text.trim() === '' ? fallback : text;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Turns { projectId: 'x' } into `data-project-id="x"` (read back as element.dataset.projectId). */
export function dataAttrs(data) {
  return Object.entries(data)
    .map(([key, value]) => `data-${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}="${esc(value)}"`)
    .join(' ');
}

/** Reads a named control from a form, failing loudly if the markup and the handler disagree. */
export function formValue(form, fieldName) {
  const control = form.elements.namedItem(fieldName);
  assert(control !== null, `Form field "${fieldName}" is missing`);
  return control.value;
}

// ---------- Dates ----------

const MS_PER_DAY = 86_400_000;
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/** Local calendar date as YYYY-MM-DD (the format of <input type="date">). */
export function toIsoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isoDateParts(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

/** Whole calendar days from today to `isoDate` (negative = in the past). */
export function daysFromToday(isoDate) {
  const target = isoDateParts(isoDate);
  const today = isoDateParts(toIsoDate(new Date()));
  // UTC math avoids daylight-saving shifts changing the day count.
  const targetMs = Date.UTC(target.year, target.month - 1, target.day);
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((targetMs - todayMs) / MS_PER_DAY);
}

export function formatDueDate(isoDate) {
  const days = daysFromToday(isoDate);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  const { year, month, day } = isoDateParts(isoDate);
  const date = new Date(year, month - 1, day);
  return year === new Date().getFullYear() ? SHORT_DATE.format(date) : SHORT_DATE_WITH_YEAR.format(date);
}

export function formatTimestamp(ms) {
  return DATE_TIME.format(ms);
}

export function daysSince(ms) {
  return Math.floor((Date.now() - ms) / MS_PER_DAY);
}

// ---------- Colors ----------

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#1f2033';

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const rgb = parseInt(hex.slice(1), 16);
  const red = (rgb >> 16) & 255;
  const green = (rgb >> 8) & 255;
  const blue = rgb & 255;
  return 0.2126 * channelToLinear(red) + 0.7152 * channelToLinear(green) + 0.0722 * channelToLinear(blue);
}

/** Picks white or dark text, whichever has the better WCAG contrast on the given background color. */
export function readableTextColor(backgroundHex) {
  const background = relativeLuminance(backgroundHex);
  const contrastWithLight = (relativeLuminance(LIGHT_TEXT) + 0.05) / (background + 0.05);
  const contrastWithDark = (background + 0.05) / (relativeLuminance(DARK_TEXT) + 0.05);
  return contrastWithLight >= contrastWithDark ? LIGHT_TEXT : DARK_TEXT;
}
