// מילימשחק (Wordgame). Created by Eitan Feldman.
import * as store from './store.js';
import { h, bdi, confirmDialog, formatTime, toast } from './ui.js';
import * as memory from './games/memory.js';
import * as matchup from './games/matchup.js';
import * as quiz from './games/quiz.js';
import * as flashcards from './games/flashcards.js';
import * as scramble from './games/scramble.js';
import * as wheel from './games/wheel.js';
import * as wordsearch from './games/wordsearch.js';

const APP_NAME = 'מילימשחק';

const GAMES = {
  memory: { ...memory, title: 'זיכרון', icon: '🧠', description: 'הפיכת קלפים ומציאת הזוגות' },
  matchup: { ...matchup, title: 'התאמת זוגות', icon: '🧩', description: 'חיבור כל מושג להגדרה שלו' },
  quiz: { ...quiz, title: 'חידון', icon: '❓', description: 'שאלות רב-ברירה' },
  flashcards: { ...flashcards, title: 'כרטיסיות', icon: '🃏', description: 'לימוד וחזרה בקצב אישי' },
  scramble: { ...scramble, title: 'ערבוב אותיות', icon: '🔤', description: 'סידור האותיות למילה הנכונה' },
  wheel: { ...wheel, title: 'גלגל המזל', icon: '🎡', description: 'סיבוב הגלגל ובדיקה עצמית' },
  wordsearch: { ...wordsearch, title: 'תפזורת', icon: '🔍', description: 'חיפוש המילים החבויות בלוח' },
};

const app = document.getElementById('app');
const pageTitle = document.getElementById('page-title');
const backButton = document.getElementById('back');

let cleanups = [];
let installPrompt = null;
let leaveGuard = null;

function runCleanups() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
}

function setPage(title, backTo) {
  pageTitle.textContent = title;
  document.title = backTo ? `${title} · ${APP_NAME}` : `${APP_NAME} · Wordgame`;
  backButton.hidden = !backTo;
  backButton.dataset.target = backTo || '';
}

const go = (path) => { location.hash = path; };

const withSaveErrors = (action) => {
  try {
    return action();
  } catch {
    toast('השמירה נכשלה: אין מספיק מקום באחסון של הדפדפן', 'error');
    return null;
  }
};

/* ---------- Dashboard ---------- */

function renderDashboard() {
  setPage(APP_NAME);
  const activities = store.listActivities();
  const list = h('div', { class: 'activity-list' });

  const renderList = (query = '') => {
    const needle = query.trim().toLowerCase();
    const shown = activities.filter((activity) => activity.title.toLowerCase().includes(needle));
    list.replaceChildren(...shown.map((activity) => h('a', { class: 'activity-card', href: `#/activity/${activity.id}` },
      h('span', { class: 'activity-title' }, bdi(activity.title)),
      h('span', { class: 'muted' },
        `${activity.pairs.length} זוגות · עודכן ${new Date(activity.updatedAt).toLocaleDateString('he-IL')}`),
    )));
    if (!shown.length) {
      list.append(h('p', { class: 'empty' }, activities.length ? 'לא נמצאו פעילויות' : 'עדיין אין פעילויות. כדאי ליצור את הראשונה!'));
    }
  };

  const fileInput = h('input', {
    // No accept filter: phones may grey out a shared .txt backup, and importing checks the content.
    type: 'file',
    hidden: true,
    onChange: (event) => importBackup(event.target),
  });

  app.replaceChildren(...[
    !store.available && h('p', { class: 'banner banner-error' }, 'האחסון המקומי חסום בדפדפן, ולכן שינויים לא יישמרו.'),
    installBanner(),
    h('a', { class: 'btn btn-primary btn-block', href: '#/new' }, '＋ פעילות חדשה'),
    activities.length > 3 && h('input', {
      class: 'input',
      type: 'search',
      placeholder: 'חיפוש פעילות',
      'aria-label': 'חיפוש פעילות',
      onInput: (event) => renderList(event.target.value),
    }),
    list,
    h('div', { class: 'row footer-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: exportBackup }, 'גיבוי לקובץ'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => fileInput.click() }, 'שחזור מקובץ'),
      fileInput,
    ),
  ].filter(Boolean));
  renderList();
}

function installBanner() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || store.getPref('hideInstall')) return null;

  const dismiss = (banner) => {
    store.setPref('hideInstall', true);
    banner.remove();
  };

  if (installPrompt) {
    const banner = h('div', { class: 'banner' },
      h('span', {}, 'אפשר להתקין את האפליקציה ולשחק גם בלי אינטרנט'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: async () => {
          installPrompt.prompt();
          await installPrompt.userChoice;
          installPrompt = null;
          banner.remove();
        },
      }, 'התקנה'),
    );
    return banner;
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) return null;
  const banner = h('div', { class: 'banner' },
    h('span', {}, 'להתקנה: כפתור השיתוף בספארי ואז „הוספה למסך הבית”'),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'סגירה', onClick: () => dismiss(banner) }, '✕'),
  );
  return banner;
}

