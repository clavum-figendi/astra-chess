import { checksum, parseModel } from '../src/network.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildKingEndgames } from './endgame-circuits.mjs';

export const MODEL_IDS = ['pocket', 'pocket-plus', 'atlas', 'atlas-plus'];

const VALUES = [1, 3.2, 3.35, 5, 9, 0];
const file = square => square % 8;
const rank = square => Math.floor(square / 8);
const inside = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const piece = (side, type, square) => (side * 6 + type) * 64 + square;

// Hash-consing shares identical arithmetic, including the many unchanged rays.
export class Graph {
  constructor() {
    this.nodes = [];
    this.memo = new Map();
    this.zero = this.node([], 0, 0);
  }
  node(edges, bias = 0, activation = 1) {
    const merged = new Map();
    for (const [id, weight] of edges) merged.set(id, (merged.get(id) || 0) + weight);
    const terms = [...merged].filter(([, w]) => w !== 0).sort((a, b) => a[0] - b[0]);
    if (bias === 0 && terms.length === 1 && terms[0][1] === 1) return terms[0][0];
    const key = `${activation}:${bias}:${terms.map(t => t.join(',')).join(';')}`;
    if (this.memo.has(key)) return this.memo.get(key);
    const id = 768 + this.nodes.length;
    this.nodes.push({ edges: terms, bias, activation });
    this.memo.set(key, id);
    return id;
  }
  and(...ids) { return this.node(ids.map(id => [id, 1]), 1 - ids.length); }
  any(ids) {
    if (!ids.length) return this.zero;
    const sum = this.node(ids.map(id => [id, 1]), 0, 0);
    const excess = this.node([[sum, 1]], -1);
    return this.node([[sum, 1], [excess, -1]], 0, 0);
  }
}

function geometry(from, to) {
  const df = file(to) - file(from), dr = rank(to) - rank(from);
  const af = Math.abs(df), ar = Math.abs(dr);
  const diagonal = af === ar && af > 0;
  const straight = (df === 0 || dr === 0) && from !== to;
  const types = [];
  if ((df === 0 && (dr === 1 || (dr === 2 && rank(from) === 1))) || (af === 1 && dr === 1)) types.push(0);
  if ((af === 1 && ar === 2) || (af === 2 && ar === 1)) types.push(1);
  if (diagonal) types.push(2);
  if (straight) types.push(3);
  if (diagonal || straight) types.push(4);
  if (Math.max(af, ar) === 1 || (from === 4 && (to === 2 || to === 6))) types.push(5);
  return types;
}

function positional(type, square) {
  const f = file(square), r = rank(square);
  const center = 3.5 - (Math.abs(f - 3.5) + Math.abs(r - 3.5)) / 2;
  if (type === 0) return r * 0.075 + (3.5 - Math.abs(f - 3.5)) * 0.065;
  if (type === 1) return center * 0.19 + (r > 0 ? 0.14 : 0) - (f === 0 || f === 7 ? 0.18 : 0);
  if (type === 2) return center * 0.055 + (r > 0 ? 0.2 : 0);
  if (type === 3) return (r === 6 ? 0.18 : 0) + center * 0.015;
  if (type === 4) return center * 0.012;
  return -r * 0.09;
}

