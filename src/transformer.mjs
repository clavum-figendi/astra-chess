// Copyright 2026 Chess Lab contributors.
// DeepMind searchless_chess architecture/token contract: Apache License 2.0.
// Published DeepMind weights: CC-BY 4.0.
// Browser conversion adapter for the DeepMind 9M action-value transformer.

export const CHARACTERS = '0123456789abcdefghpnrkqPBNRQKw.';
const CHAR_INDEX = Object.fromEntries([...CHARACTERS].map((char, index) => [char, index]));

async function importOrt() {
  const ort = await import(new URL('../vendor/ort/ort.wasm.bundle.min.mjs', import.meta.url).href);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
  return ort;
}

function asFloat32(output) {
  const tensor = output;
  const values = tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data);
  return { shape: [...tensor.dims], values };
}

export async function loadTransformer(buffer, metadata) {
  if (!metadata || typeof metadata !== 'object') throw new Error('Transformer metadata is required');
  if (metadata.architecture !== 'deepmind-9m-action-value') throw new Error(`Unsupported architecture ${metadata.architecture}`);
  if (metadata.config?.max_sequence_length !== 79 || metadata.config?.output_size !== 128) throw new Error('Unsupported transformer sequence or bucket count');
  if (metadata.runtime !== 'onnx') throw new Error('Unsupported runtime');
  if (!(buffer instanceof ArrayBuffer)) throw new Error('Transformer model must be an ArrayBuffer');
  const ort = await importOrt();
  const session = await ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    logSeverityLevel: 3,
    enableCpuMemArena: true,
  });
  const input = session.inputNames[0];
  const output = session.outputNames[0];
  if (!input || !output) throw new Error('Transformer model must expose one input and one output');
  return {
    architecture: metadata.architecture,
    runtime: metadata.runtime,
    variant: metadata.variant,
    batchSize: 4,
    inputName: input,
    outputName: output,
    session,
    ort,
  };
}

export async function chooseTransformerMove(fen, model, options = {}) {
  const started = performance.now();
  if (!model?.session || !model.ort) throw new Error('Transformer model is not initialized');
  const { Chess } = await import('./chess.mjs');
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true }).map((move) => move.from + move.to + (move.promotion || ''));
  if (!legal.length || chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) return { move: null, candidates: [], elapsedMs: performance.now() - started };
  legal.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const normalizedFen = chess.fen();
  const values = await scoreMoves(model, normalizedFen, legal);
  const overrides = options.startFen || options.history ? repetitionOverrides(Chess, options, legal, normalizedFen) : new Map();
  const candidates = rankCandidates(legal, values, overrides);
  return { move: candidates[0]?.move ?? null, candidates: candidates.slice(0, 5), elapsedMs: performance.now() - started };
}

async function scoreMoves(model, fen, legal) {
  const values = new Float64Array(legal.length);
  for (let start = 0; start < legal.length; start += model.batchSize) {
    const moves = legal.slice(start, start + model.batchSize);
    const tokens = encodeStateActions(fen, moves);
    const tensor = new model.ort.Tensor('int64', BigInt64Array.from(tokens, BigInt), [moves.length, 79]);
    const result = await model.session.run({ [model.inputName]: tensor });
    const { shape, values: logits } = asFloat32(result[model.outputName]);
    if (shape.length !== 2 || shape[0] !== moves.length || shape[1] !== 128) throw new Error(`Unexpected logits shape ${shape.join(',')}`);
    values.set(expectedValues(logits), start);
  }
  return values;
}

export function repetitionOverrides(Chess, options, legal, normalizedFen) {
  const replay = new Chess(options.startFen);
  for (const move of options.history ?? []) replay.move(move);
  if (replay.fen() !== normalizedFen) throw new Error('History does not reconstruct the requested FEN');
  const overrides = new Map();
  for (const move of legal) {
    replay.move(move);
    let claimable = replay.isThreefoldRepetition();
    if (!claimable) {
      for (const reply of replay.moves()) {
        replay.move(reply);
        claimable = replay.isThreefoldRepetition();
        replay.undo();
        if (claimable) break;
      }
    }
    if (claimable) overrides.set(move, 0.5);
    replay.undo();
  }
  return overrides;
}