const isMobileDevice = () => navigator.userAgentData?.mobile
  || /android|iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  || matchMedia('(pointer: coarse)').matches;

// Returns 'shared', 'cancelled' or 'unavailable'; the last one means a download should be tried.
async function shareBackup(json, baseName) {
  // Android Chrome refuses to share .json files, so the same content is offered as .txt.
  const file = [
    new File([json], `${baseName}.json`, { type: 'application/json' }),
    new File([json], `${baseName}.txt`, { type: 'text/plain' }),
  ].find((candidate) => navigator.canShare?.({ files: [candidate] }));
  if (!file) return 'unavailable';

  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (error) {
    return error.name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}

function downloadBackup(json, baseName) {
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    // Mobile browsers ignore clicks on a link outside the page, and read the file some time later.
    const link = h('a', { href: url, download: `${baseName}.json`, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch {
    return false;
  }
}

async function exportBackup() {
  const json = store.exportJson();
  const baseName = `wordgame-backup-${new Date().toISOString().slice(0, 10)}`;

  // Downloads are unreliable in an installed iOS app, so phones start with the share sheet.
  if (isMobileDevice()) {
    const result = await shareBackup(json, baseName);
    if (result === 'cancelled') return;
    if (result === 'shared') {
      toast('הגיבוי מוכן', 'success');
      return;
    }
  }
  if (downloadBackup(json, baseName)) toast('הורדת הגיבוי התחילה', 'success');
  else toast('הגיבוי נכשל. כדאי לנסות בדפדפן אחר', 'error');
}

async function importBackup(input) {
  const [file] = input.files;
  input.value = '';
  if (!file) return;
  try {
    const { added, skipped } = store.importJson(await file.text());
    toast(`פעילויות שנוספו: ${added}${skipped ? `, דולגו: ${skipped}` : ''}`, added ? 'success' : 'info');
    renderDashboard();
  } catch (error) {
    toast(error.message === 'storage-full' ? 'אין מספיק מקום באחסון של הדפדפן' : 'הקובץ אינו קובץ גיבוי תקין', 'error');
  }
}

/* ---------- Activity page ---------- */

function renderActivity(id) {
  const activity = store.getActivity(id);
  if (!activity) return notFound();
  setPage(activity.title, '#/');

  const tiles = Object.entries(GAMES).map(([gameId, game]) => {
    const playable = game.canPlay(activity.pairs);
    const best = store.getBest(id, gameId);
    return h('button', {
      class: 'game-tile',
      type: 'button',
      disabled: !playable,
      onClick: () => go(`#/play/${id}/${gameId}`),
    },
      h('span', { class: 'game-icon', 'aria-hidden': 'true' }, game.icon),
      h('span', { class: 'game-name' }, game.title),
      h('span', { class: 'muted' }, playable ? game.description : 'אין מספיק מילים מתאימות'),
      best !== undefined && h('span', { class: 'badge' }, `שיא: ${best}`),
    );
  });

  app.replaceChildren(
    h('h2', { class: 'section-title' }, 'בחירת משחק'),
    h('div', { class: 'game-grid' }, tiles),
    h('details', { class: 'pairs-preview' },
      h('summary', {}, `זוגות בפעילות: ${activity.pairs.length}`),
      h('dl', {}, activity.pairs.flatMap((pair) => [
        h('dt', {}, bdi(pair.term)),
        h('dd', {}, bdi(pair.definition)),
      ])),
    ),
    h('div', { class: 'row' },
      h('a', { class: 'btn', href: `#/edit/${id}` }, 'עריכה'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const copy = withSaveErrors(() => store.duplicateActivity(id));
          if (copy) {
            toast('הפעילות שוכפלה', 'success');
            go(`#/activity/${copy.id}`);
          }
        },
      }, 'שכפול'),
      h('button', {
        class: 'btn btn-danger-ghost',
        type: 'button',
        onClick: async () => {
          const confirmed = await confirmDialog({
            title: 'למחוק את הפעילות?',
            body: `„${activity.title}” תימחק לצמיתות יחד עם השיאים שלה.`,
            confirmLabel: 'מחיקה',
            danger: true,
          });
          if (confirmed && withSaveErrors(() => { store.deleteActivity(id); return true; })) {
            toast('הפעילות נמחקה');
            go('#/');
          }
        },
      }, 'מחיקה'),
    ),
  );
}

/* ---------- Editor ---------- */

function parseBulk(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const pairs = [];
  let failed = 0;
  for (const line of lines) {
    const match = line.match(/^(.+?)(?:\t|\s+[-–—]\s+|\s*[:=]\s*|\s*,\s*)(.+)$/);
    if (match) pairs.push({ term: match[1].trim(), definition: match[2].trim() });
    else failed++;
  }
  return { pairs, failed };
}

function renderEditor(id) {
  const activity = id ? store.getActivity(id) : null;
  if (id && !activity) return notFound();
  const backTo = id ? `#/activity/${id}` : '#/';
  setPage(id ? 'עריכת פעילות' : 'פעילות חדשה', backTo);

  const draftId = id || 'new';
  const original = activity
    ? { title: activity.title, pairs: activity.pairs }
    : { title: '', pairs: [{ term: '', definition: '' }, { term: '', definition: '' }, { term: '', definition: '' }] };
  const draft = store.readDraft(draftId);
  const initial = draft || original;

  const rows = h('ol', { class: 'pair-rows' });
  const errorBox = h('p', { class: 'banner banner-error', role: 'alert', hidden: true });

  const readRows = () => [...rows.children].map((row) => ({
    id: row.dataset.pairId || undefined,
    term: row.querySelector('.term-input').value.trim(),
    definition: row.querySelector('.definition-input').value.trim(),
  }));

  const titleInput = h('input', {
    class: 'input',
    id: 'activity-title',
    type: 'text',
    dir: 'auto',
    maxlength: store.LIMITS.title,
    placeholder: id ? 'למשל: אוצר מילים לשיעור 3' : store.nextDefaultTitle(),
    value: initial.title,
  });

  const snapshot = () => JSON.stringify([titleInput.value.trim(), readRows()
    .filter((pair) => pair.term || pair.definition)
    .map((pair) => [pair.term, pair.definition])]);
  const originalSnapshot = JSON.stringify([original.title, original.pairs
    .filter((pair) => pair.term || pair.definition)
    .map((pair) => [pair.term, pair.definition])]);
  const isDirty = () => snapshot() !== originalSnapshot;

  const saveDraft = () => {
    if (isDirty()) store.writeDraft({ draftId, title: titleInput.value, pairs: readRows() });
    else store.clearDraft();
  };

  function addRow(pair = { term: '', definition: '' }, focus = false) {
    if (rows.children.length >= store.LIMITS.pairs) {
      toast(`אפשר עד ${store.LIMITS.pairs} זוגות בפעילות`, 'error');
      return;
    }
    const row = h('li', { class: 'pair-row', 'data-pair-id': pair.id },
      h('div', { class: 'pair-fields' },
        h('input', {
          class: 'input term-input',
          type: 'text',
          dir: 'auto',
          maxlength: store.LIMITS.term,
          placeholder: 'מושג',
          'aria-label': 'מושג',
          value: pair.term,
        }),
        h('input', {
          class: 'input definition-input',
          type: 'text',
          dir: 'auto',
          maxlength: store.LIMITS.definition,
          placeholder: 'הגדרה',
          'aria-label': 'הגדרה',
          enterkeyhint: 'next',
          value: pair.definition,
          onKeydown: (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const nextRow = row.nextElementSibling;
            if (nextRow) nextRow.querySelector('.term-input').focus();
            else addRow(undefined, true);
          },
        }),
      ),
      h('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'מחיקת זוג',
        onClick: () => {
          row.remove();
          saveDraft();
        },
      }, '✕'),
    );
    rows.append(row);
    if (focus) row.querySelector('.term-input').focus();
  }

  initial.pairs.forEach((pair) => addRow(pair));

  const bulkInput = h('textarea', {
    class: 'input',
    rows: 5,
    dir: 'auto',
    placeholder: 'שורה לכל זוג, למשל:\nכלב - dog\nחתול: cat',
    'aria-label': 'רשימת זוגות',
  });

  function addBulk() {
    const { pairs, failed } = parseBulk(bulkInput.value);
    [...rows.children]
      .filter((row) => !row.querySelector('.term-input').value && !row.querySelector('.definition-input').value)
      .forEach((row) => row.remove());
    pairs.forEach((pair) => addRow(pair));
    bulkInput.value = '';
    saveDraft();
    toast(`זוגות שנוספו: ${pairs.length}${failed ? `, שורות שלא זוהו: ${failed}` : ''}`, failed ? 'error' : 'success');
  }

  function validate(title, pairs) {
    if (!title) return 'יש לתת שם לפעילות';
    if (pairs.some((pair) => !pair.term || !pair.definition)) return 'יש למלא בכל שורה גם מושג וגם הגדרה';
    if (pairs.length < 2) return 'נדרשים לפחות שני זוגות';
    return null;
  }

  function save() {
    const title = titleInput.value.trim() || (id ? '' : store.nextDefaultTitle());
    const pairs = readRows().filter((pair) => pair.term || pair.definition);
    const problem = validate(title, pairs);
    errorBox.hidden = !problem;
    errorBox.textContent = problem || '';
    if (problem) {
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const saved = withSaveErrors(() => store.saveActivity(id, title, pairs));
    if (!saved) return;
    store.clearDraft();
    leaveGuard = null;
    toast('הפעילות נשמרה', 'success');
    go(`#/activity/${saved.id}`);
  }

  leaveGuard = async () => {
    if (!isDirty()) {
      store.clearDraft();
      return true;
    }
    const confirmed = await confirmDialog({
      title: 'לצאת בלי לשמור?',
      body: 'השינויים שלא נשמרו יאבדו.',
      confirmLabel: 'יציאה',
      danger: true,
    });
    if (confirmed) store.clearDraft();
    return confirmed;
  };

  const form = h('div', { class: 'editor', onInput: saveDraft },
    errorBox,
    draft && h('p', { class: 'banner' }, 'שוחזרה טיוטה שלא נשמרה'),
    h('label', { class: 'field-label', for: 'activity-title' }, 'שם הפעילות'),
    titleInput,
    h('h2', { class: 'section-title' }, 'מושגים והגדרות'),
    rows,
    h('button', { class: 'btn btn-block', type: 'button', onClick: () => addRow(undefined, true) }, '＋ הוספת זוג'),
    h('details', { class: 'bulk' },
      h('summary', {}, 'הדבקת רשימה'),
      bulkInput,
      h('button', { class: 'btn btn-block', type: 'button', onClick: addBulk }, 'הוספה לרשימה'),
    ),
  );

  app.replaceChildren(
    form,
    h('div', { class: 'sticky-actions' },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: save }, 'שמירה'),
    ),
  );
}

