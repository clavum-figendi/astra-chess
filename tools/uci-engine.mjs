import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from '../src/chess.mjs';

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const DEFAULT_ROOT = fileURLToPath(new URL('../.cache/engines/root/usr/games/', import.meta.url));
const integer = (value, name, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}: expected integer ${min}..${max}`);
  return value;
};

function parseOption(line) {
  const match = /^option name (.+?) type (spin|check|combo|button|string)(.*)$/.exec(line);
  if (!match) return null;
  const option = { name: match[1], type: match[2], raw: line };
  const fields = match[3];
  const def = / default (.*?)(?= min | max | var |$)/.exec(fields)?.[1];
  if (def !== undefined) option.default = option.type === 'spin' ? Number(def) : option.type === 'check' ? def === 'true' : def;
  for (const field of ['min', 'max']) {
    const value = new RegExp(` ${field} (-?\\d+)`).exec(fields);
    if (value) option[field] = Number(value[1]);
  }
  if (option.type === 'combo') option.vars = [...fields.matchAll(/ var (.*?)(?= var |$)/g)].map(m => m[1]);
  return option;
}

function parseInfo(line) {
  if (line.startsWith('info string ')) return null;
  const tokens = line.trim().split(/\s+/);
  const get = key => { const i = tokens.indexOf(key); return i < 0 ? undefined : Number(tokens[i + 1]); };
  const pvIndex = tokens.indexOf('pv');
  const depth = get('depth');
  if (pvIndex < 0 || !Number.isSafeInteger(depth) || depth < 0 || depth > 128 || !tokens.slice(pvIndex + 1).every(move => UCI_MOVE.test(move)) || !tokens[pvIndex + 1]) return null;
  const rank = get('multipv') ?? 1;
  if (!Number.isSafeInteger(rank) || rank < 1 || rank > 256) return null;
  const result = { move: tokens[pvIndex + 1], depth, pv: tokens.slice(pvIndex + 1), multipv: rank };
  if (get('nodes') !== undefined) result.nodes = get('nodes');
  const score = tokens.indexOf('score');
  if (score >= 0 && ['cp', 'mate'].includes(tokens[score + 1]) && Number.isSafeInteger(Number(tokens[score + 2]))) result[tokens[score + 1]] = Number(tokens[score + 2]);
  if (tokens.includes('lowerbound')) result.bound = 'lower';
  if (tokens.includes('upperbound')) result.bound = 'upper';
  return result;
}

/** Development-only local engines. No shell, network, or inference integration. */
export async function openEngine({ kind, path, timeoutMs = 15000 } = {}) {
  if (!['stockfish', 'gnuchess'].includes(kind)) throw new Error('Unsupported engine kind');
  integer(timeoutMs, 'timeoutMs', 20, 600000);
  const executable = resolve(path || process.env[kind === 'stockfish' ? 'STOCKFISH_PATH' : 'GNUCHESS_PATH'] || `${DEFAULT_ROOT}${kind}`);
  await access(executable, constants.X_OK);
  const child = spawn(executable, kind === 'gnuchess' ? ['--uci'] : [], {
    cwd: dirname(executable), env: { ...process.env, PATH: `${dirname(executable)}:${process.env.PATH || ''}` },
    stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
  });
  let stderr = '', buffer = '', failure = null, closed = false, busy = false, waiter = null, onInfo = null;
  const identity = { kind, path: executable, name: '', author: '' };
  const options = [];
  function kill() {
    try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already exited. */ }
  }
  function fail(error) {
    if (!failure) failure = error;
    if (waiter) { const current = waiter; waiter = null; clearTimeout(current.timer); current.reject(failure); }
  }
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-8192); });
  child.on('error', error => fail(new Error(`Engine spawn failed: ${error.message}`)));
  child.stdin.on('error', error => { if (!closed) fail(new Error(`Engine input failed: ${error.message}`)); });
  child.on('exit', (code, signal) => { if (!closed) fail(new Error(`Engine exited (${code ?? signal}); stderr: ${stderr}`)); });
  function send(command) {
    if (failure) throw failure;
    if (closed) throw new Error('Engine is closed');
    if (/[\r\n\0]/.test(command)) throw new Error('Unsafe UCI command');
    child.stdin.write(`${command}\n`);
  }
  function waitFor(predicate, label) {
    if (failure) return Promise.reject(failure);
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => { fail(new Error(`Engine timeout waiting for ${label}; stderr: ${stderr}`)); kill(); }, timeoutMs);
      waiter = { predicate, accept, reject, timer };
    });
  }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => {
    buffer += data;
    if (buffer.length > 1024 * 1024) { fail(new Error('Engine stdout line exceeded limit')); kill(); return; }
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
      if (line.startsWith('id name ')) identity.name = line.slice(8);
      if (line.startsWith('id author ')) identity.author = line.slice(10);
      const option = parseOption(line);
      if (option && !options.some(o => o.name === option.name)) options.push(option);
      if (onInfo && line.startsWith('info ')) onInfo(line);
      if (waiter && waiter.predicate(line)) {
        const current = waiter; waiter = null; clearTimeout(current.timer); current.accept(line);
      }
    }
  });
  async function ready() { const waiting = waitFor(line => line === 'readyok', 'readyok'); send('isready'); await waiting; }
  function setOption(name, value) {
    const option = options.find(o => o.name.toLowerCase() === name.toLowerCase());
    if (!option) return false;
    send(`setoption name ${option.name} value ${value}`); option.value = value; return true;
  }
  async function close() {
    if (closed) return;
    closed = true;
    fail(new Error('Engine is closed'));
    try { child.stdin.end('quit\n'); } catch { /* exited */ }
    // GNU's UCI adapter may leave its worker alive after quit; bound shutdown.
    await new Promise(accept => {
      if (child.exitCode !== null || child.signalCode !== null) { accept(); return; }
      const timer = setTimeout(() => { kill(); accept(); }, 250);
      child.once('exit', () => { clearTimeout(timer); kill(); accept(); });
    });
    kill();
  }
  try {
    const handshake = waitFor(line => line === 'uciok', 'uciok'); send('uci'); await handshake;
    if (!identity.name) throw new Error('Engine did not identify itself');
    setOption('Threads', 1); setOption('Hash', 16); setOption('Ponder', false); setOption('OwnBook', false);
    await ready();
  } catch (error) { await close(); throw error; }
  return {
    identity, options, close,
    async analyze(fen, { depth, nodes, multiPV = 1, moves } = {}) {
      if (busy) throw new Error('Concurrent analyze is not supported');
      if (closed) throw new Error('Engine is closed');
      if (failure) throw failure;
      if (typeof fen !== 'string' || /[\r\n\0]/.test(fen)) throw new Error('Unsafe FEN');
      const game = new Chess(fen);
      if (depth === undefined && nodes === undefined) depth = 4;
      if (depth !== undefined) integer(depth, 'depth', 1, 128);
      if (nodes !== undefined) integer(nodes, 'nodes', 1, Number.MAX_SAFE_INTEGER);
      integer(multiPV, 'multiPV', 1, 256);
      if (multiPV > 1 && !options.some(o => o.name === 'MultiPV')) throw new Error('Engine does not support MultiPV');
      let command = `position fen ${game.fen()}`, positionSource = 'fen';
      if (moves !== undefined) {
        if (!Array.isArray(moves) || moves.some(move => typeof move !== 'string' || !UCI_MOVE.test(move))) throw new Error('Invalid UCI move history');
        const replay = new Chess();
        for (const move of moves) replay.move(move);
        if (replay.fen() !== game.fen()) throw new Error('History does not reach supplied FEN');
        command = `position startpos${moves.length ? ` moves ${moves.join(' ')}` : ''}`; positionSource = 'history';
      }
      busy = true;
      try {
        await ready(); // Drain stale unsolicited output before accepting a new bestmove.
        setOption('MultiPV', multiPV);
        send(command);
        const legal = game.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
        const expected = Math.min(multiPV, legal.length);
        const iterations = new Map();
        let completeLines = null, observedNodes = 0, stopSent = false;
        const limitMode = kind === 'gnuchess' && nodes !== undefined ? 'reported-nodes-stop' : 'native-uci';
        onInfo = line => {
          const reportedNodes = /(?:^|\s)nodes (\d+)(?:\s|$)/.exec(line);
          if (reportedNodes) observedNodes = Math.max(observedNodes, Number(reportedNodes[1]));
          // GNU 6.2.9's UCI adapter accepts but ignores `go nodes`. Its live
          // node reports permit a cooperative stop, never an exact node cap.
          if (limitMode === 'reported-nodes-stop' && observedNodes >= nodes && !stopSent) { stopSent = true; send('stop'); }
          const info = parseInfo(line);
          if (!info || !legal.includes(info.move) || info.multipv > expected) return;
          if (!iterations.has(info.depth)) iterations.set(info.depth, new Map());
          const iteration = iterations.get(info.depth);
          iteration.set(info.multipv, info);
          const snapshot = [...iteration.values()].sort((a, b) => a.multipv - b.multipv);
          if (snapshot.length === expected && snapshot.every((entry, i) => entry.multipv === i + 1 && !entry.bound && (entry.cp !== undefined || entry.mate !== undefined)) &&
              new Set(snapshot.map(entry => entry.move)).size === expected && (!completeLines || info.depth >= completeLines[0].depth)) completeLines = snapshot;
        };
        const waiting = waitFor(line => /^bestmove\s/.test(line), 'bestmove');
        send(`go${depth === undefined ? '' : ` depth ${depth}`}${nodes === undefined ? '' : ` nodes ${nodes}`}`);
        const best = await waiting;
        const bestmove = best.split(/\s+/)[1];
        if (!UCI_MOVE.test(bestmove) || !legal.includes(bestmove)) throw new Error(`Engine returned illegal/null bestmove: ${bestmove}`);
        const lastDepth = Math.max(...iterations.keys());
        const lines = completeLines || [...(iterations.get(lastDepth)?.values() || [])].sort((a, b) => a.multipv - b.multipv);
        return { bestmove, lines, depth: lines[0]?.depth, complete: completeLines !== null, expectedLines: expected, positionSource, limitMode, observedNodes };
      } finally { onInfo = null; busy = false; }
    },
  };
}
