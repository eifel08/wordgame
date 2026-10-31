// Memory: flip two cards at a time to find a term and its definition.
import { h, bdi, shuffle, uniquePairs } from '../ui.js';

const MAX_PAIRS = 8;

export const canPlay = (pairs) => uniquePairs(pairs).length >= 2;

export function run(ctx) {
  const round = shuffle(uniquePairs(ctx.pairs)).slice(0, MAX_PAIRS);
  const cards = shuffle(round.flatMap((pair) => [
    { pairId: pair.id, text: pair.term, kind: 'term' },
    { pairId: pair.id, text: pair.definition, kind: 'definition' },
  ]));

  let open = [];
  let moves = 0;
  let found = 0;

  const report = () => {
    ctx.setStatus(`${found}/${round.length} זוגות · ${moves} מהלכים`);
    ctx.setProgress(found / round.length);
  };

  const reveal = (card, shown) => {
    card.el.classList.toggle('is-open', shown);
    card.el.setAttribute('aria-label', shown ? card.text : `קלף ${cards.indexOf(card) + 1}`);
  };

  function pick(card) {
    if (open.length === 2 || open.includes(card) || card.el.disabled) return;
    reveal(card, true);
    open.push(card);
    if (open.length < 2) return;

    moves++;
    const [a, b] = open;
    if (a.pairId === b.pairId) {
      found++;
      report();
      ctx.after(() => {
        for (const matched of open) {
          matched.el.classList.add('is-matched');
          matched.el.disabled = true;
        }
        open = [];
        if (found === round.length) {
          ctx.finish({
            score: Math.round((100 * round.length) / moves),
            summary: `${round.length} זוגות ב-${moves} מהלכים`,
          });
        }
      }, 450);
    } else {
      report();
      ctx.after(() => {
        open.forEach((item) => reveal(item, false));
        open = [];
      }, 1100);
    }
  }

  const grid = h('div', { class: `memory-grid ${cards.length <= 8 ? 'memory-small' : ''}` });
  for (const card of cards) {
    card.el = h('button', {
      class: `memory-card memory-${card.kind}`,
      type: 'button',
      onClick: () => pick(card),
    },
      h('span', { class: 'memory-inner' },
        h('span', { class: 'memory-face memory-back', 'aria-hidden': 'true' }, '?'),
        h('span', { class: `memory-face memory-front ${card.text.length > 24 ? 'is-long' : ''}` }, bdi(card.text)),
      ),
    );
    reveal(card, false);
    grid.append(card.el);
  }

  ctx.root.append(h('p', { class: 'game-hint' }, 'יש למצוא לכל מושג את ההגדרה שלו'), grid);
  report();
}
