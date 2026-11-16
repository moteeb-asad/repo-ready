import { Octokit } from "@octokit/rest";
import { ghToken, githubRemote } from "../../github.js";
import type { Result } from "../../types.js";

const ID = "direct-pushes";
const SAMPLE = 30;
const MAX_PAGES = 3; // 100 commits a page. Merged branches add commits that are not on the first-parent chain.

export type Commit = { oid: string; parent?: string | undefined; viaPr: boolean; date?: string | undefined };

// The commits that landed on the branch itself: follow the first parent from the tip.
// Commits inside a merged branch are skipped, so a direct push to develop is not credited
// to the release pull request that later brought it to main.
export function firstParentChain(commits: Commit[], tip: string, limit: number): Commit[] {
  const byOid = new Map(commits.map((c) => [c.oid, c]));
  const chain: Commit[] = [];
  for (let c = byOid.get(tip); c && chain.length < limit; c = c.parent ? byOid.get(c.parent) : undefined) {
    chain.push(c);
  }
  return chain;
}

// "3 days ago", "4 months ago".
export function ago(date: string, now = Date.now()): string {
  const days = Math.max(0, Math.round((now - Date.parse(date)) / 86_400_000));
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (days < 30) return format.format(-days, "day");
  if (days < 365) return format.format(-Math.round(days / 30), "month");
  return format.format(-Math.round(days / 365), "year");
}

export function judgeDirectPushes(branch: string, chain: Commit[], now = Date.now()): Result {
  // The first commit of a repo has no pull request to come from.
  const all = chain.filter((c) => c.parent);

  // Judge the habit since pull requests started: direct pushes while setting up a repo,
  // before the first pull request, are history, not how it is maintained now.
  const firstPr = all.findLastIndex((c) => c.viaPr);
  const commits = firstPr === -1 ? all : all.slice(0, firstPr + 1);
  const before = all.length - commits.length;
  const earlier = before > 0 ? ` (${before} direct ${before === 1 ? "push" : "pushes"} before that)` : "";

  const n = commits.length;
  if (n === 0) return { id: ID, status: "pass", message: `no commits on ${branch} after the first one` };

  const direct = commits.filter((c) => !c.viaPr);
  if (direct.length === 0) {
    const which =
      n === 1
        ? `the only commit on ${branch} ${before > 0 ? "since pull requests started" : "after the first"} came through a pull request`
        : `all ${n} ${before > 0 ? `commits on ${branch} since the first pull request` : `recent commits on ${branch}`} came through pull requests`;
    return { id: ID, status: "pass", message: `${which}${earlier}` };
  }

  // Newest first, so the first direct push is the latest one.
  const when = direct[0]?.date ? ago(direct[0].date, now) : undefined;
  const latest = when ? `, the latest ${when}` : "";

  // One direct push is noise, not a habit.
  if (direct.length < 2 || direct.length / n < 0.2) {
    const message =
      n === 1
        ? `the only commit on ${branch} after the first was pushed directly${when ? `, ${when}` : ""}`
        : `${direct.length} of ${n} recent commits on ${branch} pushed directly${latest}`;
    return { id: ID, status: "pass", message };
  }
  return {
    id: ID,
    status: direct.length / n >= 0.5 ? "fail" : "warn",
    message: `${direct.length} of ${n} recent commits on ${branch} were pushed directly, not through a pull request${latest}`,
    hint: `Protect ${branch} and make every change a short branch with a pull request`,
  };
}

const QUERY = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      name
      target {
        ... on Commit {
          oid
          history(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              oid
              committedDate
              parents(first: 1) { nodes { oid } }
              associatedPullRequests(first: 5) { nodes { merged } }
            }
          }
        }
      }
    }
  }
}`;

type Response = {
  repository: {
    defaultBranchRef: {
      name: string;
      target: {
        oid: string;
        history: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: {
            oid: string;
            committedDate: string;
            parents: { nodes: { oid: string }[] };
            associatedPullRequests: { nodes: { merged: boolean }[] };
          }[];
        };
      };
    } | null;
  } | null;
};

function skipped(reason: string, hint?: string): Result {
  const result: Result = { id: ID, status: "warn", message: `skipped: ${reason}` };
  if (hint) result.hint = hint;
  return result;
}

export async function directPushes(): Promise<Result> {
  const remote = await githubRemote();
  if (!remote) return skipped("origin is not a GitHub repo");

  const token = await ghToken();
  if (!token) return skipped("not logged in to GitHub", "Run gh auth login, or set GITHUB_TOKEN");

  // Silence Octokit's own logging; errors are reported as a skipped check.
  const quiet = () => {};
  const octokit = new Octokit({ auth: token, log: { debug: quiet, info: quiet, warn: quiet, error: quiet } });

  try {
    const commits: Commit[] = [];
    let branch = "";
    let tip = "";
    let after: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data: Response = await octokit.graphql<Response>(QUERY, { owner: remote.owner, name: remote.repo, after });
      const ref = data.repository?.defaultBranchRef;
      if (!ref) return { id: ID, status: "pass", message: "no commits yet" };

      branch = ref.name;
      tip = ref.target.oid;
      for (const node of ref.target.history.nodes) {
        commits.push({
          oid: node.oid,
          parent: node.parents.nodes[0]?.oid,
          viaPr: node.associatedPullRequests.nodes.some((pr) => pr.merged),
          date: node.committedDate,
        });
      }

      const { hasNextPage, endCursor } = ref.target.history.pageInfo;
      if (!hasNextPage || firstParentChain(commits, tip, SAMPLE).length >= SAMPLE) break;
      after = endCursor;
    }

    return judgeDirectPushes(branch, firstParentChain(commits, tip, SAMPLE));
  } catch (error) {
    const message = (error as Error).message;
    if (/Could not resolve to a Repository/.test(message)) {
      return skipped(`${remote.owner}/${remote.repo} not found on GitHub, or this token has no access to it`);
    }
    return skipped(`GitHub API error: ${message.split("\n")[0]}`);
  }
}
