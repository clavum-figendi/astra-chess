#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { parseModel } from '../src/network.mjs';
import { chooseMove } from '../src/engine.mjs';
import { createProtocol } from './protocol.mjs';
import { chooseBookMove, seededRandom } from '../src/opening-book.mjs';
import { validateOpeningBook } from '../src/book-sources.mjs';
import { randomBytes, createHash } from 'node:crypto';
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
const sourceAt = args.indexOf('--book-source');
if (sourceAt >= 0 && (!args[sourceAt+1] || args[sourceAt+1].startsWith('--'))) throw new Error('--book-source requires an identifier');
let bookSource = sourceAt >= 0 ? args[sourceAt+1] : 'eco';
const publicBase = existsSync(new URL('../models/manifest.json', import.meta.url)) ? new URL('../', import.meta.url) : new URL('../public/', import.meta.url);
const booksBase = new URL('./books/', publicBase);
let registry;
try { registry = JSON.parse(readFileSync(new URL('manifest.json', booksBase), 'utf8')); }
catch (error) {
  // Pure-policy legacy packages need no book assets. Never substitute a book
  // when an enabled or explicitly selected source cannot be loaded.
  if (error.code !== 'ENOENT' || bookEnabled || sourceAt >= 0) throw new Error(`Opening-book registry unavailable: ${error.message}`);
  registry = {version:1,default:'eco',books:[{id:'eco',name:'ECO repertoire',file:'../openings.json'}]};
}
if (registry?.version !== 1 || registry.default !== 'eco' || !Array.isArray(registry.books) || !registry.books.length) throw new Error('Invalid opening-book registry.');
const ids = new Set();
for (const entry of registry.books) {
  if (!entry || typeof entry.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(entry.id) || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim()) throw new Error('Invalid opening-book registry entry.');
  ids.add(entry.id);
  if (entry.id === 'eco' ? entry.file !== '../openings.json' : typeof entry.file !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(entry.file)) throw new Error('Invalid opening-book asset path.');
  if (entry.sha256 !== undefined && (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw new Error('Invalid opening-book SHA256.');
}
if (!ids.has('eco')) throw new Error('Opening-book registry is missing ECO.');
const compiledBooks = new Map();
function loadProfile(id) {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Invalid opening-book source identifier.');
  const entry = registry.books.find(entry => entry.id === id);
  if (!entry) throw new Error(`Unknown opening-book source: ${id}.`);
  if (!bookEnabled) return {book:null,sha256:entry.sha256 || ''};
  const declaredKey = entry.sha256 && `${id}:${entry.sha256}`;
  if (declaredKey && compiledBooks.has(declaredKey)) return compiledBooks.get(declaredKey);
  const bytes = readFileSync(new URL(entry.file, booksBase));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (entry.sha256 && sha256 !== entry.sha256) throw new Error(`Opening-book SHA256 mismatch for ${id}.`);
  const key = `${id}:${sha256}`;
  if (!compiledBooks.has(key)) {
    let book;
    try { book = validateOpeningBook(JSON.parse(bytes.toString('utf8'))); }
    catch (error) { throw new Error(`Invalid opening-book ${id}: ${error.message}`); }
    compiledBooks.set(key, {book,sha256});
  }
  return compiledBooks.get(key);
}
let profile = loadProfile(bookSource);
function select(fen) {
  if (!profile) throw new Error(`Opening-book source ${bookSource} is unavailable; select a valid BookSource.`);
  const reply = chooseBookMove(fen,profile.book,{random,enabled:bookEnabled}) || {...chooseMove(fen,model),source:'policy'};
  return {...reply,seed,book:bookEnabled,bookSource,bookSHA256:profile.sha256};
}
const fenAt = args.indexOf('--fen');
if (fenAt >= 0) {
  if (!args[fenAt + 1]) throw new Error('--fen requires a quoted FEN');
  console.log(JSON.stringify(select(args[fenAt + 1]), null, 2));
} else {
  const protocol = createProtocol({
    send: line => {
      if (line === 'uciok') console.log(`option name BookSource type combo default ${bookSource}${registry.books.map(entry=>` var ${entry.id}`).join('')}`);
      if (line.startsWith('info string source ')) line += ` bookSource ${bookSource} bookSHA256 ${profile?.sha256 || 'unavailable'}`;
      console.log(line);
    }, select, onNewGame: resetSeed,
  });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => {
    if (line.trim() === 'quit') { input.close(); process.stdin.destroy(); return; }
    const option = /^setoption\s+name\s+BookSource(?:\s+value(?:\s+(.*))?)?\s*$/i.exec(line.trim());
    if (option) {
      bookSource = option[1] || ''; profile = null;
      protocol('ucinewgame');
      try { profile = loadProfile(bookSource); }
      catch (error) { console.log(`info string error ${error.message.replace(/[\r\n]/g,' ')}`); }
      return;
    }
    protocol(line);
  });
}
