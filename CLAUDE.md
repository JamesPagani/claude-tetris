# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris implemented in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build step, no package.json.

## Running / testing

There is no build, lint, or test tooling — this is a static site.

```bash
# Any static server works, e.g.:
python3 -m http.server 8000
npx serve .
```

Then open `http://localhost:8000` (or open `index.html` directly in a browser). To verify a change, load the page and play — check piece movement/rotation, line clears, scoring, and the pause/game-over overlays.

## Architecture

Three files, no modules/bundler — `index.html` loads `game.js` directly as a classic script, `game.js` is a single flat file (~300 lines) with all state as top-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, etc.), re-initialized by `init()`.

Key pieces to know before editing `game.js`:

- **Board model**: `ROWS × COLS` matrix, each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Piece shapes**: defined in `PIECES` as square matrices; rotation is done by `rotateCW` (transpose + reverse), not by pre-defining rotation states.
- **`collide(shape, ox, oy)`**: the single collision check used both for movement validation and for rotation/ghost-piece projection — any new movement logic should go through it rather than duplicating bounds checks.
- **`tryRotate()`**: wall-kick logic — tries offsets `[0, -1, 1, -2, 2]` after rotating before giving up.
- **Game loop**: `loop(ts)` runs via `requestAnimationFrame`, accumulates `dropAccum` against `dropInterval` to decide when to drop the piece a row or call `lockPiece()`.
- **`lockPiece()`** always calls `merge()` → `clearLines()` → `spawn()` in that order; `spawn()` is also where game-over is detected (new piece collides immediately → `endGame()`).
- **Scoring/leveling**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop scores 2 pts/row, soft drop 1 pt/row; level increments every 10 lines and `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Rendering**: `draw()` clears and redraws the whole board every frame (grid → locked blocks → ghost piece at `ghostY()` with `globalAlpha = 0.2` → current piece); `drawNext()` renders the preview piece on a separate small canvas.

If changing `COLS`, `ROWS`, or `BLOCK` in `game.js`, also update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
