// Repository factory: the single place where env bindings become repository
// instances. Controllers (or wiring helpers) call createRepos(env); tests call
// the InMemory constructors directly.
import { D1UsersRepo } from "./usersRepo";
import { D1SharesRepo } from "./sharesRepo";
import { D1CacheRepo } from "./cacheRepo";

export function createRepos(env: CloudflareBindings) {
  return {
    users: new D1UsersRepo(env),
    shares: new D1SharesRepo(env),
    cache: new D1CacheRepo(env),
  };
}

export type Repos = ReturnType<typeof createRepos>;
