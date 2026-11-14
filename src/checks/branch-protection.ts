import { Octokit } from "@octokit/rest";
import { ghToken, githubRemote } from "../context.js";
import type { Result } from "../runner.js";

type Status = Result["status"];
export type BranchState = { name: string; rules: string[]; classic: boolean };

const ID = "branch-protection";

type Judged = { status: Status; text: string; hint?: string };

export function judgeBranch(branch: BranchState): Judged {
  const pr = branch.rules.includes("pull_request");
  const ci = branch.rules.includes("required_status_checks");

  if (pr && ci) {
    return { status: "pass", text: "pull request and passing CI required" };
  }
  if (pr) {
    return {
      status: "warn",
      text: "pull request required, but CI doesn't have to pass",
      hint: "In the ruleset, turn on Require status checks to pass and add your CI job",
    };
  }
  // Classic protection passes on `protected: true` alone. Its settings (required reviews,
  // status checks) need admin access to read, so they are not checked.
  if (branch.classic) {
    return { status: "pass", text: "classic branch protection, rules not checked" };
  }
  if (branch.rules.length > 0) {
    return {
      status: "warn",
      text: "has rules, but direct pushes are allowed",
      hint: "In the ruleset, turn on Require a pull request before merging",
    };
  }
  return {
    status: "fail",
    text: "not protected, anyone can push to it",
    hint: "Settings → Rules → Rulesets: require a pull request and passing status checks",
  };
}

// One result per branch, labelled with the branch name.
export function judge(branches: BranchState[], isPrivate: boolean): Result[] {
  return branches.map((branch) => {
    let { status, text, hint } = judgeBranch(branch);

    // Rulesets and branch protection on private repos need a paid GitHub plan.
    if (status === "fail" && isPrivate) {
      status = "warn";
      text += " (private repos need GitHub Pro to enforce protection)";
      hint = "Make the repo public, or use GitHub Pro to enforce protection";
    }

    const result: Result = { id: ID, label: branch.name, status, message: text };
    if (hint) result.hint = hint;
    return result;
  });
}

function skipped(reason: string, hint?: string): Result {
  const result: Result = { id: ID, status: "warn", message: `skipped: ${reason}` };
  if (hint) result.hint = hint;
  return result;
}

export async function branchProtection(): Promise<Result | Result[]> {
  const remote = await githubRemote();
  if (!remote) return skipped("origin is not a GitHub repo");

  const token = await ghToken();
  if (!token) return skipped("not logged in to GitHub", "Run gh auth login, or set GITHUB_TOKEN");

  // Silence Octokit's own logging: an expected 404 (no develop branch) is not an error.
  const quiet = () => {};
  const octokit = new Octokit({ auth: token, log: { debug: quiet, info: quiet, warn: quiet, error: quiet } });

  try {
    const { data: repo } = await octokit.rest.repos.get(remote);
    const names = [repo.default_branch];
    if (repo.default_branch !== "develop") names.push("develop");

    const branches: BranchState[] = [];
    for (const name of names) {
      const branch = await octokit.rest.repos
        .getBranch({ ...remote, branch: name })
        .catch((error: { status?: number }) => {
          if (error.status === 404 && name === "develop") return undefined;
          throw error;
        });
      if (!branch) continue;

      const { data: rules } = await octokit.rest.repos.getBranchRules({ ...remote, branch: name });
      branches.push({ name, rules: rules.map((rule) => rule.type), classic: branch.data.protected });
    }

    return judge(branches, repo.private);
  } catch (error) {
    return skipped(`GitHub API error: ${(error as Error).message}`);
  }
}
