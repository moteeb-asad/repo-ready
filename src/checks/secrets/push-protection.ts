import { apiSkipReason, ghToken, githubClient, githubRemote } from "../../github.js";
import type { Result } from "../../types.js";

const ID = "push-protection";
const SETTINGS_HINT = "Settings → Advanced Security → enable Secret scanning and Push protection";

type Status = { status?: string } | undefined;
// The `security_and_analysis` part of GET /repos/{owner}/{repo}. GitHub only returns it to repo
// admins, and not for private repos without GitHub Advanced Security.
export type SecurityAndAnalysis = {
  secret_scanning?: Status;
  secret_scanning_push_protection?: Status;
} | null | undefined;

function warn(message: string, hint?: string): Result {
  const result: Result = { id: ID, status: "warn", message };
  if (hint) result.hint = hint;
  return result;
}

export function judgePushProtection(settings: SecurityAndAnalysis, repo: { private: boolean; admin: boolean }): Result {
  if (!settings) {
    if (!repo.admin) return warn("skipped: only repo admins can see this setting", "Ask a repo admin to check " + SETTINGS_HINT);
    if (repo.private) {
      return warn(
        "private repo: secret scanning needs GitHub Advanced Security",
        "Make the repo public to get it free, or run a scanner like gitleaks in CI",
      );
    }
    return warn("secret scanning settings not available", SETTINGS_HINT);
  }

  const scanning = settings.secret_scanning?.status === "enabled";
  const push = settings.secret_scanning_push_protection?.status === "enabled";
  if (scanning && push) return { id: ID, status: "pass", message: "secret scanning and push protection are on" };
  if (scanning) {
    return warn("push protection is off: a leaked key is found after it is public, not blocked before", SETTINGS_HINT);
  }
  return warn("secret scanning and push protection are off: GitHub won't catch a pushed key", SETTINGS_HINT);
}

export async function pushProtection(): Promise<Result> {
  const remote = await githubRemote();
  if (!remote) return warn("skipped: origin is not a GitHub repo");

  const token = await ghToken();
  if (!token) return warn("skipped: not logged in to GitHub", "Run gh auth login, or set GITHUB_TOKEN");

  try {
    const { data } = await githubClient(token).rest.repos.get(remote);
    return judgePushProtection(data.security_and_analysis, {
      private: data.private,
      admin: data.permissions?.admin === true,
    });
  } catch (error) {
    return warn(`skipped: ${apiSkipReason(error, remote)}`);
  }
}
