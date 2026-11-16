import { describe, expect, it } from "vitest";
import { readBodyCapped } from "../../src/lib/http";

const streamOf = (...chunks: number[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const size of chunks) controller.enqueue(new Uint8Array(size).fill(7));
        controller.close();
      },
    }),
  );

describe("readBodyCapped", () => {
  it("returns the full body when within the cap", async () => {
    const bytes = await readBodyCapped(streamOf(3, 4), 10);
    expect(bytes).toEqual(new Uint8Array(7).fill(7));
  });

  it("rejects an oversized Content-Length without reading the body", async () => {
    const res = new Response("tiny", { headers: { "Content-Length": "999999" } });
    expect(await readBodyCapped(res, 10)).toBeNull();
  });

  it("rejects a body that exceeds the cap while streaming (no Content-Length)", async () => {
    expect(await readBodyCapped(streamOf(6, 6), 10)).toBeNull();
  });
});