export function tokenizeFen(fen) {
  const [board, side, castling, ep, half, full] = fen.split(' ');
  if (!board || !side || !castling || !ep || !half || !full) throw new Error('Invalid FEN fields');
  let encoded = side;
  for (const char of board.replace(/\//g, '')) {
    encoded += char >= '1' && char <= '8' ? '.'.repeat(Number(char)) : char;
  }
  encoded += (castling === '-' ? '' : castling).padEnd(4, '.');
  encoded += ep === '-' ? '..' : ep;
  encoded += half.padEnd(3, '.') + full.padEnd(3, '.');
  if (encoded.length !== 77) throw new Error('FEN does not encode to exactly 77 tokens');
  return [...encoded].map((char) => {
    const token = CHAR_INDEX[char];
    if (token === undefined) throw new Error(`Unknown FEN character ${char}`);
    return token;
  });
}

function queenKnightTargets(square) {
  const targets = new Set();
  const rank = square >> 3;
  const file = square & 7;
  for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let offset = 1; offset < 8; offset += 1) {
      const targetRank = rank + dr * offset;
      const targetFile = file + df * offset;
      if (targetRank < 0 || targetRank > 7 || targetFile < 0 || targetFile > 7) break;
      targets.add(targetRank * 8 + targetFile);
    }
  }
  const queen = [...targets].sort((a,b)=>a-b);
  targets.clear();
  for (const [dr, df] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
    const targetRank = rank + dr;
    const targetFile = file + df;
    if (targetRank >= 0 && targetRank < 8 && targetFile >= 0 && targetFile < 8) {
      targets.add(targetRank * 8 + targetFile);
    }
  }
  return [...queen, ...[...targets].sort((a,b)=>a-b)];
}

function squareName(square) {
  return 'abcdefgh'[square & 7] + String((square >> 3) + 1);
}

function buildActions() {
  const moves = [];
  for (let square = 0; square < 64; square += 1) {
    moves.push(...queenKnightTargets(square).map((target) => squareName(square) + squareName(target)));
  }
  for (const [rank, targetRank] of [['2', '1'], ['7', '8']]) {
    const fileLetters = 'abcdefgh';
    for (let index = 0; index < 8; index += 1) {
      const file = fileLetters[index];
      const targets = [file];
      if (index > 0) targets.push(fileLetters[index - 1]);
      if (index < 7) targets.push(fileLetters[index + 1]);
      for (const target of targets) {
        for (const promotion of 'qrbn') moves.push(file + rank + target + targetRank + promotion);
      }
    }
  }
  return moves;
}

export const ACTION_TO_MOVE = buildActions();
export const MOVE_TO_ACTION = new Map(ACTION_TO_MOVE.map((move, index) => [move, index]));

export function actionId(move) {
  const id = MOVE_TO_ACTION.get(move);
  if (id === undefined) throw new Error(`Unsupported action ${move}`);
  return id;
}

export function encodeStateActions(fen, moves) {
  if (!moves.length) return new Int32Array(0);
  const tokens = tokenizeFen(fen);
  const result = new Int32Array(moves.length * 79);
  moves.forEach((move, row) => {
    const base = row * 79;
    for (let index = 0; index < 77; index += 1) result[base + index] = tokens[index];
    result[base + 77] = actionId(move);
    result[base + 78] = 0;
  });
  return result;
}

export function expectedValues(logits) {
  if (logits.length % 128) throw new Error('Expected 128 bucket logits');
  const rows = logits.length / 128;
  const centers = Float64Array.from({ length: 128 }, (_, index) => (index + 0.5) / 128);
  return Float64Array.from({ length: rows }, (_, row) => {
    const offset = row * 128;
    const values = logits.subarray(offset, offset + 128);
    const max = Math.max(...values);
    const exps = values.map((value) => Math.exp(value - max));
    const total = exps.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(total) || total <= 0) throw new Error('Invalid softmax denominator');
    return exps.reduce((sum, value, index) => sum + value * centers[index] / total, 0);
  });
}

export function rankCandidates(moves, values, overrides = new Map()) {
  if (moves.length !== values.length) throw new Error('Move/value count mismatch');
  return moves.map((move, index) => ({ move, score: overrides.has(move) ? overrides.get(move) : values[index] }))
    .sort((a, b) => b.score - a.score || (a.move < b.move ? -1 : a.move > b.move ? 1 : 0));
}
