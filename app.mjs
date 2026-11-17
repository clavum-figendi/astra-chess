import { Chess } from './src/chess.mjs';
import { createClock } from './src/clock.mjs';
import { modelResourceURL } from './src/model-resource.mjs';
import { createPremove } from './src/premove.mjs';
import { createSound } from './src/sound.mjs';

const $ = (id) => document.getElementById(id);
const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const colors = { w: 'White', b: 'Black' };
// Original compact SVG silhouettes; identical rendering without fonts or remote assets.
const silhouettes = {
  p: '<circle cx="32" cy="18" r="8"/><path d="M27 26h10l-1 9 6 11H22l6-11zM20 48h24l3 7H17z"/>',
  n: '<path d="M19 47c1-9 6-14 16-20l-11 2-7 7-7-7 12-16 3-8 9 6c11 3 15 13 13 23l-3 13zM18 49h28l3 6H15z"/><path d="M24 19l5-2" fill="none"/><circle cx="28" cy="20" r="1.3" fill="currentColor" stroke="none"/>',
  b: '<path d="M32 7c-5 6-13 10-13 18 0 6 5 10 9 12l-5 9h18l-5-9c4-2 9-6 9-12 0-8-8-12-13-18zM20 48h24l4 7H16z"/><path d="M34 16l-8 12" fill="none"/><circle cx="32" cy="6" r="2.5"/>',
  r: '<path d="M17 10h7v8h5v-8h6v8h5v-8h7v17l-6 5 1 15H22l1-15-6-5zM19 49h26l3 6H16z"/><path d="M23 29h18M23 43h18" fill="none"/>',
  q: '<path d="M17 18l6 13 1-16 8 16 8-16 1 16 6-13-6 27H23zM21 48h22l5 7H16z"/><circle cx="16" cy="15" r="3"/><circle cx="24" cy="12" r="3"/><circle cx="32" cy="9" r="3"/><circle cx="40" cy="12" r="3"/><circle cx="48" cy="15" r="3"/><path d="M23 38h18" fill="none"/>',
  k: '<path d="M32 6v13M26 11h12" fill="none" stroke-width="3.5"/><path d="M32 23c-4-9-16-7-16 2 0 6 7 10 9 15l-3 6h20l-3-6c2-5 9-9 9-15 0-9-12-11-16-2zM20 49h24l4 6H16z"/><path d="M25 40h14M32 24v13" fill="none"/>',
};
// HTML below comes only from these fixed templates and chess.js piece enums.
// Model metadata, FEN errors, notation, and worker output use textContent.
function pieceSVG(piece) {
  return `<svg class="piece" viewBox="0 0 64 64" aria-hidden="true" style="color:${piece.color === 'w' ? '#333a37' : '#e9dfca'}" fill="${piece.color === 'w' ? '#faf5e8' : '#303734'}" stroke="${piece.color === 'w' ? '#333a37' : '#ece3d0'}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${silhouettes[piece.type]}</svg>`;
}
let game = new Chess();
let clock = createClock({ initialMs: 180000, incrementMs: 2000 });
let human = 'w';
let flipped = false;
let selected = null;
let lastMove = null;
let active = false;
let loading = false;
let generation = 0;
let sequence = 0;
let worker = null;
let pending = new Map();
let manifest = null;
let focusSquare = 'e2';
let promotion = null;
let result = '*';
let startFen = null;
let gameSeed = '';
let gameBook = true;
let bookManifest = null;
let gameBookSource = 'eco';
let gameBookSHA256 = '';
const premove = createPremove();
const sound = createSound();
function renderPremove(message) {
  const queued = premove.peek();
  $('cancel-premove').disabled = !queued;
  $('premove-status').textContent = message || (queued ? `Queued: ${queued.from} → ${queued.to}${queued.promotion ? ' = Queen' : ''}` : $('premove').checked ? 'Premoves ready' : 'Premoves off');
}
function clearPremove() { premove.clear(); selected = null; renderPremove(); }
const neutralName = name => name.replace(/\b(?:Astra|Sol)\b[\s·:—/-]*/gi, '').trim();

