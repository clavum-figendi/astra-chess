// The UI terminates this worker on every generation change. Load versions also
// protect callers that switch policies without replacing the worker.
let model = null;
let chooseMove = null;
let loadVersion = 0;
let controller = null;
const base = new URL('./models/', import.meta.url);

async function fetchChecked(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not fetch model resource (HTTP ${response.status}).`);
  return response;
}
async function load(modelId) {
  if (typeof modelId !== 'string' || !/^[a-z][a-z0-9-]*$/.test(modelId)) throw new Error('Invalid model identifier.');
  const version = ++loadVersion;
  model = null;
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal;
  const manifest = await (await fetchChecked(new URL('manifest.json', base), signal)).json();
  const metadata = manifest.models?.find((entry) => entry.id === modelId);
  if (!metadata || typeof metadata.file !== 'string') throw new Error('Selected model is not listed in the manifest.');
  const url = new URL(metadata.file, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || !url.pathname.endsWith('.bin')) throw new Error('Invalid model artifact path.');
  const buffer = await (await fetchChecked(url, signal)).arrayBuffer();
  if (Number.isFinite(metadata.bytes) && buffer.byteLength !== metadata.bytes) throw new Error('Model size does not match its manifest.');
  // Imports are part of loading, not timed inference or the first turn.
  const [network, engine] = await Promise.all([import('./src/network.mjs'), import('./src/engine.mjs')]);
  const parsed = network.parseModel(buffer);
  if (version !== loadVersion) throw new Error('Model load superseded.');
  model = parsed; chooseMove = engine.chooseMove;
  return metadata;
}
self.onmessage = async ({ data }) => {
  const id = data?.id;
  try {
    if (!data || typeof id !== 'string' || id.length > 128) throw new Error('Invalid request identifier.');
    if (data.type === 'load') {
      const metadata = await load(data.modelId);
      self.postMessage({ type: 'loaded', id, modelId: data.modelId, metadata });
    } else if (data.type === 'move') {
      if (!model || !chooseMove) throw new Error('No model loaded. Load a policy before requesting a move.');
      if (typeof data.fen !== 'string' || data.fen.length > 256) throw new Error('Invalid position.');
      const result = chooseMove(data.fen, model);
      self.postMessage({ type: 'move', id, ...result });
    } else throw new Error('Unknown worker request type.');
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error instanceof Error ? error.message : String(error) });
  }
};