function makeCircuits(g) {
  const occupancy = Array.from({ length: 64 }, (_, sq) => g.node(Array.from({ length: 12 }, (_, p) => [p * 64 + sq, 1]), 0, 0));
  const attackCache = new Map();
  function attacks(side, target, exclude = -1) {
    const key = `${side}:${target}:${exclude}`;
    if (attackCache.has(key)) return attackCache.get(key);
    const groups = Array.from({ length: 6 }, () => []);
    const tf = file(target), tr = rank(target);
    for (let origin = 0; origin < 64; origin++) {
      if (origin === target || origin === exclude) continue;
      const df = tf - file(origin), dr = tr - rank(origin);
      const af = Math.abs(df), ar = Math.abs(dr);
      if (af === 1 && dr === (side === 0 ? 1 : -1)) groups[0].push(piece(side, 0, origin));
      if ((af === 1 && ar === 2) || (af === 2 && ar === 1)) groups[1].push(piece(side, 1, origin));
      if (Math.max(af, ar) === 1) groups[5].push(piece(side, 5, origin));
      const diagonal = af === ar && af > 0;
      const straight = (df === 0 || dr === 0) && origin !== target;
      if (!diagonal && !straight) continue;
      const blockers = [];
      const sf = Math.sign(df), sr = Math.sign(dr);
      for (let f = file(origin) + sf, r = rank(origin) + sr; f !== tf || r !== tr; f += sf, r += sr) {
        const sq = r * 8 + f;
        if (sq !== exclude) blockers.push(occupancy[sq]);
      }
      for (const type of diagonal ? [2, 4] : [3, 4]) {
        groups[type].push(g.node([[piece(side, type, origin), 1], ...blockers.map(id => [id, -1])]));
      }
    }
    const all = g.any(groups.flat());
    const cheaper = [g.any(groups[0]), g.any(groups.slice(0, 3).flat()), g.any(groups.slice(0, 4).flat()), g.any(groups.slice(0, 5).flat())];
    const tiers = [all, ...cheaper.map(id => g.node([[all, 1], [id, -1]]))];
    const result = { all, tiers, groups };
    attackCache.set(key, result);
    return result;
  }
  function riskTerms(mover, value, danger, support, multiplier) {
    const terms = [[g.and(mover, danger.all), -value * multiplier]];
    const levels = [1, 3.2, 5, 9, 20];
    let prior = 0;
    for (let i = 0; i < levels.length; i++) {
      const increment = Math.min(value, levels[i]) - prior;
      if (increment > 0) terms.push([g.and(mover, support.all, danger.tiers[i]), increment * multiplier]);
      prior = Math.min(value, levels[i]);
    }
    return terms;
  }
  return { occupancy, attacks, riskTerms };
}

