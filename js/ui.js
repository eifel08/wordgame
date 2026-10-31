// Small DOM and helper toolkit. All user text goes through text nodes, never innerHTML.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' || key === 'disabled' || key === 'hidden') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return el;
}

// Isolates mixed Hebrew/English text so punctuation stays on the right side.
export const bdi = (text) => h('bdi', {}, text);

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Games that compare cards need every term and definition to be distinct.
export function uniquePairs(pairs) {
  const terms = new Set();
  const definitions = new Set();
  return pairs.filter((pair) => {
    if (terms.has(pair.term) || definitions.has(pair.definition)) return false;
    terms.add(pair.term);
    definitions.add(pair.definition);
    return true;
  });
}

export function textDir(text) {
  const first = text.match(/\p{L}/u);
  return first && /\p{Script=Hebrew}|\p{Script=Arabic}/u.test(first[0]) ? 'rtl' : 'ltr';
}

export function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function toast(message, kind = 'info') {
  const el = h('div', { class: `toast toast-${kind}` }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

export function confirmDialog({ title, body, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const close = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const dialog = h('dialog', { class: 'dialog' },
      h('h2', {}, title),
      body && h('p', {}, body),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'ביטול'),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onClick: () => close(true) }, confirmLabel),
      ),
    );
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close(false);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
