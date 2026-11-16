// Small fetch helpers for untrusted upstream bodies.

/**
 * Reads a response body into memory, giving up (null) as soon as it exceeds
 * `maxBytes` — whether announced via Content-Length or discovered while
 * streaming — so an oversized upstream asset can't exhaust Worker memory.
 */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    return null;
  }
  if (!res.body) return new Uint8Array(0);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