/* ---------- Game runner ---------- */

function renderGame(id, gameId, pairs) {
  const activity = store.getActivity(id);
  const game = GAMES[gameId];
  if (!activity || !game) return notFound();
  runCleanups();

  const practice = Boolean(pairs);
  const roundPairs = pairs || activity.pairs;
  if (!practice && !game.canPlay(activity.pairs)) return go(`#/activity/${id}`);
  setPage(game.title, `#/activity/${id}`);

  const status = h('span', {});
  const clock = h('span', { dir: 'ltr' }, '0:00');
  const fill = h('div', { class: 'progress-fill' });
  const stage = h('div', { class: 'stage' });
  const startedAt = Date.now();
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000);

  const interval = setInterval(() => { clock.textContent = formatTime(elapsed()); }, 1000);
  const timeouts = new Set();
  cleanups.push(() => {
    clearInterval(interval);
    timeouts.forEach(clearTimeout);
  });

  const ctx = {
    root: stage,
    pairs: roundPairs,
    pool: activity.pairs,
    setStatus: (text) => { status.textContent = text; },
    setProgress: (fraction) => { fill.style.width = `${Math.round(fraction * 100)}%`; },
    after: (fn, ms) => {
      const timeout = setTimeout(() => {
        timeouts.delete(timeout);
        fn();
      }, ms);
      timeouts.add(timeout);
    },
    onCleanup: (fn) => cleanups.push(fn),
    finish: (result) => {
      const seconds = elapsed();
      runCleanups();
      renderResults(activity, gameId, { ...result, seconds, practice });
    },
  };

  app.replaceChildren(
    h('div', { class: 'game-status' }, status, clock),
    h('div', { class: 'progress' }, fill),
    stage,
  );
  game.run(ctx);
}

