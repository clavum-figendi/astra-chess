#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { parseModel } from '../src/network.mjs';
import { chooseMove } from '../src/engine.mjs';
import { createProtocol } from './protocol.mjs';
import { chooseBookMove, seededRandom } from '../src/opening-book.mjs';
import { randomBytes } from 'node:crypto';
import { resolveModel } from './model-selection.mjs';

const args = process.argv.slice(2);
const modelDirectory = existsSync(new URL('../models/manifest.json', import.meta.url)) ? new URL('../models/', import.meta.url) : new URL('../public/models/', import.meta.url);
if (args.includes('--list-models')) {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', modelDirectory), 'utf8'));
  const sizing = JSON.parse(readFileSync(new URL('sizing-proposals.json', modelDirectory), 'utf8'));
  console.log(JSON.stringify({models: manifest.models.map(m=>({...m,name:m.name.replace(/\b(?:Astra|Sol)\b[\s·:—/-]*/gi,'').trim()})),  proposals: sizing.proposals, memoryEstimate: sizing.memoryEstimate}, null, 2));
  process.exit(0);
}
const modelAt = args.indexOf('--model');
const modelId = modelAt >= 0 ? args[modelAt + 1] : 'atlas';
let metadata;
try { metadata = resolveModel(JSON.parse(readFileSync(new URL('manifest.json',modelDirectory),'utf8')).models,modelId); }
catch (error) { console.error(error.message); process.exit(1); }
const bytes = readFileSync(new URL(metadata.file,modelDirectory));
const model = parseModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const bookEnabled = args.lastIndexOf('--no-book') < args.lastIndexOf('--book') || !args.includes('--no-book');
const seedAt = args.indexOf('--seed');
if (seedAt >= 0 && (!args[seedAt+1] || args[seedAt+1].startsWith('--'))) throw new Error('--seed requires a value');
let seed, random;
function resetSeed() {
  seed = seedAt >= 0 ? args[seedAt+1] : randomBytes(16).toString('hex');
  random = seededRandom(seed);
}
resetSeed();
const bookPath = existsSync(new URL('../openings.json',import.meta.url)) ? new URL('../openings.json',import.meta.url) : new URL('../public/openings.json',import.meta.url);
const book = bookEnabled ? JSON.parse(readFileSync(bookPath,'utf8')) : null;
function select(fen) {
  const reply = chooseBookMove(fen,book,{random,enabled:bookEnabled}) || {...chooseMove(fen,model),source:'policy'};
  return {...reply,seed,book:bookEnabled};
}
const fenAt = args.indexOf('--fen');
if (fenAt >= 0) {
  if (!args[fenAt + 1]) throw new Error('--fen requires a quoted FEN');
  console.log(JSON.stringify(select(args[fenAt + 1]), null, 2));
} else {
  const protocol = createProtocol({ send: line => console.log(line), select, onNewGame: resetSeed });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => { if (line.trim() === 'quit') { input.close(); process.stdin.destroy(); } else protocol(line); });
}
