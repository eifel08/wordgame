// Word Search: read each definition, then find its hidden term by dragging across it or tapping both ends.
import { h, bdi, shuffle, textDir } from '../ui.js';

const MIN_SIZE = 8;
const MAX_SIZE = 12; // Beyond this, cells get too small to touch on a phone.
const MAX_WORDS = 8;
const PLACE_ATTEMPTS = 200;
const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';
const LATIN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Words always read forward: right to left for Hebrew, left to right otherwise.
const FORWARD_RTL = [[0, -1], [1, 0], [1, -1], [-1, -1]];
const FORWARD_LTR = [[0, 1], [1, 0], [1, 1], [-1, 1]];

// One letter per cell, so niqqud, spaces and punctuation are dropped.
const toLetters = (term) => [...term.normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase()];

function eligibleWords(pairs) {
  const seen = new Set();
  const words = [];
  for (const pair of pairs) {
    const letters = toLetters(pair.term);
    const text = letters.join('');
    if (letters.length < 2 || letters.length > MAX_SIZE || seen.has(text)) continue;
    seen.add(text);
    words.push({ pair, letters, text, directions: textDir(pair.term) === 'rtl' ? FORWARD_RTL : FORWARD_LTR });
  }
  return words;
}

function tryPlace(grid, size, word) {
  for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
    const [stepRow, stepCol] = word.directions[Math.floor(Math.random() * word.directions.length)];
    const row = Math.floor(Math.random() * size);
    const col = Math.floor(Math.random() * size);
    const cells = word.letters.map((_, i) => ({ row: row + i * stepRow, col: col + i * stepCol }));
    const fits = cells.every((cell, i) => cell.row >= 0 && cell.row < size && cell.col >= 0 && cell.col < size
      && (grid[cell.row][cell.col] === null || grid[cell.row][cell.col] === word.letters[i]));
    if (fits) {
      cells.forEach((cell, i) => { grid[cell.row][cell.col] = word.letters[i]; });
      return cells;
    }
  }
  return null;
}

function buildPuzzle(words) {
  const longest = Math.max(...words.map((word) => word.letters.length));
  const total = words.reduce((sum, word) => sum + word.letters.length, 0);
  const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, longest, Math.ceil(Math.sqrt(total * 2))));
  const grid = Array.from({ length: size }, () => Array(size).fill(null));

  // Longest first, since those have the fewest places they can go.
  const placed = [];
  for (const word of [...words].sort((a, b) => b.letters.length - a.letters.length)) {
    const cells = tryPlace(grid, size, word);
    if (cells) placed.push({ ...word, cells, found: false, hinted: false });
  }

  const used = placed.flatMap((word) => word.letters);
  const hasHebrew = used.some((letter) => /\p{Script=Hebrew}/u.test(letter));
  const hasLatin = used.some((letter) => /\p{Script=Latin}/u.test(letter));
  const filler = [...used, ...(hasHebrew ? HEBREW_LETTERS : ''), ...(hasLatin ? LATIN_LETTERS : '')];
  for (const line of grid) {
    line.forEach((letter, col) => {
      if (letter === null) line[col] = filler[Math.floor(Math.random() * filler.length)];
    });
  }
  return { size, grid, placed };
}

export const canPlay = (pairs) => eligibleWords(pairs).length >= 1;

