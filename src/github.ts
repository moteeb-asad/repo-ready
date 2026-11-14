import { execa } from "execa";

export type GitHubRepo = { owner: string; repo: string };

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
