// Repository link helpers. The canonical repo is the default; self-hosters
// override REPO_URL (a wrangler var) so in-app report links point at THEIR
// issue tracker. Injection happens at deploy time: setup-local.sh fills it
// from `git remote get-url origin`, and the release workflow injects
// github.server_url/github.repository for CI deploys.

/** Upstream repo — used when no REPO_URL var is configured. */
const DEFAULT_REPO_URL = "https://github.com/panz3r/splitviewer";

export interface RepoLinks {
  /** Repo root (project/roadmap links). */
  repo: string;
  /** Issues list (docs, SUPPORT.md). */
  issues: string;
  /** Guided report form (in-app "Report an issue" links). */
  report: string;
  /** Private report (GitHub private vulnerability reporting): takedowns + privacy. */
  privateReport: string;
}

export function repoLinks(repoUrl: string = DEFAULT_REPO_URL): RepoLinks {
  return {
    repo: repoUrl,
    issues: `${repoUrl}/issues`,
    report: `${repoUrl}/issues/new?template=report.yml`,
    privateReport: `${repoUrl}/security/advisories/new`,
  };
}

/** Resolves the configured repo URL from bindings (wrangler var REPO_URL). */
export function repoUrlFromEnv(env: { REPO_URL?: string }): string {
  return env.REPO_URL && env.REPO_URL.length > 0 ? env.REPO_URL : DEFAULT_REPO_URL;
}
