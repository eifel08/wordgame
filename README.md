# קיר מילים

Offline-first Hebrew PWA for building vocabulary activities and playing them as games. Inspired by Wordwall; no build step and no dependencies.

## Games

| Game | How it plays |
| --- | --- |
| התאמת זוגות (Matching Pairs) | Memory game: flip cards to pair each term with its definition (up to 8 pairs per round) |
| חידון (Quiz) | Multiple choice: pick the right definition out of up to 4 options |
| כרטיסיות (Flashcards) | Flip, swipe and mark what you know |
| ערבוב אותיות (Word Scramble) | Rebuild the term from shuffled letters, with hints; keeps niqqud attached to its letter |
| גלגל המזל (Wheel of Fortune) | Spin to draw a random term, recall the definition, then rate yourself (up to 12 terms per round) |
| תפזורת (Word Search) | Drag across hidden terms, or tap both ends of a word (up to 8 words of 2–12 letters per round) |

Every game has a results screen, per-activity best scores and a "practice my mistakes" round where it applies.

## Run locally

Service workers and ES modules need HTTP, so opening `index.html` directly won't work:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Install on a phone

Offline support and installation require HTTPS. Host this folder on any static host, such as GitHub Pages; all paths are relative, so it works from a subfolder. Then use the browser's install option, or Share → Add to Home Screen in iOS Safari.

## Data

All data stays in the browser's LocalStorage under `wordwall.v1`. Clearing site data erases it, so use the backup and restore buttons on the home screen to move activities between devices.

## Releasing changes

Bump `CACHE` in `sw.js` whenever a cached file changes, and add any new file to `ASSETS`. Without this, installed copies keep serving the old version.

## Structure

- `index.html`, `css/styles.css`: page shell and RTL, mobile-first styles
- `js/app.js`: routing, dashboard, editor, game runner and results
- `js/store.js`: LocalStorage persistence, backup and restore
- `js/ui.js`: DOM and shuffle helpers
- `js/games/`: one module per game, each exporting `canPlay(pairs)` and `run(ctx)`
- `manifest.json`, `sw.js`, `icons/`: PWA install and offline support
