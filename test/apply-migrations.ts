import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Setup files run outside the per-test-file storage isolation and may be run
// multiple times; `applyD1Migrations()` only applies not-yet-applied migrations,
// so calling it here is safe.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
