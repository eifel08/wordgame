// Matching Pairs: connect each term to its definition across two columns, by drawing a line or tapping both.
import { h, bdi, shuffle, uniquePairs } from '../ui.js';

const MAX_PAIRS = 8;
const DRAG_DISTANCE = 10; // Pixels of movement that turn a tap into a drawn line.
const SVG_NS = 'http://www.w3.org/2000/svg';

export const canPlay = (pairs) => uniquePairs(pairs).length >= 2;

export function run(ctx) {
  const round = shuffle(uniquePairs(ctx.pairs)).slice(0, MAX_PAIRS);
  let definitions = shuffle(round);
  // Never deal the columns already lined up with each other.
  while (round.length > 1 && definitions.every((pair, i) => pair === round[i])) definitions = shuffle(round);

  const missed = new Set();
  const connections = [];
  let attempts = 0;
  let selected = null;
  let drag = null;

  const lines = document.createElementNS(SVG_NS, 'svg');
  lines.setAttribute('class', 'pairs-lines');
  lines.setAttribute('aria-hidden', 'true');
  const board = h('div', { class: 'pairs-board' });

  const makeItem = (pair, side) => {
    const item = { pair, side, matched: false };
    item.el = h('button', {
      class: 'pairs-item',
      type: 'button',
      // detail is 0 for keyboard activation; touch and mouse go through the pointer handlers.
      onClick: (event) => { if (event.detail === 0) tap(item); },
    }, bdi(side === 'term' ? pair.term : pair.definition));
    return item;
  };
  const terms = shuffle(round).map((pair) => makeItem(pair, 'term'));
  const answers = definitions.map((pair) => makeItem(pair, 'definition'));
  const items = [...terms, ...answers];

  const report = () => {
    ctx.setStatus(`${connections.length}/${round.length} זוגות · טעויות: ${attempts - connections.length}`);
    ctx.setProgress(connections.length / round.length);
  };

  // The page is RTL, so terms are the right column and lines leave from their left edge.
  function anchor(item) {
    const rect = item.el.getBoundingClientRect();
    const origin = board.getBoundingClientRect();
    return {
      x: (item.side === 'term' ? rect.left : rect.right) - origin.left,
      y: rect.top + rect.height / 2 - origin.top,
    };
  }

  function placeLine(line, from, to) {
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);
  }

  function makeLine(className) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', className);
    lines.append(line);
    return line;
  }

  const select = (item) => {
    selected?.el.classList.remove('is-selected');
    selected = item;
    selected?.el.classList.add('is-selected');
  };

  function attempt(first, second) {
    select(null);
    attempts++;
    if (first.pair !== second.pair) {
      missed.add(first.pair);
      missed.add(second.pair);
      for (const item of [first, second]) item.el.classList.add('is-wrong');
      ctx.after(() => {
        for (const item of [first, second]) item.el.classList.remove('is-wrong');
      }, 450);
      report();
      return;
    }

    for (const item of [first, second]) {
      item.matched = true;
      item.el.classList.add('is-matched');
      item.el.disabled = true;
    }
    const line = makeLine('pairs-line');
    placeLine(line, anchor(first), anchor(second));
    connections.push({ line, first, second });
    report();

    if (connections.length === round.length) {
      ctx.after(() => ctx.finish({
        score: Math.round((100 * round.length) / attempts),
        summary: `${round.length} זוגות, טעויות: ${attempts - round.length}`,
        missed: round.filter((pair) => missed.has(pair)),
      }), 700);
    }
  }

  function tap(item) {
    if (item.matched) return;
    if (selected && selected.side !== item.side) attempt(selected, item);
    else select(selected === item ? null : item);
  }

  const itemAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('.pairs-item');
    return items.find((item) => item.el === el && !item.matched) || null;
  };

  const endDrag = () => {
    drag?.line?.remove();
    drag = null;
  };

  board.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    const item = itemAt(event.clientX, event.clientY);
    if (!item) return;
    drag = { item, startX: event.clientX, startY: event.clientY, line: null };
    board.setPointerCapture(event.pointerId);
  });

  board.addEventListener('pointermove', (event) => {
    if (!drag || !event.isPrimary) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.line && moved < DRAG_DISTANCE) return;
    drag.line ||= makeLine('pairs-line is-live');
    const origin = board.getBoundingClientRect();
    placeLine(drag.line, anchor(drag.item), { x: event.clientX - origin.left, y: event.clientY - origin.top });
  });

  board.addEventListener('pointerup', (event) => {
    if (!drag || !event.isPrimary) return;
    const { item, line } = drag;
    endDrag();
    if (!line) {
      tap(item);
      return;
    }
    const target = itemAt(event.clientX, event.clientY);
    if (target && target.side !== item.side) attempt(item, target);
  });

  board.addEventListener('pointercancel', endDrag);

  const relayout = new ResizeObserver(() => {
    for (const { line, first, second } of connections) placeLine(line, anchor(first), anchor(second));
  });
  relayout.observe(board);
  ctx.onCleanup(() => relayout.disconnect());

  board.append(
    h('div', { class: 'pairs-column' }, h('p', { class: 'pairs-heading' }, 'מושגים'), terms.map((item) => item.el)),
    h('div', { class: 'pairs-column' }, h('p', { class: 'pairs-heading' }, 'הגדרות'), answers.map((item) => item.el)),
    lines,
  );
  ctx.root.append(h('p', { class: 'game-hint' }, 'יש לחבר כל מושג להגדרה שלו: גרירת קו, או הקשה על שניהם'), board);
  report();
}