function atlasCircuits(g, c, light = false) {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const ray = (from, df, dr) => {
    const squares = [];
    for (let f = file(from) + df, r = rank(from) + dr; inside(f, r); f += df, r += dr) squares.push(r * 8 + f);
    return squares;
  };
  const rayFrom = Array.from({ length: 64 }, (_, square) => directions.map(([df, dr]) => ray(square, df, dr)));
  function movedAttack(type, source, destination, target) {
    if (target === destination || target === source) return g.zero;
    const df = file(target) - file(destination), dr = rank(target) - rank(destination);
    const af = Math.abs(df), ar = Math.abs(dr);
    const leaper = type === 0 ? af === 1 && dr === 1 : type === 1 ? (af === 1 && ar === 2) || (af === 2 && ar === 1) : type === 5 ? Math.max(af, ar) === 1 : false;
    if (type === 0 || type === 1 || type === 5) return leaper ? piece(0, type, source) : g.zero;
    const diagonal = af === ar && af > 0;
    const straight = df === 0 || dr === 0;
    if (!(type === 2 ? diagonal : type === 3 ? straight : diagonal || straight)) return g.zero;
    const blockers = [];
    for (let f = file(destination) + Math.sign(df), r = rank(destination) + Math.sign(dr); f !== file(target) || r !== rank(target); f += Math.sign(df), r += Math.sign(dr)) {
      const square = r * 8 + f;
      if (square !== source) blockers.push([c.occupancy[square], -1]);
    }
    return g.node([[piece(0, type, source), 1], ...blockers]);
  }
  const shieldCache = new Map();
  function shields(from, to) {
    const all = [];
    // Opposing ray pairs: a friendly piece behind the departing blocker.
    for (let d = 0; d < directions.length; d++) {
      const forward = rayFrom[from][d], backward = rayFrom[from][d ^ 1];
      for (let i = 0; i < forward.length; i++) {
        const attacker = forward[i];
        for (let j = 0; j < backward.length; j++) {
          const target = backward[j];
          const line = forward.slice(0, i).concat(backward.slice(0, j));
          if (attacker === to || target === to || line.includes(to)) continue;
          const key = `${from}:${attacker}:${target}`;
          if (!shieldCache.has(key)) {
            const lineAttackers = d < 4 ? [3, 4] : [2, 4];
            const attackerTerms = lineAttackers.map(t => [piece(1, t, attacker), 1]);
            const ownSource = Array.from({ length: 6 }, (_, t) => [piece(0, t, from), 1]);
            const penalties = [];
            for (const type of [1, 2, 3, 4]) {
              const node = g.node([...attackerTerms, ...ownSource, [piece(0, type, target), 1], ...line.map(sq => [c.occupancy[sq], -1])], -2);
              penalties.push([node, -VALUES[type] * 0.85]);
            }
            shieldCache.set(key, penalties);
          }
          all.push(...shieldCache.get(key));
        }
      }
    }
    return all;
  }
  return (from, to, types, danger, support) => {
    const terms = light ? [] : shields(from, to);
    const safe = g.any([g.node([[danger.all, -1]], 1), g.and(support.all, danger.tiers[4])]);
    for (const type of types) {
      if (type === 5) continue;
      if (light && type !== 0 && type !== 1) continue;
      const hits = [];
      for (let target = 0; target < 64; target++) {
        const attack = movedAttack(type, from, to, target);
        if (attack === g.zero) continue;
        const oldAttack = movedAttack(type, from, from, target);
        const novel = g.node([[attack, 1], [oldAttack, -1]]);
        const valuable = [];
        for (let enemyType = 0; enemyType < 6; enemyType++) {
          const hit = g.and(novel, piece(1, enemyType, target), safe);
          if (enemyType === 5) {
            terms.push([hit, 0.32]);
            valuable.push(hit);
            const protectedCheck = g.and(hit, support.all);
            terms.push([protectedCheck, 0.22]);
            if (type === 4 && Math.max(Math.abs(file(to) - file(target)), Math.abs(rank(to) - rank(target))) === 1) {
              terms.push([protectedCheck, 1.7]);
            }
            // A checking line against a pawn-boxed back-rank king, not a mate oracle.
            if (rank(target) === 7 && (type === 3 || type === 4)) {
              const box = [target - 8];
              if (file(target) > 0) box.push(target - 9);
              if (file(target) < 7) box.push(target - 7);
              terms.push([g.and(hit, ...box.map(sq => piece(1, 0, sq))), 2.4]);
            }
          } else {
            terms.push([hit, VALUES[enemyType] * 0.105]);
            if (enemyType > 0) valuable.push(hit);
          }
        }
        hits.push(g.any(valuable));
        // A new defender of an otherwise loose, currently attacked friendly piece.
        const ownDanger = c.attacks(1, target).all;
        const ownSupport = c.attacks(0, target).all;
        const newDefense = g.node([[novel, 1], [ownDanger, 1], [ownSupport, -1]], -1);
        for (let ownType = 1; ownType < 5; ownType++) terms.push([g.and(newDefense, piece(0, ownType, target)), VALUES[ownType] * 0.2]);
      }
      terms.push([g.node(hits.map(node => [node, 1]), -1), 0.65]);
      if (type === 0) {
        const hostilePawns = [];
        for (let f = Math.max(0, file(to) - 1); f <= Math.min(7, file(to) + 1); f++) {
          for (let r = rank(to) + 1; r < 8; r++) hostilePawns.push([piece(1, 0, r * 8 + f), -1]);
        }
        terms.push([g.node([[piece(0, 0, from), 1], ...hostilePawns]), Math.max(0, rank(to) - 2) ** 2 * 0.035]);
        if (rank(from) === 1) {
          for (const king of [2, 6]) if (Math.abs(file(from) - file(king)) <= 1) terms.push([g.and(piece(0, 0, from), piece(0, 5, king)), -0.26]);
        }
      }
    }
    return terms;
  };
}

