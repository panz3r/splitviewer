import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/index";

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
		// takedowns/privacy go to the private channel, never public issues
		expect(text).toContain("github.com/panz3r/splitviewer/security/advisories/new");
	});

	it("sends security headers (CSP without inline scripts, no framing, no referrer)", async () => {
		const request = new IncomingRequest("https://example.com/");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const csp = response.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("script-src 'self';");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
		expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=");
	});

	it("self-hosts fonts: no third-party font CDN in pages or CSP", async () => {
		const fetchPath = async (path: string) => {
			const ctx = createExecutionContext();
			const response = await worker.fetch(new IncomingRequest(`https://example.com${path}`), env, ctx);
			await waitOnExecutionContext(ctx);
			return response;
		};
		const home = await fetchPath("/");
		const html = await home.text();
		expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
		expect(html).toContain("/fonts/lato-latin-400-normal.woff2");
		expect(home.headers.get("Content-Security-Policy")).not.toContain("fonts.g");

		const font = await fetchPath("/fonts/lato-latin-400-normal.woff2");
		expect(font.status).toBe(200);
		expect(font.headers.get("Content-Type")).toBe("font/woff2");
		const magic = new TextDecoder().decode(new Uint8Array(await font.arrayBuffer()).slice(0, 4));
		expect(magic).toBe("wOF2");

		expect((await fetchPath("/fonts/constructor")).status).toBe(404);
	});

	it("serves the dashboard share script as a same-origin asset", async () => {
		const request = new IncomingRequest("https://example.com/share.js");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("javascript");
		expect(await response.text()).toContain("data-share");
	});

	it("report links follow the REPO_URL var (self-hosted forks report to their own tracker)", async () => {
		const request = new IncomingRequest("http://example.com/support");
		const ctx = createExecutionContext();
		const forkEnv = { ...env, REPO_URL: "https://github.com/acme/splitviewer" };
		const response = await worker.fetch(request, forkEnv, ctx);
		await waitOnExecutionContext(ctx);
		const text = await response.text();
		expect(text).toContain("https://github.com/acme/splitviewer/issues/new?template=report.yml");
		expect(text).toContain("https://github.com/acme/splitviewer/issues");
		expect(text).not.toContain("github.com/panz3r/splitviewer");
	});

	describe("icon assets", () => {
		it("GET /icon.svg serves the favicon SVG", async () => {
			const request = new IncomingRequest("http://example.com/icon.svg");
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
			const body = await response.text();
			expect(body).toContain("<svg");
			expect(body).toContain('id="icon-shape"');
		});

		it("GET /favicon.ico redirects to /icon.svg", async () => {
			const request = new IncomingRequest("http://example.com/favicon.ico");
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe("/icon.svg");
		});

		it("GET /apple-touch-icon.png serves the generated 180px PNG", async () => {
			const request = new IncomingRequest("http://example.com/apple-touch-icon.png");
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("image/png");
			const bytes = new Uint8Array(await response.arrayBuffer());
			expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			// full-bleed 180x180 (no rounded corners): iOS masks it itself
			expect(bytes.length).toBeGreaterThan(1_000);
		});

		it("pages embed the favicon links and the inline logo", async () => {
			const request = new IncomingRequest("http://example.com/");
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			const text = await response.text();
			expect(text).toContain('rel="icon" type="image/svg+xml" href="/icon.svg"');
			expect(text).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
			// header logo: inline SVG with the icon artwork, legacy ⇄ leaf gone
			expect(text).toContain('class="logo-icon"');
			expect(text).toContain('id="icon-shape"');
			expect(text).not.toContain("class=\"leaf\"");
		});
	});

	it("GET /example-card.png returns a PNG with no-store (random per request)", async () => {		const req = () => {
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
	}, 15_000); // two OG renders; the 5s default flakes under load

	it("GET /it renders the Italian homepage", async () => {
		const request = new IncomingRequest("http://example.com/it");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('lang="it"');
		expect(text).toContain("Come funziona");
		expect(text).toContain("Prima la privacy");
		expect(text).toContain("Continua con Splitwise");
		// toggle back to EN homepage: flag icon (no text label), aria in page
		// language + title with target language name
		expect(text).toContain('class="lang-toggle"');
		expect(text).toContain('href="/"');
		expect(text).toContain("Passa all"); // aria-label (apostrophe HTML-escaped)
		expect(text).toContain('title="English"');
		expect(text).toContain('viewBox="0 0 60 30"'); // Union Jack SVG
		expect(text).toContain('hreflang="en"');
		expect(text).toContain('hreflang="it"');
		expect(text).toContain('hreflang="x-default"');
		expect(text).toContain('href="http://example.com/it"');
	});

	it("GET /it redirects authenticated users to the IT dashboard (language-aware logo round-trip)", async () => {
		const { signSession } = await import("../../src/domain/sessionService");
		const cookie = `sw_session=${await signSession("it-user", env.SESSION_SECRET)}`;
		const request = new IncomingRequest("http://example.com/it", { headers: { Cookie: cookie } });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/it/dashboard");
	});

	it("GET /it/support renders the Italian FAQ", async () => {
		const request = new IncomingRequest("http://example.com/it/support");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('lang="it"');
		expect(text).toContain("FAQ");
		expect(text).toContain("Il mio gruppo è pubblico?");
		expect(text).toContain("la tua dashboard");
		expect(text).toContain("Segnala un problema");
		// hreflang alternates + toggle to EN support
		expect(text).toContain('href="/support"');
		expect(text).toContain('hreflang="it"');
	});
});
