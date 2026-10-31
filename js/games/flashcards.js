// Flashcards: flip through the terms and mark which ones you already know.
import { h, bdi, shuffle } from '../ui.js';

const SWIPE_DISTANCE = 60;

export const canPlay = (pairs) => pairs.length >= 1;

export function run(ctx) {
  const order = shuffle(ctx.pairs);
  const known = new Set();
  let index = 0;
  let card;
  let touchStartX = null;

  function show() {
    const pair = order[index];
    ctx.setStatus(`קלף ${index + 1} מתוך ${order.length}`);
    ctx.setProgress(index / order.length);

    // A fresh element per card, so the flip transition never reveals the next answer.
    card = h('button', { class: 'flashcard', type: 'button', 'aria-label': `${pair.term}. הקשה להצגת ההגדרה`, onClick: flip },
      h('span', { class: 'flashcard-inner' },
        h('span', { class: 'flashcard-face flashcard-front' }, bdi(pair.term)),
        h('span', { class: 'flashcard-face flashcard-back' }, bdi(pair.definition)),
      ),
    );

    ctx.root.replaceChildren(
      h('p', { class: 'game-hint' }, 'הקשה על הקלף הופכת אותו'),
      card,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-wrong', type: 'button', onClick: () => mark(false) }, 'עוד לא'),
        h('button', { class: 'btn btn-right', type: 'button', onClick: () => mark(true) }, 'ידעתי'),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: index === 0, onClick: previous }, '→ הקודם'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: next }, 'הבא ←'),
      ),
    );
  }

  function flip() {
    card.classList.toggle('is-flipped');
    const pair = order[index];
    card.setAttribute('aria-label', card.classList.contains('is-flipped') ? pair.definition : pair.term);
  }

  function mark(isKnown) {
    if (isKnown) known.add(order[index]);
    else known.delete(order[index]);
    next();
  }

  function previous() {
    if (index === 0) return;
    index--;
    show();
  }

  function next() {
    if (index < order.length - 1) {
      index++;
      show();
      return;
    }
    ctx.finish({
      score: Math.round((100 * known.size) / order.length),
      summary: `מושגים ידועים: ${known.size} מתוך ${order.length}`,
      missed: order.filter((pair) => !known.has(pair)),
    });
  }

  // Pages turn from left to right in a Hebrew book, so swiping right moves forward.
  const onTouchStart = (event) => { touchStartX = event.changedTouches[0].clientX; };
  const onTouchEnd = (event) => {
    if (touchStartX === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (distance > SWIPE_DISTANCE) next();
    else if (distance < -SWIPE_DISTANCE) previous();
  };
  const onKey = (event) => {
    if (event.key === 'ArrowLeft') next();
    else if (event.key === 'ArrowRight') previous();
  };

  ctx.root.addEventListener('touchstart', onTouchStart, { passive: true });
  ctx.root.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey));

  show();
}
