// Wheel of Fortune: spin to draw a random term, recall its definition, then rate yourself.
import { h, bdi, shuffle, textDir } from '../ui.js';

const MAX_TERMS = 12;
const SIZE = 720; // Canvas pixels; CSS scales it, so it stays sharp on high-density screens.
const FULL_TURNS = 6;
const SPIN_FALLBACK_MS = 5000; // Only used if the end of the .wheel-canvas transition never fires.
const COLORS = ['#fcd34d', '#a5b4fc', '#6ee7b7', '#fca5a5', '#93c5fd', '#f9a8d4'];

export const canPlay = (pairs) => pairs.length >= 1;

export function run(ctx) {
  const round = shuffle(ctx.pairs).slice(0, MAX_TERMS);
  const remaining = [...round];
  const missed = [];
  let known = 0;
  let rotation = 0;
  let spinning = false;

  const canvas = h('canvas', {
    class: 'wheel-canvas',
    width: SIZE,
    height: SIZE,
    role: 'img',
    'aria-label': 'גלגל המזל',
    onClick: spin,
  });
  const panel = h('div', { class: 'wheel-panel', role: 'status' });

  const colorAt = (index, count) => {
    // Without this, the last wedge can share a color with the first one beside it.
    const wrapsOntoFirst = index === count - 1 && index > 0 && index % COLORS.length === 0;
    return COLORS[wrapsOntoFirst ? 1 : index % COLORS.length];
  };

  function fit(paint, text, maxWidth) {
    if (paint.measureText(text).width <= maxWidth) return text;
    const chars = [...text];
    while (chars.length > 1 && paint.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
    return `${chars.join('').trim()}…`;
  }

  function draw() {
    const paint = canvas.getContext('2d');
    const center = SIZE / 2;
    const radius = center - 6;
    const count = remaining.length;
    const slice = (2 * Math.PI) / count;
    const fontSize = count <= 6 ? 38 : count <= 9 ? 32 : 28;

    paint.clearRect(0, 0, SIZE, SIZE);
    remaining.forEach((pair, index) => {
      const start = -Math.PI / 2 + index * slice;
      paint.beginPath();
      paint.moveTo(center, center);
      paint.arc(center, center, radius, start, start + slice);
      paint.closePath();
      paint.fillStyle = colorAt(index, count);
      paint.fill();
      paint.lineWidth = 4;
      paint.strokeStyle = '#ffffff';
      paint.stroke();

      paint.save();
      paint.translate(center, center);
      paint.rotate(start + slice / 2);
      paint.direction = textDir(pair.term);
      paint.textAlign = 'right';
      paint.textBaseline = 'middle';
      paint.font = `700 ${fontSize}px system-ui, "Segoe UI", Roboto, "Arial Hebrew", Arial, sans-serif`;
      paint.fillStyle = '#1e1b3a';
      paint.fillText(fit(paint, pair.term, radius * 0.74), radius - 22, 0);
      paint.restore();
    });

    paint.beginPath();
    paint.arc(center, center, 34, 0, 2 * Math.PI);
    paint.fillStyle = '#4f46e5';
    paint.fill();
    paint.lineWidth = 6;
    paint.strokeStyle = '#ffffff';
    paint.stroke();
  }

  function report() {
    const done = round.length - remaining.length;
    ctx.setStatus(`נותרו ${remaining.length} מתוך ${round.length}`);
    ctx.setProgress(done / round.length);
  }

  function showIdle() {
    report();
    draw();
    panel.replaceChildren(
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: spin }, 'סיבוב הגלגל'),
    );
  }

  function spin() {
    if (spinning || !panel.querySelector('.btn-primary')) return;
    spinning = true;
    panel.querySelector('.btn-primary').disabled = true;

    const slice = 360 / remaining.length;
    const index = Math.floor(Math.random() * remaining.length);
    const landing = (Math.random() - 0.5) * slice * 0.7;
    // A wedge sits (index + 0.5) slices clockwise of the top pointer before rotating.
    const target = 360 - (index + 0.5) * slice + landing;
    rotation += FULL_TURNS * 360 + ((target - (rotation % 360) + 360) % 360);
    canvas.style.transform = `rotate(${rotation}deg)`;

    // Waits for the animation itself, so the term never appears before the wheel has stopped.
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      spinning = false;
      showPicked(remaining[index]);
    };
    canvas.addEventListener('transitionend', settle, { once: true });
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    ctx.after(settle, reduceMotion ? 300 : SPIN_FALLBACK_MS);
  }

  function showPicked(pair) {
    panel.replaceChildren(
      h('div', { class: 'prompt' }, bdi(pair.term)),
      h('button', { class: 'btn btn-block', type: 'button', onClick: () => showAnswer(pair) }, 'הצגת התשובה'),
    );
  }

  function showAnswer(pair) {
    panel.replaceChildren(
      h('div', { class: 'prompt' }, bdi(pair.term), h('div', { class: 'wheel-answer' }, bdi(pair.definition))),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-wrong', type: 'button', onClick: () => rate(pair, false) }, 'עוד לא'),
        h('button', { class: 'btn btn-right', type: 'button', onClick: () => rate(pair, true) }, 'ידעתי'),
      ),
    );
  }

  function rate(pair, isKnown) {
    if (isKnown) known++;
    else missed.push(pair);
    remaining.splice(remaining.indexOf(pair), 1);
    if (remaining.length) {
      showIdle();
      return;
    }
    ctx.finish({
      score: Math.round((100 * known) / round.length),
      summary: `מושגים ידועים: ${known} מתוך ${round.length}`,
      missed,
    });
  }

  ctx.root.append(
    h('div', { class: 'wheel' }, h('span', { class: 'wheel-pointer', 'aria-hidden': 'true' }), canvas),
    panel,
  );
  showIdle();
}