// Astra's directly authored revision: phase-gated king activity and rook files.
// Every condition expands to affine/ReLU nodes over raw one-hot board inputs.
function astraStrategicCircuits(g) {
  const enemyMajors = [];
  for (let sq = 0; sq < 64; sq++) for (const type of [3, 4]) enemyMajors.push([piece(1, type, sq), -1]);
  const kingActive = g.node(enemyMajors, 1);
  const semiOpen = [], open = [];
  for (let f = 0; f < 8; f++) {
    const ownPawns = Array.from({length: 8}, (_, r) => [piece(0, 0, r * 8 + f), -1]);
    const enemyPawns = Array.from({length: 8}, (_, r) => [piece(1, 0, r * 8 + f), -1]);
    semiOpen.push(g.node(ownPawns, 1));
    open.push(g.node([...ownPawns, ...enemyPawns], 1));
  }
  const centrality = sq => 7 - Math.abs(file(sq) - 3.5) - Math.abs(rank(sq) - 3.5);
  const distance = (a, b) => Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));
  return (from, to, types) => {
    const terms = [];
    if (types.includes(5)) {
      const activeKing = g.and(piece(0, 5, from), kingActive);
      // Undo the middlegame home-rank preference only when enemy majors are absent.
      terms.push([activeKing, 0.09 * (rank(to) - rank(from)) + 0.22 * (centrality(to) - centrality(from))]);
      for (let target = 0; target < 64; target++) {
        const gain = distance(from, target) - distance(to, target);
        if (gain) terms.push([g.and(activeKing, piece(1, 5, target)), 0.12 * gain]);
      }
    }
    if (types.includes(3) && file(from) !== file(to)) {
      const rook = piece(0, 3, from);
      for (const [squares, weight] of [[semiOpen, 0.18], [open, 0.30]]) {
        terms.push([g.and(rook, squares[file(to)]), weight], [g.and(rook, squares[file(from)]), -weight]);
      }
    }
    return terms;
  };
}

function compact(nodes, outputs) {
  const seen = new Uint8Array(nodes.length);
  const stack = [...new Set(outputs)];
  while (stack.length) {
    const index = stack.pop() - 768;
    if (index < 0 || seen[index]) continue;
    seen[index] = 1;
    for (const [source] of nodes[index].edges) stack.push(source);
  }
  const remap = new Uint32Array(768 + nodes.length);
  for (let i = 0; i < 768; i++) remap[i] = i;
  const kept = [];
  for (let n = 0; n < nodes.length; n++) {
    if (!seen[n]) continue;
    remap[n + 768] = 768 + kept.length;
    const node = nodes[n];
    kept.push({ ...node, edges: node.edges.map(([source, weight]) => [remap[source], weight]) });
  }
  return { nodes: kept, outputs: outputs.map(index => remap[index]) };
}

