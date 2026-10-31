// Persistence layer. Everything lives in LocalStorage under a single versioned key.

const KEY = 'wordwall.v1';
const DRAFT_KEY = 'wordwall.draft';
const CORRUPT_KEY = 'wordwall.corrupt';

export const LIMITS = { title: 120, term: 120, definition: 300, pairs: 200 };

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

function buildActivity(title, pairs) {
  const now = Date.now();
  return {
    id: newId(),
    title,
    pairs: pairs.map(({ term, definition }) => ({ id: newId(), term, definition })),
    createdAt: now,
    updatedAt: now,
  };
}

const emptyState = () => ({ version: 1, activities: [], best: {}, prefs: {} });

export let available = true;
let state = load();

function load() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    available = false;
    return emptyState();
  }
  if (raw === null) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.activities)) throw new Error('bad shape');
    return { best: {}, prefs: {}, ...parsed };
  } catch {
    // Keep the unreadable data so it can be recovered by hand instead of overwriting it.
    try { localStorage.setItem(CORRUPT_KEY, raw); } catch { /* best effort */ }
    return emptyState();
  }
}

function write(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

// Throws when the browser refuses the write, so callers can tell the user nothing was saved.
function commit() {
  if (available && !write(state)) throw new Error('storage-full');
}

export function reload() {
  state = load();
}

export const listActivities = () => [...state.activities].sort((a, b) => b.updatedAt - a.updatedAt);
export const getActivity = (id) => state.activities.find((activity) => activity.id === id);

export function saveActivity(id, title, pairs) {
  const existing = id && getActivity(id);
  if (existing) {
    existing.title = title;
    existing.pairs = pairs.map((pair) => ({ id: pair.id || newId(), term: pair.term, definition: pair.definition }));
    existing.updatedAt = Date.now();
    commit();
    return existing;
  }
  const created = buildActivity(title, pairs);
  state.activities.push(created);
  commit();
  return created;
}

export function duplicateActivity(id) {
  const source = getActivity(id);
  const copy = buildActivity(`${source.title} (עותק)`, source.pairs);
  state.activities.push(copy);
  commit();
  return copy;
}

export function deleteActivity(id) {
  state.activities = state.activities.filter((activity) => activity.id !== id);
  delete state.best[id];
  commit();
}

export const getBest = (activityId, game) => state.best[activityId]?.[game];

// Returns true when the score beats the previous best.
export function recordScore(activityId, game, score) {
  const scores = (state.best[activityId] ||= {});
  const isRecord = scores[game] === undefined || score > scores[game];
  if (isRecord) {
    scores[game] = score;
    try { commit(); } catch { /* losing a high score is not worth interrupting the game */ }
  }
  return isRecord;
}

export const getPref = (name) => state.prefs[name];

export function setPref(name, value) {
  state.prefs[name] = value;
  try { commit(); } catch { /* cosmetic only */ }
}

export function exportJson() {
  const activities = state.activities.map(({ title, pairs }) => ({
    title,
    pairs: pairs.map(({ term, definition }) => ({ term, definition })),
  }));
  return JSON.stringify({ app: 'wordwall', version: 1, activities }, null, 2);
}

const fingerprint = (title, pairs) => JSON.stringify([title, pairs.map((p) => [p.term, p.definition])]);

function cleanImported(entry) {
  if (typeof entry?.title !== 'string' || !Array.isArray(entry.pairs)) return null;
  const title = entry.title.trim().slice(0, LIMITS.title);
  const pairs = entry.pairs
    .filter((pair) => typeof pair?.term === 'string' && typeof pair?.definition === 'string')
    .map((pair) => ({
      term: pair.term.trim().slice(0, LIMITS.term),
      definition: pair.definition.trim().slice(0, LIMITS.definition),
    }))
    .filter((pair) => pair.term && pair.definition)
    .slice(0, LIMITS.pairs);
  return title && pairs.length >= 2 ? { title, pairs } : null;
}

// Merges a backup file. Activities that already exist unchanged are skipped.
export function importJson(text) {
  const data = JSON.parse(text);
  const entries = Array.isArray(data) ? data : data?.activities;
  if (!Array.isArray(entries)) throw new Error('bad-format');

  const known = new Set(state.activities.map((a) => fingerprint(a.title, a.pairs)));
  let added = 0;
  let skipped = 0;
  for (const entry of entries) {
    const clean = cleanImported(entry);
    if (!clean || known.has(fingerprint(clean.title, clean.pairs))) {
      skipped++;
      continue;
    }
    state.activities.push(buildActivity(clean.title, clean.pairs));
    known.add(fingerprint(clean.title, clean.pairs));
    added++;
  }
  if (added) commit();
  return { added, skipped };
}

// The editor keeps one unsaved draft, so a crash or a phone call doesn't lose typed work.
export function readDraft(draftId) {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return draft?.draftId === draftId ? draft : null;
  } catch {
    return null;
  }
}

export function writeDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* best effort */ }
}

export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* best effort */ }
}
