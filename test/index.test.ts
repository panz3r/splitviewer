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
});
