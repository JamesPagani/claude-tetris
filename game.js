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
const highscoresBody = document.getElementById('highscores-body');
const overlayHighscoresBody = document.getElementById('overlay-highscores-body');
const bestComboEl = document.getElementById('best-combo');
const bestLinesEl = document.getElementById('best-lines');
const overlayBestComboEl = document.getElementById('overlay-best-combo');
const overlayBestLinesEl = document.getElementById('overlay-best-lines');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const overlayEndgameExtra = document.getElementById('overlay-endgame-extra');
const highscoreEntry = document.getElementById('highscore-entry');
const highscoreNameInput = document.getElementById('highscore-name');
const highscoreSubmitBtn = document.getElementById('highscore-submit-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, b2bTetris, maxComboThisGame;
let hold, canHold;
let gridColor = '#22222e';
let pendingHighScore = null;

const THEME_KEY = 'tetris-theme';
const HIGHSCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';
const MAX_HIGHSCORES = 5;

function loadHighScores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHighScores(list) {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY));
    return {
      bestCombo: parsed && Number.isFinite(parsed.bestCombo) ? parsed.bestCombo : 0,
      maxLines: parsed && Number.isFinite(parsed.maxLines) ? parsed.maxLines : 0,
    };
  } catch {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function qualifiesForHighScore(finalScore) {
  if (finalScore <= 0) return false;
  const list = loadHighScores();
  if (list.length < MAX_HIGHSCORES) return true;
  return finalScore > list[list.length - 1].score;
}

function addHighScore(name, finalScore, finalLines, finalCombo) {
  const list = loadHighScores();
  const entry = { name: (name || 'AAA').slice(0, 10), score: finalScore, lines: finalLines, combo: finalCombo };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  if (list.length > MAX_HIGHSCORES) list.length = MAX_HIGHSCORES;
  const index = list.indexOf(entry);
  saveHighScores(list);
  return index;
}

function renderHighScoresTable(tbody, highlightIndex) {
  if (!tbody) return;
  const list = loadHighScores();
  tbody.innerHTML = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'highscore-empty';
    td.textContent = 'Sin récords';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  list.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('highscore-highlight');
    const rankTd = document.createElement('td');
    rankTd.textContent = String(i + 1);
    const nameTd = document.createElement('td');
    nameTd.textContent = entry.name;
    const scoreTd = document.createElement('td');
    scoreTd.textContent = entry.score.toLocaleString();
    tr.append(rankTd, nameTd, scoreTd);
    tbody.appendChild(tr);
  });
}

function renderAllHighScores(highlightIndex = -1) {
  renderHighScoresTable(highscoresBody, highlightIndex);
  renderHighScoresTable(overlayHighscoresBody, highlightIndex);
}

function renderBestStats() {
  const stats = loadStats();
  bestComboEl.textContent = stats.bestCombo;
  bestLinesEl.textContent = stats.maxLines;
  overlayBestComboEl.textContent = stats.bestCombo;
  overlayBestLinesEl.textContent = stats.maxLines;
}

function submitHighScore() {
  if (!pendingHighScore) return;
  const name = highscoreNameInput.value.trim().slice(0, 10) || 'AAA';
  const index = addHighScore(name, pendingHighScore.score, pendingHighScore.lines, pendingHighScore.combo);
  pendingHighScore = null;
  highscoreEntry.classList.add('hidden');
  renderAllHighScores(index);
}

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
    maxComboThisGame = Math.max(maxComboThisGame, combo);
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
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
  overlayEndgameExtra.classList.remove('hidden');

  const stats = loadStats();
  let statsChanged = false;
  if (maxComboThisGame > stats.bestCombo) { stats.bestCombo = maxComboThisGame; statsChanged = true; }
  if (lines > stats.maxLines) { stats.maxLines = lines; statsChanged = true; }
  if (statsChanged) saveStats(stats);
  renderBestStats();

  if (qualifiesForHighScore(score)) {
    pendingHighScore = { score, lines, combo: maxComboThisGame };
    highscoreEntry.classList.remove('hidden');
    highscoreNameInput.value = '';
    renderAllHighScores(-1);
    setTimeout(() => highscoreNameInput.focus(), 0);
  } else {
    pendingHighScore = null;
    highscoreEntry.classList.add('hidden');
    renderAllHighScores(-1);
  }
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
    overlayEndgameExtra.classList.add('hidden');
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
  maxComboThisGame = 0;
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
  overlayEndgameExtra.classList.add('hidden');
  highscoreEntry.classList.add('hidden');
  pendingHighScore = null;
  drawHold();
  renderAllHighScores(-1);
  renderBestStats();
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

resetScoresBtn.addEventListener('click', () => {
  localStorage.removeItem(HIGHSCORES_KEY);
  renderAllHighScores(-1);
});

highscoreSubmitBtn.addEventListener('click', submitHighScore);

highscoreNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    submitHighScore();
  }
});

themeToggleBtn.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  draw();
});

initTheme();
init();