function renderResults(activity, gameId, { score, summary, seconds, missed = [], practice }) {
  const game = GAMES[gameId];
  const isRecord = !practice && store.recordScore(activity.id, gameId, score);
  setPage('תוצאות', `#/activity/${activity.id}`);

  const praise = score >= 90 ? 'כל הכבוד!' : score >= 60 ? 'יפה מאוד!' : 'ממשיכים לתרגל!';

  app.replaceChildren(h('div', { class: 'results' },
    h('div', { class: 'results-icon', 'aria-hidden': 'true' }, score >= 60 ? '🎉' : '💪'),
    h('h2', {}, praise),
    h('div', { class: 'results-score' }, `${score} נקודות`),
    h('p', { class: 'muted' }, `${summary} · זמן `, h('span', { dir: 'ltr' }, formatTime(seconds))),
    isRecord && h('p', { class: 'badge' }, 'שיא חדש!'),
    missed.length > 0 && h('details', { class: 'pairs-preview', open: true },
      h('summary', {}, `זוגות לחזרה: ${missed.length}`),
      h('dl', {}, missed.flatMap((pair) => [
        h('dt', {}, bdi(pair.term)),
        h('dd', {}, bdi(pair.definition)),
      ])),
    ),
    h('div', { class: 'stack' },
      missed.length > 0 && h('button', {
        class: 'btn btn-primary btn-block',
        type: 'button',
        onClick: () => renderGame(activity.id, gameId, missed),
      }, 'תרגול הטעויות'),
      h('button', {
        class: `btn btn-block ${missed.length ? '' : 'btn-primary'}`,
        type: 'button',
        onClick: () => renderGame(activity.id, gameId),
      }, `${game.title}: משחק נוסף`),
      h('a', { class: 'btn btn-block', href: `#/activity/${activity.id}` }, 'בחירת משחק אחר'),
    ),
  ));
}

