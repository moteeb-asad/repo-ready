import { Octokit } from "@octokit/rest";
import { ghToken, githubRemote } from "../context.js";
import type { Result } from "../runner.js";

type Status = Result["status"];
export type BranchState = { name: string; rules: string[]; classic: boolean };

const ID = "branch-protection";
const RANK: Record<Status, number> = { pass: 0, warn: 1, fail: 2 };

export function judgeBranch(branch: BranchState): { status: Status; text: string } {
  const pr = branch.rules.includes("pull_request");
  const ci = branch.rules.includes("required_status_checks");

  if (pr && ci) {
    return { status: "pass", text: `${branch.name}: pull request and passing CI required` };
  }
  if (pr) {
    return { status: "warn", text: `${branch.name}: pull request required, but CI doesn't have to pass` };
  }
  // Classic protection passes on `protected: true` alone. Its settings (required reviews,
  // status checks) need admin access to read, so they are not checked.
  if (branch.classic) {
    return { status: "pass", text: `${branch.name}: classic branch protection, rules not checked` };
  }
  if (branch.rules.length > 0) {
    return { status: "warn", text: `${branch.name}: has rules, but direct pushes are allowed` };
  }
  return { status: "fail", text: `${branch.name}: not protected, anyone can push to it` };
}

export function judge(branches: BranchState[], isPrivate: boolean): Result {
  const judged = branches.map(judgeBranch);
  let status = judged.reduce<Status>((worst, b) => (RANK[b.status] > RANK[worst] ? b.status : worst), "pass");
  let message = judged.map((b) => b.text).join("; ");

  // Rulesets and branch protection on private repos need a paid GitHub plan.
  if (status === "fail" && isPrivate) {
    status = "warn";
    message += " (private repos need GitHub Pro to enforce protection)";
  }

  return { id: ID, status, message };
}

function skipped(reason: string): Result {
  return { id: ID, status: "warn", message: `skipped: ${reason}` };
}

export async function branchProtection(): Promise<Result> {
  const remote = await githubRemote();
  if (!remote) return skipped("origin is not a GitHub repo");

  const token = await ghToken();
  if (!token) return skipped("not logged in to GitHub, run gh auth login or set GITHUB_TOKEN");

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
