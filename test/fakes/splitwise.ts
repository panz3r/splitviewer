// Fake SplitwiseClient for unit tests: canned responses, configurable per
// endpoint, with optional call recording. Implements the full interface so any
// structural slice (Pick<SplitwiseClient, ...>) accepts it.
import type {
  RawGroup,
  SplitwiseClient,
  SplitwiseGroup,
  SplitwiseUser,
  TokenResult,
} from "../../src/lib/splitwise";

export class FakeSplitwiseAuthError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("SplitwiseAuthError");
    this.name = "SplitwiseAuthError";
    this.status = status;
  }
}

export interface FakeSplitwiseConfig {
  tokenResult?: TokenResult;
  currentUser?: SplitwiseUser | Error;
  groups?: SplitwiseGroup[] | Error;
  group?: RawGroup | Error;
}

export class FakeSplitwiseClient implements SplitwiseClient {
  calls: Array<{ op: string; args: unknown[] }> = [];

  constructor(private readonly config: FakeSplitwiseConfig = {}) {}

  async exchangeCodeForToken(): Promise<TokenResult> {
    this.calls.push({ op: "exchangeCodeForToken", args: [] });
    return this.config.tokenResult ?? { accessToken: "fake-access", refreshToken: "", expiresAt: null };
  }

  async fetchCurrentUser(): Promise<SplitwiseUser> {
    this.calls.push({ op: "fetchCurrentUser", args: [] });
    const value = this.config.currentUser ?? { id: "fake-user-1", firstName: "Fake", lastName: "User" };
    if (value instanceof Error) throw value;
    return value;
  }

  async fetchGroups(): Promise<SplitwiseGroup[]> {
    this.calls.push({ op: "fetchGroups", args: [] });
    const value = this.config.groups ?? [];
    if (value instanceof Error) throw value;
    return value;
  }

  async fetchGroup(_accessToken: string, groupId: string): Promise<RawGroup> {
    this.calls.push({ op: "fetchGroup", args: [groupId] });
    const value = this.config.group;
    if (value instanceof Error) throw value;
    if (!value) throw new FakeSplitwiseAuthError(404);
    return value;
  }
}

export function makeSplitwiseClient(config?: FakeSplitwiseConfig): FakeSplitwiseClient {
  return new FakeSplitwiseClient(config);
}
