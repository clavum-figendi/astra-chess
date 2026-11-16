import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

function workerHarness() {
  const url = new URL('../public/worker.mjs', import.meta.url).href;
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    globalThis.self = globalThis;
    globalThis.postMessage = (data) => parentPort.postMessage(data);
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    import(${JSON.stringify(url)}).then(() => {
      parentPort.on('message', data => self.onmessage({ data }));
      parentPort.postMessage({ ready: true });
    }).catch(error => { throw error; });
  `, { eval: true });
  const receive = () => new Promise((resolve, reject) => {
    worker.once('message', resolve); worker.once('error', reject);
  });
  return { worker, receive };
}

test('worker returns request-correlated errors without falling back, and survives subsequent requests', async () => {
  const { worker, receive } = workerHarness();
  try {
    assert.equal((await receive()).ready, true);
    for (const [request, error] of [
      [{ type: 'move', id: '1:1', fen: 'bad' }, /load|loaded/i],
      [{ type: 'unknown', id: '1:2' }, /unknown|unsupported/i],
      [{ type: 'load', id: '1:3', modelId: '../other' }, /invalid/i],
      [{ type: 'load', id: '1:4', modelId: 'pocket' }, /503/],
    ]) {
      const response = receive(); worker.postMessage(request);
      const answer = await response;
      assert.equal(answer.type, 'error'); assert.equal(answer.id, request.id);
      assert.match(answer.error, error);
    }
  } finally { await worker.terminate(); }
});