export function compileModel(id) {
  if (!MODEL_IDS.includes(id)) throw new Error(`Unknown model ${id}`);
  const plus = id.endsWith('-plus'), baseId = id.replace('-plus', '');
  const g = new Graph();
  const c = makeCircuits(g);
  const extra = baseId === 'atlas' ? atlasCircuits(g, c) : plus ? atlasCircuits(g, c, true) : null;
  const strategy = astraStrategicCircuits(g);
  const endings = plus ? buildKingEndgames(g) : null;
  const outputs = Array(64 * 64 * 5).fill(g.zero);
  const homeMinors = g.node([1, 6].map(sq => [piece(0, 1, sq), 1]).concat([2, 5].map(sq => [piece(0, 2, sq), 1])), 0, 0);
  for (let from = 0; from < 64; from++) {
    const currentEnemy = c.attacks(1, from);
    const currentSupport = c.attacks(0, from);
    for (let to = 0; to < 64; to++) {
      const types = geometry(from, to);
      if (!types.length) continue;
      const danger = c.attacks(1, to, from);
      const support = c.attacks(0, to, from);
      const terms = VALUES.slice(0, 5).map((v, t) => [piece(1, t, to), v]);
      if (rank(from) === 4 && rank(to) === 5 && Math.abs(file(to) - file(from)) === 1) {
        terms.push([g.node([[piece(0, 0, from), 1], [piece(1, 0, to - 8), 1], [c.occupancy[to], -1]], -1), 1]);
      }
      for (const type of types) {
        const mover = piece(0, type, from);
        let position = positional(type, to) - positional(type, from);
        if (type === 0 && file(from) === file(to) && (file(to) === 3 || file(to) === 4)) position += 0.16;
        if (type === 5 && from === 4 && (to === 2 || to === 6)) position += 0.72;
        terms.push([mover, position]);
        if (type === 4 && rank(to) > 0) {
          // homeMinors is an integer 0..4; gate it with this particular queen.
          terms.push([g.node([[homeMinors, 1], [mover, 4]], -4), -0.13]);
        }
        if (type !== 5) {
          terms.push(...c.riskTerms(mover, VALUES[type], danger, support, 1.18));
          terms.push(...c.riskTerms(mover, VALUES[type], currentEnemy, currentSupport, -1.1));
        }
      }
      if (extra) terms.push(...extra(from, to, types, danger, support));
      terms.push(...strategy(from, to, types));
      if (endings) terms.push(...endings(from, to, types));
      const base = g.node(terms, 0, 0);
      outputs[(from * 64 + to) * 5] = base;
      if (rank(from) === 6 && rank(to) === 7 && Math.abs(file(to) - file(from)) <= 1) {
        for (let promotion = 1; promotion <= 4; promotion++) {
          const promotionType = [0, 4, 3, 2, 1][promotion];
          const mover = piece(0, 0, from);
          const promoted = [...terms, [mover, VALUES[promotionType] - 1]];
          promoted.push(...c.riskTerms(mover, 1, danger, support, -1.18));
          promoted.push(...c.riskTerms(mover, VALUES[promotionType], danger, support, 1.18));
          outputs[(from * 64 + to) * 5 + promotion] = g.node(promoted, 0, 0);
        }
      }
    }
  }
  const graph = compact(g.nodes, outputs);
  return encodeModel({ inputCount: 768, ...graph, metadata: {
    id, name: (baseId === 'pocket' ? 'Astra Pocket' : 'Astra Atlas') + (plus ? '+' : ''),
    input: '12x64 own/enemy pnbrqk; a1=0; black rank-reflected',
    output: '(from*64+to)*5 + [none,q,r,b,n]',
    authored: true, trained: false, search: false,
    circuitVersion: plus ? 3 : 2,
    authorship: plus ? 'Astra-authored expansion of Astra-directed, Sol-assisted base' : 'Astra-directed, Sol-assisted; Astra strategic revision',
  } });
}

/** Serialize the full topology and numerical tensors, not just heuristic constants. */
export function encodeModel({ inputCount, nodes, outputs, metadata }) {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const paddedMetadata = Math.ceil(metadataBytes.length / 4) * 4;
  const edgeCount = nodes.reduce((sum, node) => sum + node.edges.length, 0);
  const payloadBytes = paddedMetadata + 4 * (nodes.length * 3 + 1 + edgeCount * 2 + outputs.length);
  const bytes = new Uint8Array(40 + payloadBytes);
  bytes.set(new TextEncoder().encode('ASTRANN1'));
  const view = new DataView(bytes.buffer);
  [1, inputCount, nodes.length, edgeCount, outputs.length, metadataBytes.length, payloadBytes, 0]
    .forEach((value, i) => view.setUint32(8 + i * 4, value, true));
  bytes.set(metadataBytes, 40);
  let offset = 40 + paddedMetadata;
  const uint = value => { view.setUint32(offset, value, true); offset += 4; };
  const float = value => { view.setFloat32(offset, value, true); offset += 4; };
  let edges = 0;
  uint(0);
  for (const node of nodes) { edges += node.edges.length; uint(edges); }
  for (const node of nodes) float(node.bias);
  for (const node of nodes) uint(node.activation);
  for (const node of nodes) for (const [source] of node.edges) uint(source);
  for (const node of nodes) for (const [, weight] of node.edges) float(weight);
  for (const output of outputs) uint(output);
  view.setUint32(36, checksum(bytes.subarray(40)), true);
  return bytes;
}

