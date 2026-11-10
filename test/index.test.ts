import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

// Landing page smoke test. Anonymous users get the marketing page;
// authenticated users get redirected to the dashboard (session cookie).
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("src/index.tsx", () => {
	it("GET / (anonymous) renders the landing page", async () => {
		const request = new IncomingRequest("http://example.com/");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain("SplitViewer");
		expect(text).toContain("/auth/login");
	});

	it("homepage renders hero, steps, privacy section and meta", async () => {
		const request = new IncomingRequest("http://example.com/");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const text = await response.text();
		expect(text).toContain("How it works");
		expect(text).toContain("Privacy first");
		expect(text).toContain("/example-card.png");
		expect(text).toContain("first names and last initials only");
		expect(text).toContain('name="description"');
	});

	it("GET /support renders FAQ and issue link", async () => {
		const request = new IncomingRequest("http://example.com/support");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain("FAQ");
		expect(text).toContain("takedown");
		expect(text).toContain("github.com/panz3r/splitviewer/issues");
	});

	it("GET /example-card.png returns a PNG with no-store (random per request)", async () => {
		const req = () => {
			const r = new IncomingRequest("http://example.com/example-card.png");
			const ctx = createExecutionContext();
			return worker.fetch(r, env, ctx).then(async (res) => {
				await waitOnExecutionContext(ctx);
				return res;
			});
		};
		const a = await req();
		expect(a.status).toBe(200);
		expect(a.headers.get("Cache-Control")).toBe("no-store");
		const aBytes = new Uint8Array(await a.arrayBuffer());
		expect(Array.from(aBytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

		const b = await req();
		const bBytes = new Uint8Array(await b.arrayBuffer());
		// randomized fake data (names/amounts/timestamp) ⇒ two cards must differ
		const differs =
			aBytes.length !== bBytes.length || aBytes.some((byte, i) => byte !== bBytes[i]);
		expect(differs).toBe(true);
		expect(aBytes.length).toBeGreaterThan(10_000);
		expect(bBytes.length).toBeGreaterThan(10_000);
	});
});
