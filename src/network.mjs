// Generic sparse, topologically ordered affine/ReLU graph runtime. No chess rules.
const MAGIC = 'ASTRANN1';
const HEADER_BYTES = 40;

export function checksum(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function parseModel(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new Error('Model must be an ArrayBuffer');
  if (buffer.byteLength < HEADER_BYTES) throw new Error('Truncated model header');
  const bytes = new Uint8Array(buffer);
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC) throw new Error('Invalid model magic');
  const view = new DataView(buffer);
  const fields = Array.from({ length: 8 }, (_, i) => view.getUint32(8 + i * 4, true));
  const [version, inputCount, nodeCount, edgeCount, outputCount, metadataLength, payloadBytes, crc] = fields;
  if (version !== 1) throw new Error('Unsupported model version');
  if (!inputCount || inputCount > 4096 || !nodeCount || nodeCount > 2_000_000 ||
      edgeCount > 20_000_000 || !outputCount || outputCount > 1_000_000 || metadataLength > 1_000_000) {
    throw new Error('Invalid model dimensions');
  }
  const paddedMetadata = Math.ceil(metadataLength / 4) * 4;
  const expected = paddedMetadata + 4 * (nodeCount + 1 + nodeCount * 2 + edgeCount * 2 + outputCount);
  if (payloadBytes !== expected || buffer.byteLength !== HEADER_BYTES + expected) throw new Error('Invalid model length');
  if (checksum(bytes.subarray(HEADER_BYTES)) !== crc) throw new Error('Model checksum mismatch');
  let metadata;
  try {
    metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(40, 40 + metadataLength)));
  } catch {
    throw new Error('Invalid model metadata');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Invalid model metadata object');
  let offset = HEADER_BYTES + paddedMetadata;
  // Reading via DataView makes the format portable to big-endian hosts, too.
  const array = (count, float = false) => {
    const result = float ? new Float32Array(count) : new Uint32Array(count);
    for (let i = 0; i < count; i++, offset += 4) result[i] = float ? view.getFloat32(offset, true) : view.getUint32(offset, true);
    return result;
  };
  const rowPtr = array(nodeCount + 1);
  const biases = array(nodeCount, true);
  const activations = array(nodeCount);
  const sources = array(edgeCount);
  const weights = array(edgeCount, true);
  const outputs = array(outputCount);
  if (rowPtr[0] !== 0 || rowPtr[nodeCount] !== edgeCount) throw new Error('Invalid sparse row boundaries');
  for (let n = 0; n < nodeCount; n++) {
    if (rowPtr[n] > rowPtr[n + 1] || rowPtr[n + 1] > edgeCount) throw new Error('Invalid sparse row order');
    if (!Number.isFinite(biases[n]) || activations[n] > 1) throw new Error('Invalid node coefficient or activation');
    for (let e = rowPtr[n]; e < rowPtr[n + 1]; e++) {
      if (sources[e] >= inputCount + n) throw new Error('Non-feed-forward model edge');
      if (!Number.isFinite(weights[e])) throw new Error('Non-finite model weight');
    }
  }
  for (const output of outputs) if (output >= inputCount + nodeCount) throw new Error('Invalid model output');
  return { inputCount, nodeCount, edgeCount, outputCount, rowPtr, biases, activations, sources, weights, outputs, metadata, bytes: buffer.byteLength };
}

export function forward(model, input) {
  if (input.length !== model.inputCount) throw new Error('Wrong network input length');
  const values = new Float64Array(model.inputCount + model.nodeCount);
  for (let i = 0; i < input.length; i++) {
    if (!Number.isFinite(input[i])) throw new Error('Network input must be finite');
    values[i] = input[i];
  }
  const { rowPtr, biases, activations, sources, weights, inputCount, nodeCount } = model;
  for (let n = 0; n < nodeCount; n++) {
    let sum = biases[n];
    for (let e = rowPtr[n]; e < rowPtr[n + 1]; e++) sum += values[sources[e]] * weights[e];
    values[inputCount + n] = activations[n] ? Math.max(0, sum) : sum;
  }
  return Float64Array.from(model.outputs, index => values[index]);
}
