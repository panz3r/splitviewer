import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
	// Read all migrations in the `migrations` directory and expose them to tests
	// via a test-only binding, so the setup file can apply them (pattern from
	// cloudflare/workers-sdk vitest-plugin d1 fixture).
	const migrationsPath = path.join(import.meta.dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	return defineConfig({
		plugins: [
			cloudflareTest({
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					// Test-only binding for migrations (not in wrangler.jsonc)
					bindings: { TEST_MIGRATIONS: migrations },
				},
			}),
		],
		test: {
			setupFiles: ["./test/apply-migrations.ts"],
		},
	});
});
