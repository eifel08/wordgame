// Multiple-Choice Quiz: pick the right definition for each term.
import { h, bdi, shuffle, uniquePairs } from '../ui.js';

const OPTIONS = 4;

export const canPlay = (pairs) => uniquePairs(pairs).length >= 2;

export function run(ctx) {
  const pool = uniquePairs(ctx.pool);
  const questions = shuffle(uniquePairs(ctx.pairs));
  const missed = [];
  let index = 0;
  let correct = 0;

  function ask() {
    const question = questions[index];
    const wrong = shuffle(pool.filter((pair) => pair.definition !== question.definition)).slice(0, OPTIONS - 1);
    const options = shuffle([question, ...wrong]);

    ctx.setStatus(`שאלה ${index + 1} מתוך ${questions.length}`);
    ctx.setProgress(index / questions.length);

    const buttons = options.map((option) => h('button', {
      class: 'option',
      type: 'button',
      onClick: () => answer(option),
    }, bdi(option.definition)));

    function answer(option) {
      const isRight = option === question;
      buttons.forEach((button, i) => {
        button.disabled = true;
        if (options[i] === question) button.classList.add('is-correct');
      });
      if (isRight) {
        correct++;
      } else {
        buttons[options.indexOf(option)].classList.add('is-wrong');
        missed.push(question);
      }
      ctx.after(next, isRight ? 800 : 1700);
    }

    ctx.root.replaceChildren(
      h('p', { class: 'game-hint' }, 'מה ההגדרה הנכונה?'),
      h('div', { class: 'prompt' }, bdi(question.term)),
      h('div', { class: 'options' }, buttons),
    );
  }

  function next() {
    index++;
    if (index < questions.length) {
      ask();
      return;
    }
    ctx.finish({
      score: Math.round((100 * correct) / questions.length),
      summary: `תשובות נכונות: ${correct} מתוך ${questions.length}`,
      missed,
    });
  }

  ask();
}