function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function setNode(tag, text, className) {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
}
function currentModel() { return manifest?.models.find((m) => m.id === $('model').value); }
function modelName() { return neutralName(currentModel()?.name || $('model').selectedOptions[0]?.textContent || 'Policy'); }
function updatePlayers() {
  $('opponent-name').textContent = modelName();
  $('human-color').textContent = colors[human];
  $('opponent-color').textContent = colors[human === 'w' ? 'b' : 'w'];
  $('human-clock').setAttribute('aria-label', `${colors[human]} clock`);
  $('opponent-clock').setAttribute('aria-label', `${colors[human === 'w' ? 'b' : 'w']} clock`);
}
function drawBoard(rebuild = false) {
  if (rebuild || !$('board').children.length) {
    $('board').replaceChildren();
    const files = flipped ? 'hgfedcba' : 'abcdefgh';
    const ranks = flipped ? '12345678' : '87654321';
    for (const rank of ranks) for (const file of files) {
      const square = file + rank;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.square = square;
      button.addEventListener('click', () => selectSquare(square));
      $('board').append(button);
    }
  }
  const legal = new Set(selected ? game.moves({ square: selected, verbose: true }).map((m) => m.to) : []);
  const children = [...$('board').children];
  children.forEach((button, index) => {
    const square = button.dataset.square;
    const piece = game.get(square);
    const dark = (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 1;
    const checked = piece?.type === 'k' && piece.color === game.turn() && game.isCheck();
    button.className = ['square', dark && 'dark', piece && 'occupied', selected === square && 'selected', legal.has(square) && 'legal', (premove.peek()?.from === square || premove.peek()?.to === square) && 'premove', (lastMove?.from === square || lastMove?.to === square) && 'last', checked && 'in-check'].filter(Boolean).join(' ');
    button.tabIndex = square === focusSquare ? 0 : -1;
    button.setAttribute('aria-pressed', String(selected === square));
    button.setAttribute('aria-label', `${square}, ${piece ? `${colors[piece.color]} ${names[piece.type]}` : 'empty'}${legal.has(square) ? ', legal destination' : ''}${checked ? ', in check' : ''}${lastMove?.to === square ? ', last move' : ''}`);
    button.innerHTML = piece ? pieceSVG(piece) : '';
    if (index % 8 === 0) button.append(setNode('span', square[1], 'coord rank-coord'));
    if (index >= 56) button.append(setNode('span', square[0], 'coord file-coord'));
  });
}
function renderMoves() {
  const history = game.history({ verbose: true });
  $('moves').replaceChildren();
  if (!history.length) { $('moves').append(setNode('p', active ? 'Waiting for the first move.' : 'The first move is yours.', 'empty-state')); return; }
  let row;
  for (const move of history) {
    const number = Number(move.before.split(' ')[5]);
    if (move.color === 'w' || !row) {
      row = setNode('div', '', 'move-row');
      row.append(setNode('span', `${number}.`, 'move-number'));
      if (move.color === 'b') row.append(setNode('span', '…', 'move-san'));
      $('moves').append(row);
    }
    row.append(setNode('span', move.san, 'move-san'));
  }
  $('moves').scrollTop = $('moves').scrollHeight;
}
function displayTime(ms) {
  if (ms === null) return '∞';
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function updateClocks() {
  const state = clock.snapshot();
  for (const [id, color] of [['human-clock', human], ['opponent-clock', human === 'w' ? 'b' : 'w']]) {
    $(id).textContent = displayTime(state[color]);
    $(id).classList.toggle('active', state.active === color && active);
    $(id).classList.toggle('low', state[color] !== null && state[color] < 10000);
  }
  if (active && state.flagged) {
    if (game.isInsufficientMaterial()) finish('Draw · timeout with insufficient material', '1/2-1/2');
    else finish(`${colors[state.flagged]} ran out of time · ${colors[state.flagged === 'w' ? 'b' : 'w']} wins`, state.flagged === 'w' ? '0-1' : '1-0');
  }
  return state;
}
function cancelRequests() {
  clearPremove();
  generation++;
  worker?.terminate(); worker = null;
  for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error('Game superseded')); }
  pending.clear();
}
function closeDialogs() {
  promotion = null;
  for (const id of ['promotion-dialog', 'resign-dialog']) if ($(id).open) $(id).close();
}
function finish(message, finalResult = '*') {
  if (active) sound.play('end');
  active = false; loading = false; result = finalResult;
  clock.stop(); selected = null; closeDialogs(); cancelRequests();
  $('resign').disabled = true; $('new-game').disabled = false;
  $('new-game').innerHTML = 'New game <span aria-hidden="true">↗</span>';
  status(message, finalResult === '*'); drawBoard(); updateClocks();
}
function checkEnd() {
  if (game.isCheckmate()) { finish(`Checkmate · ${colors[game.turn() === 'w' ? 'b' : 'w']} wins`, game.turn() === 'w' ? '0-1' : '1-0'); return true; }
  const reason = game.isStalemate() ? 'stalemate' : game.isInsufficientMaterial() ? 'insufficient material' : game.isThreefoldRepetition() ? 'threefold repetition (automatic)' : game.isDrawByFiftyMoves() ? 'fifty-move rule (automatic)' : game.isDraw() ? 'drawn position' : null;
  if (reason) { finish(`Draw · ${reason}`, '1/2-1/2'); return true; }
  return false;
}
function readTimeControl() {
  const value = $('time-control').value;
  if (value === 'unlimited') return { initialMs: null, incrementMs: 0 };
  if (value === 'custom') {
    const minutes = Number($('custom-minutes').value);
    const increment = Number($('custom-increment').value);
    if (!Number.isFinite(minutes) || minutes < 0.05 || minutes > 180 || !Number.isFinite(increment) || increment < 0 || increment > 180) throw new Error('Custom time: use 0.05–180 minutes and 0–180 seconds increment.');
    return { initialMs: minutes * 60000, incrementMs: increment * 1000 };
  }
  const [seconds, increment] = value.split(',').map(Number);
  return { initialMs: seconds * 1000, incrementMs: increment * 1000 };
}
function clearReadout() {
  $('latency').textContent = '— ms';
  $('move-source').textContent = '—';
  $('score-label').textContent = 'Raw score';
  $('candidates').replaceChildren(setNode('li', 'Awaiting a move.', 'empty-state'));
}
function resetPosition(fen = null) {
  const next = fen ? new Chess(fen) : new Chess();
  const config = readTimeControl();
  active = false; loading = false; cancelRequests(); closeDialogs();
  gameSeed = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
  gameBook = $('book').checked;
  gameBookSource = $('book-source').value;
  gameBookSHA256 = bookManifest?.books.find(entry => entry.id === gameBookSource)?.sha256 || '';
  game = next; startFen = fen; result = '*'; lastMove = null; selected = null;
  human = $('color').value; flipped = human === 'b'; focusSquare = human === 'w' ? 'e2' : 'e7';
  clock.reset(config); $('resign').disabled = true; $('new-game').disabled = false;
  updatePlayers(); drawBoard(true); renderMoves(); clearReadout(); updateClocks();
}
function createEngineWorker() {
  worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
  const instance = worker;
  instance.onmessage = ({ data }) => {
    if (instance !== worker || !data || typeof data.id !== 'string') return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id); clearTimeout(request.timeout);
    if (data.type === 'error') request.reject(new Error(data.error || 'Policy worker error'));
    else if (data.type !== request.expected) request.reject(new Error('Unexpected policy response'));
    else request.resolve(data);
  };
  instance.onerror = (event) => {
    event.preventDefault();
    if (instance !== worker) return;
    finish('Policy worker failed; start a new game to retry.');
  };
  instance.onmessageerror = () => { if (instance === worker) finish('Could not decode the policy response. Start a new game to retry.'); };
}
function request(type, payload) {
  const id = `${generation}:${++sequence}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id); reject(new Error(type === 'load' ? 'Model loading timed out.' : 'Policy inference timed out.'));
    }, type === 'load' ? 60000 : 30000);
    pending.set(id, { resolve, reject, timeout, expected: type === 'load' ? 'loaded' : 'move' });
    try { worker.postMessage({ type, id, ...payload }); }
    catch (error) { pending.delete(id); clearTimeout(timeout); reject(error); }
  });
}
async function newGame(fen = null) {
  try { resetPosition(fen); } catch (error) { status(error.message, true); return; }
  const token = generation;
  loading = true; $('new-game').disabled = true; status(`Loading ${modelName()} weights…`);
  try {
    await manifestReady;
    if (generation !== token) return;
    if (!currentModel()) throw new Error('Selected policy is not available in the manifest.');
    createEngineWorker();
    const loaded = await request('load', { modelId: $('model').value, book: {enabled:gameBook,source:gameBookSource,seed:gameSeed} });
    if (generation !== token) return;
    if (loaded.modelId !== $('model').value) throw new Error('Loaded policy does not match the selection.');
    if (loaded.bookSource !== undefined && loaded.bookSource !== gameBookSource) throw new Error('Loaded opening book does not match the selection.');
    if (loaded.bookSHA256 !== undefined) gameBookSHA256 = loaded.bookSHA256;
    loading = false; active = true;
    $('new-game').disabled = false; $('new-game').innerHTML = 'New game <span aria-hidden="true">↗</span>';
    $('resign').disabled = false;
    if (checkEnd()) return;
    clock.start(game.turn()); updateClocks(); takeTurn();
  } catch (error) {
    if (generation !== token) return;
    finish(`Unable to play: ${error.message}`);
  }
}
function takeTurn() {
  if (!active || updateClocks().flagged || checkEnd()) return;
  if (game.turn() === human) {
    const hadPremove = Boolean(premove.peek());
    const queued = premove.take(game, {human, token:generation, active});
    renderPremove(hadPremove && !queued ? 'Premove cancelled · not legal after reply' : undefined);
    if (queued) { commitMove(queued); return; }
    if (hadPremove) drawBoard();
    status(`Your move${game.isCheck() ? ' · check' : ''}`); return;
  }
  status(`${modelName()} is thinking…`);
  const token = generation;
  const fen = game.fen();
  request('move', { fen: startFen && !game.history().length ? startFen : fen, history: {startFen: startFen || undefined, history: game.history({verbose:true}).map(m => m.from + m.to + (m.promotion || ''))} }).then((answer) => {
    if (token !== generation || !active || game.fen() !== fen) return;
    if (updateClocks().flagged || !active) return;
    if (typeof answer.move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(answer.move)) throw new Error('Policy returned no legal move.');
    const legal = game.moves({ verbose: true }).find((m) => m.from + m.to + (m.promotion || '') === answer.move);
    if (!legal) throw new Error('Policy returned an illegal move.');
    $('latency').textContent = `${Number(answer.elapsedMs).toFixed(2)} ms`;
    $('move-source').textContent = answer.source === 'book' ? 'book' : 'policy';
    $('score-label').textContent = answer.source === 'book' ? 'Weight' : currentModel()?.runtime === 'onnx' ? 'Expected return' : 'Raw score';
    $('candidates').replaceChildren();
    for (const [index, item] of (Array.isArray(answer.candidates) ? answer.candidates : []).slice(0, 5).entries()) {
      if (typeof item.move !== 'string' || !Number.isFinite(answer.source === 'book' ? item.weight : item.score)) continue;
      const row = setNode('li', '', 'candidate');
      row.append(setNode('span', String(index + 1).padStart(2, '0'), 'candidate-rank'), setNode('span', item.move), setNode('span', answer.source === 'book' ? String(item.weight) : item.score.toFixed(3), answer.source === 'book' ? 'candidate-weight' : 'candidate-score'));
      $('candidates').append(row);
    }
    commitMove(legal);
  }).catch((error) => { if (token === generation && active) finish(`Policy error: ${error.message}`); });
}
function commitMove(move) {
  if (!active || updateClocks().flagged) return;
  const color = game.turn();
  if (!clock.completeMove(color)) { updateClocks(); return; }
  try { lastMove = game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }); }
  catch { finish('Game stopped: the move could not be applied.'); return; }
  sound.play(game.isCheck() ? 'check' : lastMove.captured ? 'capture' : 'move');
  selected = null; drawBoard(); renderMoves(); updateClocks(); takeTurn();
}
function selectSquare(square) {
  focusSquare = square;
  if (!active || loading || promotion || updateClocks().flagged) return;
  if (game.turn() !== human) {
    if (!$('premove').checked) return;
    if (selected && premove.set(game, human, selected, square, generation)) { selected = null; renderPremove(); drawBoard(); return; }
    selected = game.get(square)?.color === human && selected !== square ? square : null;
    drawBoard(); return;
  }
  const possible = selected ? game.moves({ square: selected, verbose: true }).filter((m) => m.to === square) : [];
  if (possible.length) {
    if (possible.some((m) => m.promotion)) {
      promotion = { moves: possible, token: generation };
      $('promotion-choices').replaceChildren();
      for (const type of ['q', 'r', 'b', 'n']) {
        const move = possible.find((m) => m.promotion === type);
        if (!move) continue;
        const button = document.createElement('button'); button.type = 'button'; button.dataset.promotion = type;
        button.setAttribute('aria-label', `Promote to ${names[type]}`);
        button.innerHTML = pieceSVG({ type, color: human }); button.append(setNode('small', names[type]));
        button.onclick = () => { const chosen = promotion; promotion = null; $('promotion-dialog').close(); if (chosen?.token === generation && active) commitMove(move); };
        $('promotion-choices').append(button);
      }
      $('promotion-dialog').showModal();
    } else commitMove(possible[0]);
    return;
  }
  selected = game.get(square)?.color === human && selected !== square ? square : null;
  drawBoard();
}
$('board').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { clearPremove(); drawBoard(); return; }
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[event.key];
  if (delta === undefined) return;
  event.preventDefault();
  const buttons = [...$('board').children];
  const index = buttons.indexOf(event.target);
  const next = index + delta;
  if (next < 0 || next >= 64 || (Math.abs(delta) === 1 && Math.floor(next / 8) !== Math.floor(index / 8))) return;
  focusSquare = buttons[next].dataset.square;
  buttons.forEach((b) => { b.tabIndex = b.dataset.square === focusSquare ? 0 : -1; }); buttons[next].focus();
});
$('new-game').onclick = () => newGame();
document.addEventListener('keydown', event => { if (event.key === 'Escape') { clearPremove(); drawBoard(); } });
$('board').addEventListener('contextmenu', event => { event.preventDefault(); clearPremove(); drawBoard(); });
$('cancel-premove').onclick = () => { clearPremove(); drawBoard(); };
$('premove').onchange = () => { clearPremove(); drawBoard(); };
$('sound').checked = sound.enabled;
$('sound').onchange = () => sound.setEnabled($('sound').checked);
document.addEventListener('pointerdown', () => sound.unlock(), {capture:true});
document.addEventListener('keydown', () => sound.unlock(), {capture:true});
$('flip').onclick = () => { flipped = !flipped; drawBoard(true); };
$('cancel-promotion').onclick = () => { promotion = null; $('promotion-dialog').close(); };
$('promotion-dialog').addEventListener('cancel', () => { promotion = null; });
$('resign').onclick = () => { if (active) $('resign-dialog').showModal(); };
$('cancel-resign').onclick = () => $('resign-dialog').close();
$('confirm-resign').onclick = () => {
  if (active && !updateClocks().flagged) finish(`${colors[human]} resigned · ${colors[human === 'w' ? 'b' : 'w']} wins`, human === 'w' ? '0-1' : '1-0');
};
for (const id of ['color', 'model', 'time-control', 'custom-minutes', 'custom-increment', 'book', 'book-source']) {
  $(id).addEventListener('change', () => {
    $('custom-time').hidden = $('time-control').value !== 'custom';
    try { resetPosition(); status('Settings changed · start a new game'); } catch (error) { status(error.message, true); }
  });
}
$('fen-form').onsubmit = (event) => { event.preventDefault(); const fen = $('fen').value.trim(); if (!fen) { status('Paste a FEN position first.', true); return; } newGame(fen); };
$('download-pgn').onclick = () => {
  game.header('Event', 'Chess Lab game', 'White', human === 'w' ? 'Human' : modelName(), 'Black', human === 'b' ? 'Human' : modelName(), 'Result', result, 'Seed', gameSeed, 'Book', gameBook ? 'on' : 'off', 'BookSource', gameBookSource, 'BookHash', gameBookSHA256, 'BookHashAlgorithm', 'SHA256');
  if (startFen) game.header('SetUp', '1', 'FEN', startFen);
  const url = URL.createObjectURL(new Blob([game.pgn() + '\n'], { type: 'application/x-chess-pgn' }));
  const link = document.createElement('a'); link.href = url; link.download = 'chess-lab-game.pgn'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function loadManifest() {
  const response = await fetch(new URL('./models/manifest.json', import.meta.url));
  if (!response.ok) throw new Error(`Model manifest unavailable (HTTP ${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data.models) || !data.models.length || data.models.some((m) => !/^[a-z][a-z0-9-]*$/.test(m.id) || typeof m.name !== 'string')) throw new Error('Invalid model manifest.');
  manifest = data;
  const selectedModel = $('model').value;
  $('model').replaceChildren(); $('model-downloads').replaceChildren();
  for (const model of data.models) {
    const option = setNode('option', neutralName(model.name)); option.value = model.id; $('model').append(option);
    const row = setNode('div', '', 'model-download');
    const info = setNode('div', neutralName(model.name));
    const count = (n) => Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
    info.append(setNode('small', model.runtime === 'onnx' ? `${count(model.parameters)} parameters · Transformer / CPU WASM` : `${count(model.parameters)} parameters · ${count(model.neurons)} neurons`));
    const base = new URL('./models/', import.meta.url);
    const url = modelResourceURL(model, base);
    const link = setNode('a', `${Number.isFinite(model.bytes) ? (model.bytes / 1024 / 1024).toFixed(2) + ' MiB' : 'Weights'} ↓`);
    link.href = url.href; link.download = model.file;
    row.append(info, link); $('model-downloads').append(row);
  }
  if (data.models.some((m) => m.id === selectedModel)) $('model').value = selectedModel;
  updatePlayers();
  return data;
}
async function loadBookManifest() {
  const response = await fetch(new URL('./books/manifest.json', import.meta.url));
  if (!response.ok) throw new Error(`Opening-book registry unavailable (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.version !== 1 || data.default !== 'eco' || !Array.isArray(data.books) || !data.books.length) throw new Error('Invalid opening-book registry.');
  const ids = new Set();
  for (const entry of data.books) {
    if (!entry || typeof entry.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(entry.id) || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim()) throw new Error('Invalid opening-book registry entry.');
    ids.add(entry.id);
    if (entry.id === 'eco' ? entry.file !== '../openings.json' : typeof entry.file !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(entry.file)) throw new Error('Invalid opening-book asset path.');
    if (entry.sha256 !== undefined && (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw new Error('Invalid opening-book SHA256.');
  }
  if (!ids.has('eco')) throw new Error('Opening-book registry is missing ECO.');
  bookManifest = data;
  const selected = $('book-source').value;
  $('book-source').replaceChildren();
  for (const entry of data.books) {
    const option = setNode('option', entry.name); option.value = entry.id; $('book-source').append(option);
  }
  $('book-source').value = ids.has(selected) ? selected : 'eco';
  return data;
}
const manifestReady = Promise.all([loadManifest(), loadBookManifest()]);
manifestReady.catch((error) => { $('model-downloads').textContent = error.message; if (!active && !loading) status(error.message, true); });
resetPosition();
status('Ready to play');
setInterval(updateClocks, 100);
document.addEventListener('visibilitychange', updateClocks);
window.addEventListener('pageshow', updateClocks);