/* ---------- Routing ---------- */

function notFound() {
  setPage('לא נמצא', '#/');
  app.replaceChildren(h('p', { class: 'empty' }, 'הפעילות לא נמצאה. ייתכן שהיא נמחקה.'),
    h('a', { class: 'btn btn-primary btn-block', href: '#/' }, 'חזרה למסך הראשי'));
}

let currentHash = location.hash;

async function route() {
  if (leaveGuard && location.hash !== currentHash) {
    const guard = leaveGuard;
    const target = location.hash;
    leaveGuard = null;
    // Stay on the editor while asking; the hash is restored without re-rendering it.
    history.replaceState(null, '', currentHash || '#/');
    if (!(await guard())) {
      leaveGuard = guard;
      return;
    }
    location.hash = target;
    return;
  }
  currentHash = location.hash;
  leaveGuard = null;
  runCleanups();

  const [section, id, extra] = location.hash.replace(/^#\/?/, '').split('/');
  if (!section) renderDashboard();
  else if (section === 'new') renderEditor(null);
  else if (section === 'edit') renderEditor(id);
  else if (section === 'activity') renderActivity(id);
  else if (section === 'play') renderGame(id, extra);
  else notFound();

  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

backButton.addEventListener('click', () => go(backButton.dataset.target));
window.addEventListener('hashchange', route);

// Keeps several open tabs in step, unless one of them is mid-edit or mid-game.
window.addEventListener('storage', (event) => {
  if (event.key !== 'wordwall.v1') return;
  store.reload();
  if (!location.hash.replace(/^#\/?/, '')) renderDashboard();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (!location.hash.replace(/^#\/?/, '')) renderDashboard();
});

if ('serviceWorker' in navigator) {
  const wasControlled = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (wasControlled) toast('האפליקציה עודכנה. השינויים ייכנסו לתוקף בפתיחה הבאה.');
  });
  navigator.serviceWorker.register('sw.js').catch(() => { /* still fully usable online */ });
}

// Asks the browser not to evict LocalStorage under storage pressure.
navigator.storage?.persist?.().catch(() => {});

route();
