export function modelResourceURL(metadata, base) {
  const extension = metadata.runtime === 'onnx' ? 'onnx' : metadata.runtime === undefined || metadata.runtime === 'sparse' ? 'bin' : null;
  if (!extension || typeof metadata.file !== 'string' || !new RegExp(`^[a-z][a-z0-9-]*\\.${extension}$`).test(metadata.file)) throw new Error('Invalid model artifact path or runtime.');
  const url = new URL(metadata.file, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('Unsafe model artifact path.');
  return url;
}
export async function verifyModelBuffer(buffer, metadata) {
  if (!Number.isSafeInteger(metadata.bytes) || buffer.byteLength !== metadata.bytes) throw new Error('Model size does not match its manifest.');
  if (!/^[a-f0-9]{64}$/.test(metadata.sha256 || '')) throw new Error('Missing model integrity digest.');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
  if (digest !== metadata.sha256) throw new Error('Model integrity check failed.');
}