export const LIMITATIONS = [
  'Authored neural heuristics, not learned weights; grandmaster strength and any Elo are not established.',
  'No game-tree search, successor-position scoring, rollout, opening book, tablebase or pretrained network.',
  'Static attack circuits are pseudo-attacks: pins, overloaded defenders and multi-recapture sequences are not solved.',
  'General check patterns are not mate proofs. Only Plus models encode explicit terminal tests in gated KQK/KRK positions; general stalemate avoidance is absent.',
  'Raw input omits history, castling rights, en-passant rights and move counters; those affect only legal/game-end masking.',
  'En-passant material is encoded, but secondary opened lines after removing the captured pawn are not fully modeled.',
  'Promotion material and destination safety are encoded; Atlas threat circuits still use the pre-promotion pawn attack shape.',
  'Atlas adds tactical relationships; greater size is not evidence of greater playing strength.',
];

export function compileAll() {
  const directory = new URL('../public/models/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  const models = [];
  for (const id of MODEL_IDS) {
    const bytes = compileModel(id);
    const model = parseModel(bytes.buffer);
    const tensorBytes = 4 * (model.nodeCount + model.edgeCount);
    const topologyBytes = 4 * (model.nodeCount * 2 + 1 + model.edgeCount + model.outputCount);
    const features = ['pawn/knight/king attacks', 'blocked bishop/rook/queen rays', 'origin-vacating destination risk', 'approximate defended exchanges', 'hanging-piece escape', 'capture/en-passant reward', 'promotion material', 'development/centralization/castling', 'Astra phase-gated king activity', 'Astra open and semi-open rook files'];
    if (id.startsWith('atlas')) features.push('new threats and checking forks', 'vacated shields of valuable pieces', 'defense of loose attacked pieces', 'protected queen checks', 'pawn-boxed back-rank checks', 'passed-pawn advance', 'castled pawn shield');
    if (id === 'pocket-plus') features.push('pawn and knight threats/checking forks', 'pawn and knight defense of loose pieces', 'passed-pawn advance');
    if (id.endsWith('-plus')) features.push('Astra KQK/KRK mate and stalemate circuits', 'gated enemy king mobility reduction');
    const entry = {
      id, name: model.metadata.name, file: `${id}.bin`, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      parameters: model.nodeCount + model.edgeCount,
      neurons: model.nodeCount,
      reluNeurons: model.activations.reduce((a, b) => a + b, 0),
      affineNeurons: model.activations.reduce((a, b) => a + (b === 0 ? 1 : 0), 0),
      sparseEdges: model.edgeCount, inputs: model.inputCount, outputs: model.outputCount,
      tensorBytes, topologyBytes, headerMetadataBytes: bytes.length - tensorBytes - topologyBytes,
      forwardWorkingBytes: 8 * (model.inputCount + model.nodeCount + model.outputCount),
      description: id.endsWith('-plus') ? 'Expanded authored circuits with a three-man endgame specialist; compare measured results.' : 'Original v0.1 comparison model; preserved weights.',
      features,
    };
    writeFileSync(new URL(entry.file, directory), bytes);
    models.push(entry);
    console.log(JSON.stringify(entry));
  }
  const manifest = {
    formatVersion: 1,
    provenance: 'Original directly authored deterministic sparse affine/ReLU circuits: Astra-directed, Sol-assisted implementation; Astra personally authored the strategic revision. Numerical weights and topology are compiled from tools/compile-models.mjs; no training, fitted labels, pretrained assets or imported engine policy. Reproduce with node tools/compile-models.mjs. This is not an exclusively single-model authorship experiment.',
    parameterDefinition: 'Every stored edge weight plus every neuron bias, including zero biases. Topology storage is included separately and in total file bytes.',
    limitations: LIMITATIONS,
    models,
  };
  writeFileSync(new URL('manifest.json', directory), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) compileAll();
