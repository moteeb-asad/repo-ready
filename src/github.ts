import { Octokit } from "@octokit/rest";
import { execa } from "execa";

export type GitHubRepo = { owner: string; repo: string };

const TIMEOUT_SECONDS = 20;

// One client per check. Octokit's own logging is silenced (errors become a skipped check),
// and all of the check's requests share one time limit, so a flaky network can't hang the report.
export function githubClient(token: string): Octokit {
  const quiet = () => {};
  return new Octokit({
    auth: token,
    log: { debug: quiet, info: quiet, warn: quiet, error: quiet },
    request: { signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000) },
  });
}

// Why a GitHub API check could not run, in words a user can act on.
export function apiSkipReason(error: unknown, remote: GitHubRepo): string {
  const message = String((error as Error)?.message ?? error);
  if (/aborted|timed? ?out/i.test(message)) return `GitHub did not answer within ${TIMEOUT_SECONDS} seconds`;
  if (/ENETUNREACH|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed/i.test(message)) {
    return "could not reach GitHub, check your internet connection";
  }
  if (/rate limit/i.test(message)) return "GitHub API rate limit reached, try again later";
  if (/Could not resolve to a Repository|^Not Found/i.test(message)) {
    return `${remote.owner}/${remote.repo} not found on GitHub, or this token has no access to it`;
  }
  return `GitHub API error: ${message.split("\n")[0]}`;
}

export function parseGitHubRemote(url: string): GitHubRepo | undefined {
  const match = url.trim().match(/github\.com[:/]([^/]+)\/([^/]+?)(\.git)?\/?$/);
  if (!match?.[1] || !match[2]) return undefined;
  return { owner: match[1], repo: match[2] };
}

export async function githubRemote(): Promise<GitHubRepo | undefined> {
  const result = await execa("git", ["remote", "get-url", "origin"], { reject: false });
  return result.failed ? undefined : parseGitHubRemote(result.stdout);
}

// GH_TOKEN, then GITHUB_TOKEN (set in GitHub Actions), then the GitHub CLI login.
// Same order gh uses. See docs/decisions/0002-reuse-gh-token.md. Never print it.
export async function ghToken(): Promise<string | undefined> {
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;

  const result = await execa("gh", ["auth", "token"], { reject: false });
  return result.failed || !result.stdout ? undefined : result.stdout.trim();
}
