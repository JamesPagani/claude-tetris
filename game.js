'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const PERFECT_CLEAR_BONUS = 3000;

const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    boardBg: null,
    gridColor: null,
    glow: false,
    rounded: false,
    pixel: false,
  },
  neon: {
    label: 'Neon',
    colors: [
      null,
      '#00fff2', // I
      '#faff00', // O
      '#ff00f7', // T
      '#00ff6a', // S
      '#ff0033', // Z
      '#3d5bff', // J
      '#ff9100', // L
    ],
    boardBg: '#000000',
    gridColor: 'rgba(255,255,255,0.08)',
    glow: true,
    rounded: false,
    pixel: false,
  },
  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#a8dadc', // I
      '#ffe8a3', // O
      '#d9b8e8', // T
      '#b8e0c8', // S
      '#f4b8b8', // Z
      '#b8c4e8', // J
      '#f6cfa3', // L
    ],
    boardBg: null,
    gridColor: null,
    glow: false,
    rounded: true,
    pixel: false,
  },
  pixel: {
    label: 'Pixel Art',
    colors: COLORS,
    boardBg: null,
    gridColor: null,
    glow: false,
    rounded: false,
    pixel: true,
  },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, b2bTetris;
let hold, canHold;
let gridColor = '#22222e';
let activeSkin = 'retro';

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function getSkin() {
  return SKINS[activeSkin] || SKINS.retro;
}

function fillSkinBackground(context, canvasEl) {
  const skin = getSkin();
  if (skin.boardBg) {
    context.fillStyle = skin.boardBg;
    context.fillRect(0, 0, canvasEl.width, canvasEl.height);
  }
}

function applySkin(name, { redraw = true } = {}) {
  activeSkin = SKINS[name] ? name : 'retro';
  if (skinSelect) skinSelect.value = activeSkin;
  localStorage.setItem(SKIN_KEY, activeSkin);
  if (redraw) {
    draw();
    drawNext();
    drawHold();
  }
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(saved || 'retro', { redraw: false });
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function pieceFromType(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return pieceFromType(Math.floor(Math.random() * 7) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo = Math.min(combo + 1, 10);
    let base = LINE_SCORES[cleared] || 0;
    if (cleared === 4 && b2bTetris) base *= 2;
    score += base * level * combo;
    b2bTetris = cleared === 4;

    if (board.every(row => row.every(v => v === 0))) {
      score += PERFECT_CLEAR_BONUS * level;
    }

    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  } else {
    combo = 0;
    b2bTetris = false;
  }
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
  canHold = true;
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function holdPiece() {
  if (!canHold) return;
  if (hold === null) {
    hold = current.type;
    spawn();
  } else {
    const swap = current.type;
    current = pieceFromType(hold);
    hold = swap;
    if (collide(current.shape, current.x, current.y)) {
      endGame();
    }
  }
  canHold = false;
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  updateCombo();
}

function updateCombo() {
  if (combo >= 2) {
    comboEl.textContent = `x${combo}`;
    comboEl.style.fontSize = `${12 + combo * 3}px`;
    comboEl.classList.remove('hidden');
  } else {
    comboEl.classList.add('hidden');
  }
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPixelTexture(context, px, py, size) {
  const cell = Math.max(3, Math.floor(size / 6));
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let yy = 0; yy < size - 2; yy += cell * 2) {
    for (let xx = 0; xx < size - 2; xx += cell * 2) {
      context.fillRect(px + 1 + xx, py + 1 + yy, Math.min(cell, size - 2 - xx), Math.min(cell, size - 2 - yy));
    }
  }
  context.fillStyle = 'rgba(255,255,255,0.10)';
  for (let yy = cell; yy < size - 2; yy += cell * 2) {
    for (let xx = cell; xx < size - 2; xx += cell * 2) {
      context.fillRect(px + 1 + xx, py + 1 + yy, Math.min(cell, size - 2 - xx), Math.min(cell, size - 2 - yy));
    }
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = getSkin();
  const color = skin.colors[colorIndex] || COLORS[colorIndex];
  const px = x * size, py = y * size;
  const w = size - 2, h = size - 2;

  context.save();
  context.globalAlpha = alpha ?? 1;
  if (skin.glow) {
    context.shadowBlur = 12;
    context.shadowColor = color;
  }
  context.fillStyle = color;
  if (skin.rounded) {
    roundedRectPath(context, px + 1, py + 1, w, h, Math.max(3, size * 0.18));
    context.fill();
  } else {
    context.fillRect(px + 1, py + 1, w, h);
  }

  // highlight
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.12)';
  if (skin.rounded) {
    context.fillRect(px + 4, py + 1, Math.max(0, w - 6), 4);
  } else {
    context.fillRect(px + 1, py + 1, w, 4);
  }

  if (skin.pixel) {
    drawPixelTexture(context, px, py, size);
  }
  context.restore();
}

function drawGrid() {
  const skin = getSkin();
  ctx.strokeStyle = skin.gridColor || gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  fillSkinBackground(ctx, canvas);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  fillSkinBackground(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawHold() {
  const HB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  fillSkinBackground(holdCtx, holdCanvas);
  if (hold === null) return;
  const shape = PIECES[hold];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const alpha = canHold ? 1 : 0.35;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], HB, alpha);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  b2bTetris = false;
  hold = null;
  canHold = true;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  drawHold();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggleBtn.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  draw();
});

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
  });
}

initTheme();
initSkin();
init();
