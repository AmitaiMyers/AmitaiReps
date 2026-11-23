// Shared, fixed configuration for the whole app.

/** Palette used for statuses, color labels and projects. `name` is used for accessibility labels. */
export const COLORS = [
  { hex: '#00c875', name: 'Green' },
  { hex: '#9cd326', name: 'Lime' },
  { hex: '#ffcb00', name: 'Yellow' },
  { hex: '#fdab3d', name: 'Orange' },
  { hex: '#e2445c', name: 'Red' },
  { hex: '#ff158a', name: 'Pink' },
  { hex: '#a25ddc', name: 'Purple' },
  { hex: '#5559df', name: 'Indigo' },
  { hex: '#579bfc', name: 'Blue' },
  { hex: '#66ccff', name: 'Sky' },
  { hex: '#7f5347', name: 'Brown' },
  { hex: '#c4c4c4', name: 'Gray' },
];

/** Statuses every new project starts with. Users can rename, recolor, add, remove and reorder them. */
export const DEFAULT_MISSION_STATUSES = [
  { name: 'Not started', color: '#c4c4c4', isDone: false },
  { name: 'Working on it', color: '#fdab3d', isDone: false },
  { name: 'Stuck', color: '#e2445c', isDone: false },
  { name: 'Done', color: '#00c875', isDone: true },
];

/** Ideas use a fixed set of statuses (the same in every project). */
export const IDEA_STATUSES = [
  { id: 'new', name: 'New', color: '#579bfc' },
  { id: 'maybe', name: 'Maybe', color: '#fdab3d' },
  { id: 'approved', name: 'Approved', color: '#00c875' },
  { id: 'dropped', name: 'Dropped', color: '#c4c4c4' },
];

/** Mission priorities, lowest first. A higher rank sorts higher in lists. */
export const PRIORITIES = [
  { id: 'low', name: 'Low', color: '#579bfc', rank: 1 },
  { id: 'medium', name: 'Medium', color: '#5559df', rank: 2 },
  { id: 'high', name: 'High', color: '#a25ddc', rank: 3 },
  { id: 'urgent', name: 'Urgent', color: '#e2445c', rank: 4 },
];

export const KINDS = {
  idea: { label: 'Idea', plural: 'Ideas', tab: 'ideas' },
  mission: { label: 'Mission', plural: 'Missions', tab: 'missions' },
};

/** Tab order inside a project page. */
export const KIND_ORDER = ['idea', 'mission'];

export const DEFAULT_KIND = 'mission';

/** Show a "back up your data" reminder on the home screen after this many days without a backup. */
export const BACKUP_REMINDER_DAYS = 14;
