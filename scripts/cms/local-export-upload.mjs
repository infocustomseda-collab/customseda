// R2's remote binding needs a body with a known length. This conversion is
// exclusively for the Node maintenance export, never for the deployed Worker.
export async function knownLengthUpload(options, maxBytes = 256 * 1024 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid upload byte limit.');
  if (!(options.body instanceof ReadableStream)) return options;
  const reader = options.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`Export upload exceeds ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { ...options, body: Buffer.concat(chunks, size) };
}
