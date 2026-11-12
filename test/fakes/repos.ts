// In-memory test fakes for the repositories (unit tests). Plaintext storage by
// design — unit tests assert service logic, not the D1 crypto path (that's
// covered by infra/db.test.ts against real D1).
import { InMemoryUsersRepo } from "../../src/repositories/usersRepo";
import { InMemorySharesRepo } from "../../src/repositories/sharesRepo";
import { InMemoryCacheRepo } from "../../src/repositories/cacheRepo";

export { InMemoryUsersRepo, InMemorySharesRepo, InMemoryCacheRepo };

export function makeUsersRepo(): InMemoryUsersRepo {
  return new InMemoryUsersRepo();
}

export function makeSharesRepo(): InMemorySharesRepo {
  return new InMemorySharesRepo();
}

export function makeCacheRepo(): InMemoryCacheRepo {
  return new InMemoryCacheRepo();
}