export function run(ctx) {
  const words = shuffle(eligibleWords(ctx.pairs)).slice(0, MAX_WORDS);
  const { size, grid, placed } = buildPuzzle(words);
  const remaining = () => placed.filter((word) => !word.found);

  let start = null;
  let anchor = null;
  let finished = false;

  const board = h('div', { class: 'search-grid', dir: 'ltr', role: 'grid' });
  board.style.setProperty('--size', size);
  const cells = grid.map((line, row) => line.map((letter, col) => {
    const cell = h('button', {
      class: 'search-cell',
      type: 'button',
      'aria-label': `שורה ${row + 1}, טור ${col + 1}, ${letter}`,
      // detail is 0 for keyboard activation; touch and mouse go through the pointer handlers.
      onClick: (event) => { if (event.detail === 0) tap({ row, col }); },
    }, letter);
    board.append(cell);
    return cell;
  }));

  const clues = new Map(placed.map((word) => [word, h('li', { class: 'search-clue' }, bdi(word.pair.definition))]));
  const list = h('ul', { class: 'search-list' }, [...clues.values()]);
  const hintButton = h('button', { class: 'btn btn-ghost', type: 'button', onClick: hint }, 'רמז');
  const giveUpButton = h('button', { class: 'btn btn-ghost', type: 'button', onClick: giveUp }, 'סיום');

  const report = () => {
    const found = placed.length - remaining().length;
    ctx.setStatus(`נמצאו ${found} מתוך ${placed.length}`);
    ctx.setProgress(found / placed.length);
  };

  function paint(line) {
    cells.flat().forEach((cell) => cell.classList.remove('is-selecting'));
    line.forEach(({ row, col }) => cells[row][col].classList.add('is-selecting'));
  }

  function cellAt(event) {
    const rect = board.getBoundingClientRect();
    const clamp = (value) => Math.min(size - 1, Math.max(0, value));
    return {
      row: clamp(Math.floor(((event.clientY - rect.top) / rect.height) * size)),
      col: clamp(Math.floor(((event.clientX - rect.left) / rect.width) * size)),
    };
  }

  // Snaps to the nearest of the 8 straight directions, so a shaky finger still selects a line.
  function lineTo(from, to) {
    const rowDelta = to.row - from.row;
    const colDelta = to.col - from.col;
    const angle = Math.round(Math.atan2(rowDelta, colDelta) / (Math.PI / 4)) * (Math.PI / 4);
    const stepRow = Math.round(Math.sin(angle));
    const stepCol = Math.round(Math.cos(angle));
    let length = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
    const inside = (n) => from.row + n * stepRow >= 0 && from.row + n * stepRow < size
      && from.col + n * stepCol >= 0 && from.col + n * stepCol < size;
    while (length > 0 && !inside(length)) length--;
    return Array.from({ length: length + 1 }, (_, i) => ({ row: from.row + i * stepRow, col: from.col + i * stepCol }));
  }

  function check(line) {
    const text = line.map(({ row, col }) => grid[row][col]).join('');
    const reversed = line.map(({ row, col }) => grid[row][col]).reverse().join('');
    const word = remaining().find((candidate) => candidate.text === text || candidate.text === reversed);
    if (!word) {
      line.forEach(({ row, col }) => cells[row][col].classList.add('is-miss'));
      ctx.after(() => cells.flat().forEach((cell) => cell.classList.remove('is-miss')), 350);
      return;
    }
    markFound(word, line);
    if (!remaining().length) finish();
  }

  function markFound(word, line) {
    word.found = true;
    line.forEach(({ row, col }) => {
      cells[row][col].classList.remove('is-hint');
      cells[row][col].classList.add('is-found');
    });
    const clue = clues.get(word);
    clue.classList.remove('is-hint');
    clue.classList.add('is-found');
    clue.append(' ← ', h('strong', {}, bdi(word.pair.term)));
    report();
  }

  function tap(cell) {
    if (finished) return;
    const sameCell = anchor && anchor.row === cell.row && anchor.col === cell.col;
    const rowDelta = anchor ? Math.abs(cell.row - anchor.row) : 0;
    const colDelta = anchor ? Math.abs(cell.col - anchor.col) : 0;
    const inLine = rowDelta === 0 || colDelta === 0 || rowDelta === colDelta;
    if (anchor && !sameCell && inLine) {
      const line = lineTo(anchor, cell);
      anchor = null;
      paint([]);
      check(line);
      return;
    }
    anchor = sameCell ? null : cell;
    paint(anchor ? [anchor] : []);
  }

  function hint() {
    const word = remaining().find((candidate) => !candidate.hinted) || remaining()[0];
    if (!word) return;
    word.hinted = true;
    const { row, col } = word.cells[0];
    cells[row][col].classList.add('is-hint');
    clues.get(word).classList.add('is-hint');
    clues.get(word).scrollIntoView({ block: 'nearest' });
  }

  function giveUp() {
    finished = true;
    for (const word of remaining()) {
      word.hinted = true;
      markFound(word, word.cells);
    }
    hintButton.disabled = true;
    giveUpButton.disabled = true;
    ctx.after(finish, 1800);
  }

  function finish() {
    finished = true;
    const clean = placed.filter((word) => !word.hinted).length;
    ctx.after(() => ctx.finish({
      score: Math.round((100 * clean) / placed.length),
      summary: `נמצאו ללא עזרה: ${clean} מתוך ${placed.length}`,
      missed: placed.filter((word) => word.hinted).map((word) => word.pair),
    }), 500);
  }

  board.addEventListener('pointerdown', (event) => {
    if (finished || !event.isPrimary) return;
    event.preventDefault();
    board.setPointerCapture(event.pointerId);
    start = cellAt(event);
    if (!anchor) paint([start]);
  });

  board.addEventListener('pointermove', (event) => {
    if (!start || !event.isPrimary) return;
    const line = lineTo(start, cellAt(event));
    if (line.length > 1) paint(line);
  });

  board.addEventListener('pointerup', (event) => {
    if (!start || !event.isPrimary) return;
    const line = lineTo(start, cellAt(event));
    const origin = start;
    start = null;
    if (line.length > 1) {
      anchor = null;
      paint([]);
      check(line);
    } else {
      tap(origin);
    }
  });

  board.addEventListener('pointercancel', () => {
    start = null;
    anchor = null;
    paint([]);
  });

  ctx.root.append(
    h('p', { class: 'game-hint' }, 'יש למצוא את המילה של כל הגדרה: גרירה, או הקשה על שני הקצוות'),
    list,
    board,
    h('div', { class: 'row' }, hintButton, giveUpButton),
  );
  report();
}
