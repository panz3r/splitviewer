// Composition helpers (MVC refactor): env-bound wiring that turns Cloudflare
// bindings into domain services. Controllers call these — the domain layer
// itself never sees `env`. Keep every service instantiation choice here so
// there is exactly one place where env meets domain.
import { decrypt } from "./lib/crypto";
import { createHttpSplitwiseClient } from "./lib/splitwise";
import { refreshUserToken } from "./lib/users";
import { repoUrlFromEnv } from "./lib/links";
import { createRepos } from "./repositories";
import { createPublicViewService, type PublicViewDeps } from "./domain/publicViewService";
import { createShareService, SLUG_LENGTH } from "./domain/shareService";
import { nanoid } from "nanoid";

export { SLUG_LENGTH };

/** Resolved repo URL for in-app report/project links (REPO_URL var or upstream default). */
export function repoUrl(env: CloudflareBindings): string {
  return repoUrlFromEnv(env);
}

/** Decrypts a user's stored Splitwise access token for live API calls. */
export function decAccessToken(
  user: { encrypted_access_token: string },
  env: CloudflareBindings,
): Promise<string> {
  return decrypt(user.encrypted_access_token, env.TOKEN_ENCRYPTION_KEY);
}

export function publicViewDepsForEnv(
  env: CloudflareBindings,
  fetchImpl: typeof fetch = fetch,
): PublicViewDeps {
  const repos = createRepos(env);
  return {
    shares: repos.shares,
    cache: repos.cache,
    users: repos.users,
    decryptToken: (encrypted) => decrypt(encrypted, env.TOKEN_ENCRYPTION_KEY),
    refresh: (userId) => refreshUserToken(env, { id: userId }, fetchImpl),
    splitwise: createHttpSplitwiseClient(fetchImpl),
  };
}

/** Resolves the public view for a slug using real bindings. */
export function resolvePublicViewForEnv(
  env: CloudflareBindings,
  slug: string,
  fetchImpl: typeof fetch = fetch,
) {
  return createPublicViewService(publicViewDepsForEnv(env, fetchImpl))(slug);
}

export function shareServiceForEnv(env: CloudflareBindings) {
  const repos = createRepos(env);
  return createShareService({
    shares: repos.shares,
    cache: repos.cache,
    generateSlug: () => nanoid(SLUG_LENGTH),
  });
}
