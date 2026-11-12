// Users persistence + token refresh. Since the MVC refactor, storage lives in
// repositories/usersRepo.ts and the refresh grant lives in
// domain/tokenService.ts; this module keeps the env-shaped convenience
// signatures the OAuth callback and refresh flow rely on.
import { createTokenService } from "../domain/tokenService";
import { createRepos } from "../repositories";
import { D1UsersRepo, type UpsertUserInput } from "../repositories/usersRepo";

export type { UpsertUserInput } from "../repositories/usersRepo";

export async function upsertUser(
  env: CloudflareBindings,
  input: UpsertUserInput,
): Promise<string> {
  return new D1UsersRepo(env).upsert(input);
}

/**
 * Attempts a refresh-token grant for the user. Returns true when the row was
 * updated with fresh credentials. Single-flighted per isolate+user.
 * (Env-shaped wrapper around domain/tokenService.createTokenService.)
 */
export async function refreshUserToken(
  env: CloudflareBindings,
  user: { id: string },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const { users } = createRepos(env);
  return createTokenService(
    {
      users,
      clientId: env.SPLITWISE_CLIENT_ID,
      clientSecret: env.SPLITWISE_CLIENT_SECRET,
      tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
    },
    fetchImpl,
  )(user);
}
