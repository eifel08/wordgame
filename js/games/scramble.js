// Word Scramble: rebuild the term from shuffled letters, using its definition as the clue.
import { h, bdi, shuffle, textDir } from '../ui.js';

// A grapheme is a letter plus its marks, which keeps Hebrew niqqud attached to its letter.
const graphemes = (text) => text.normalize('NFC').match(/\P{M}\p{M}*/gu) || [];
const isPlayable = (ch) => /[\p{L}\p{N}]/u.test(ch);

function canScramble(term) {
  const letters = graphemes(term).filter(isPlayable);
  return new Set(letters).size >= 2;
}

export const canPlay = (pairs) => pairs.some((pair) => canScramble(pair.term));

export function run(ctx) {
  const words = shuffle(ctx.pairs.filter((pair) => canScramble(pair.term)));
  const missed = [];
  let index = 0;
  let solved = 0;

  function play() {
    const pair = words[index];
    const chars = graphemes(pair.term);
    const targets = chars.filter(isPlayable);

    let tiles;
    do {
      tiles = shuffle(targets).map((ch) => ({ ch }));
    } while (tiles.map((tile) => tile.ch).join('') === targets.join(''));

    // slots[i] holds the index of the tile placed in target position i.
    let slots = targets.map(() => null);
    let helped = false;
    let locked = false;

    ctx.setStatus(`מילה ${index + 1} מתוך ${words.length}`);
    ctx.setProgress(index / words.length);

    const answer = h('div', { class: 'scramble-answer', dir: textDir(pair.term) });
    const tray = h('div', { class: 'scramble-tray' });
    const message = h('p', { class: 'scramble-message', role: 'status' });
    const clearButton = h('button', { class: 'btn btn-ghost', type: 'button', onClick: clear }, 'ניקוי');
    const hintButton = h('button', { class: 'btn btn-ghost', type: 'button', onClick: hint }, 'רמז');
    const skipButton = h('button', { class: 'btn btn-ghost', type: 'button', onClick: skip }, 'דילוג');

    function draw() {
      let slotIndex = 0;
      const groups = [];
      let group = null;
      for (const ch of chars) {
        if (!isPlayable(ch) && /\s/u.test(ch)) {
          group = null;
          continue;
        }
        if (!group) {
          group = h('span', { class: 'scramble-word' });
          groups.push(group);
        }
        if (!isPlayable(ch)) {
          group.append(h('span', { class: 'scramble-fixed' }, ch));
          continue;
        }
        const position = slotIndex++;
        const tile = slots[position];
        group.append(h('button', {
          class: `slot ${tile === null ? '' : 'is-filled'}`,
          type: 'button',
          'aria-label': tile === null ? `מקום ריק ${position + 1}` : `הסרת האות ${tiles[tile].ch}`,
          disabled: tile === null || locked,
          onClick: () => remove(position),
        }, tile === null ? '' : tiles[tile].ch));
      }
      answer.replaceChildren(...groups);

      tray.replaceChildren(...tiles.map((tile, i) => h('button', {
        class: 'tile',
        type: 'button',
        disabled: slots.includes(i) || locked,
        onClick: () => place(i),
      }, tile.ch)));

      for (const button of [clearButton, hintButton, skipButton]) button.disabled = locked;
    }

    function place(tile) {
      slots[slots.indexOf(null)] = tile;
      message.textContent = '';
      answer.classList.remove('is-wrong');
      draw();
      check();
    }

    function remove(position) {
      slots[position] = null;
      message.textContent = '';
      answer.classList.remove('is-wrong');
      draw();
    }

    function clear() {
      slots = targets.map(() => null);
      message.textContent = '';
      answer.classList.remove('is-wrong');
      draw();
    }

    function hint() {
      const position = slots.findIndex((tile, i) => tile === null || tiles[tile].ch !== targets[i]);
      if (position < 0) return;
      helped = true;
      slots[position] = null;
      let tile = tiles.findIndex((candidate, i) => candidate.ch === targets[position] && !slots.includes(i));
      if (tile < 0) {
        const holder = slots.findIndex((placed, i) => i > position && placed !== null && tiles[placed].ch === targets[position]);
        tile = slots[holder];
        slots[holder] = null;
      }
      slots[position] = tile;
      message.textContent = '';
      answer.classList.remove('is-wrong');
      draw();
      check();
    }

    function check() {
      if (slots.includes(null)) return;
      if (slots.every((tile, i) => tiles[tile].ch === targets[i])) {
        locked = true;
        if (helped) missed.push(pair);
        else solved++;
        answer.classList.add('is-correct');
        message.textContent = helped ? 'הושלם בעזרת רמז' : 'נכון!';
        draw();
        ctx.after(next, 900);
      } else {
        answer.classList.remove('is-wrong');
        void answer.offsetWidth; // Restart the shake animation on repeated wrong answers.
        answer.classList.add('is-wrong');
        message.textContent = 'כמעט! אפשר להקיש על אות כדי להחזיר אותה';
      }
    }

    function skip() {
      locked = true;
      missed.push(pair);
      const order = [...tiles.keys()];
      slots = targets.map((ch) => order.splice(order.findIndex((i) => tiles[i].ch === ch), 1)[0]);
      message.textContent = 'זו הייתה התשובה';
      draw();
      ctx.after(next, 1600);
    }

    ctx.root.replaceChildren(
      h('p', { class: 'game-hint' }, 'יש לסדר את האותיות לפי ההגדרה'),
      h('div', { class: 'prompt' }, bdi(pair.definition)),
      answer,
      message,
      tray,
      h('div', { class: 'row' }, clearButton, hintButton, skipButton),
    );
    draw();
  }

  function next() {
    index++;
    if (index < words.length) {
      play();
      return;
    }
    ctx.finish({
      score: Math.round((100 * solved) / words.length),
      summary: `נפתרו ללא עזרה: ${solved} מתוך ${words.length}`,
      missed,
    });
  }

  play();
}
