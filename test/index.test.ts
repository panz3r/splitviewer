import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src";

// Minimal app smoke test (plan verification step 2, minus wrangler-dev)
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("src/index.ts", () => {
	it("GET / returns Hello Hono!", async () => {
		const request = new IncomingRequest("http://example.com/");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Hello Hono!");
	});
});
