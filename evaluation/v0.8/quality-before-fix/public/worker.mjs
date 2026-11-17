// The UI terminates this worker on every generation change. Load versions also
// protect callers that switch profiles without replacing the worker.
let model = null;
let chooseMove = null;
let loadVersion = 0;
let controller = null;
let opening = null;
let bookConfig = null;
let chooseBookMove = null;
let random = null;
const base = new URL('./models/', import.meta.url);
const booksBase = new URL('./books/', import.meta.url);
const compiledBooks = new Map();

async function fetchChecked(url, signal, kind = 'model') {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not fetch ${kind} resource (HTTP ${response.status}).`);
  return response;
}
function bookEntry(registry, id) {
  if (registry?.version !== 1 || registry.default !== 'eco' || !Array.isArray(registry.books) || !registry.books.length) throw new Error('Invalid opening-book registry.');
  const ids = new Set();
  for (const entry of registry.books) {
    if (!entry || typeof entry.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(entry.id) || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim()) throw new Error('Invalid opening-book registry entry.');
    ids.add(entry.id);
    if (entry.id === 'eco' ? entry.file !== '../openings.json' : typeof entry.file !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(entry.file)) throw new Error('Invalid opening-book asset path.');
    if (entry.sha256 !== undefined && (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw new Error('Invalid opening-book SHA256.');
  }
  if (!ids.has('eco')) throw new Error('Opening-book registry is missing ECO.');
  const entry = registry.books.find(entry => entry.id === id);
  if (!entry) throw new Error(`Unknown opening-book source: ${id}.`);
  return entry;
}
async function loadBook(config, signal) {
  const source = config.source ?? 'eco';
  if (typeof source !== 'string' || !/^[a-z][a-z0-9-]*$/.test(source)) throw new Error('Invalid opening-book source identifier.');
  const registry = await (await fetchChecked(new URL('manifest.json', booksBase), signal, 'opening-book registry')).json();
  const entry = bookEntry(registry, source);
  if (!config.enabled) return { book: null, sha256: entry.sha256 || '' };
  // A module cache handles repeated loads. CacheStorage survives the UI's worker
  // termination between games: only our strictly validated runtime map is stored.
  const declaredKey = entry.sha256 && `${source}:${entry.sha256}`;
  if (declaredKey && compiledBooks.has(declaredKey)) return compiledBooks.get(declaredKey);
  const bytes = await (await fetchChecked(new URL(entry.file, booksBase), signal, 'opening-book')).arrayBuffer();
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  if (entry.sha256 && sha256 !== entry.sha256) throw new Error(`Opening-book SHA256 mismatch for ${source}.`);
  const key = `${source}:${sha256}`;
  if (compiledBooks.has(key)) return compiledBooks.get(key);
  let cache = null;
  const cacheURL = new URL(`.validated-v8-${source}-${sha256}.json`, booksBase).href;
  try { cache = await globalThis.caches?.open('chess-lab-validated-books-v8'); } catch { /* Private mode may disable local caches. */ }
  let book;
  try {
    const cached = await cache?.match(cacheURL);
    if (cached) {
      const text = await cached.text();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
      if (cached.headers.get('X-Chess-Compiled-SHA256') === digest) book = JSON.parse(text);
    }
  } catch { /* A broken or old unchecked cache is rebuilt from source. */ }
  if (!book || !Number.isInteger(book.maxPlies) || !book.positions || typeof book.positions !== 'object') {
    const { validateOpeningBook } = await import('./src/book-sources.mjs');
    try { book = validateOpeningBook(JSON.parse(new TextDecoder().decode(bytes))); }
    catch (error) { throw new Error(`Invalid opening-book ${source}: ${error.message}`); }
    try {
      const text = JSON.stringify(book);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
      await cache?.put(cacheURL, new Response(text, {headers:{'Content-Type':'application/json','X-Chess-Compiled-SHA256':digest}}));
    } catch { /* Cache failure must not prevent offline asset play. */ }
  }
  const result = {book, sha256};
  compiledBooks.set(key, result);
  return result;
}
async function load(modelId, config = {}) {
  if (typeof modelId !== 'string' || !/^[a-z][a-z0-9-]*$/.test(modelId)) throw new Error('Invalid model identifier.');
  const version = ++loadVersion;
  model = null; opening = null; bookConfig = null;
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal;
  const manifest = await (await fetchChecked(new URL('manifest.json', base), signal)).json();
  const metadata = manifest.models?.find((entry) => entry.id === modelId);
  if (!metadata || typeof metadata.file !== 'string') throw new Error('Selected model is not listed in the manifest.');
  const resources = await import('./src/model-resource.mjs');
  const url = resources.modelResourceURL(metadata, base);
  const buffer = await (await fetchChecked(url, signal)).arrayBuffer();
  await resources.verifyModelBuffer(buffer, metadata);
  // Imports are part of loading, not timed inference or the first turn.
  let parsed, select;
  if (metadata.runtime === 'onnx') {
    const transformer = await import('./src/transformer.mjs');
    parsed = await transformer.loadTransformer(buffer, metadata);
    select = transformer.chooseTransformerMove;
  } else {
    const [network, engine] = await Promise.all([import('./src/network.mjs'), import('./src/engine.mjs')]);
    parsed = network.parseModel(buffer); select = engine.chooseMove;
  }
  const bookModule = await import('./src/opening-book.mjs');
  const nextConfig = { enabled: config.enabled !== false, source: config.source ?? 'eco', seed: String(config.seed ?? crypto.randomUUID()) };
  const selected = await loadBook(nextConfig, signal);
  if (version !== loadVersion) throw new Error('Model load superseded.');
  model = parsed; chooseMove = select;
  opening = selected.book; bookConfig = {...nextConfig, sha256:selected.sha256};
  chooseBookMove = bookModule.chooseBookMove; random = bookModule.seededRandom(nextConfig.seed);
  return {metadata, bookSource:nextConfig.source, bookSHA256:selected.sha256};
}
self.onmessage = async ({ data }) => {
  const id = data?.id;
  try {
    if (!data || typeof id !== 'string' || id.length > 128) throw new Error('Invalid request identifier.');
    if (data.type === 'load') {
      const loaded = await load(data.modelId, data.book);
      self.postMessage({ type: 'loaded', id, modelId: data.modelId, ...loaded });
    } else if (data.type === 'move') {
      if (!model || !chooseMove) throw new Error('No model loaded. Load a policy before requesting a move.');
      if (typeof data.fen !== 'string' || data.fen.length > 256) throw new Error('Invalid position.');
      const version = loadVersion;
      const config = bookConfig;
      const result = chooseBookMove(data.fen, opening, {random,enabled:config.enabled}) || {...await chooseMove(data.fen, model, data.history),source:'policy'};
      if (version !== loadVersion) throw new Error('Move superseded.');
      self.postMessage({ type: 'move', id, ...result, seed:config.seed, book:config.enabled, bookSource:config.source, bookSHA256:config.sha256 });
    } else throw new Error('Unknown worker request type.');
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error instanceof Error ? error.message : String(error) });
  }
};
