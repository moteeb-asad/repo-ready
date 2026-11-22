import { execa } from "execa";

// Every tracked file, as a path from the repo root, wherever repo-ready runs from.
// `path` limits it to a folder, e.g. ".github/workflows/".
export async function trackedFiles(path = ""): Promise<string[]> {
  const { stdout } = await execa("git", ["ls-files", "--full-name", `:/${path}`], { lines: true });
  return stdout;
}

// The checked-out branch, or "detached at <sha>".
export async function currentBranch(): Promise<string> {
  const branch = await execa("git", ["branch", "--show-current"]);
  if (branch.stdout) return branch.stdout;
  const sha = await execa("git", ["rev-parse", "--short", "HEAD"], { reject: false });
  return sha.failed ? "no commits yet" : `detached at ${sha.stdout}`;
}

// origin/HEAD says which branch GitHub shows. It is missing when a repo was created locally
// and pushed later, so fall back to a local main or master.
export function pickDefaultBranch(originHead: string | undefined, localBranches: string[]): string | undefined {
  if (originHead) return originHead.replace(/^origin\//, "");
  return ["main", "master"].find((name) => localBranches.includes(name));
}

export async function defaultBranch(): Promise<string | undefined> {
  const head = await execa("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { reject: false });
  const local = await execa("git", ["branch", "--format=%(refname:short)"], { lines: true });
  return pickDefaultBranch(head.failed ? undefined : head.stdout, local.stdout);
}

export type GrepMatch = { file: string; line: number; content: string };

// One line of `git grep -n` output: "<file>:<line>:<content>".
export function parseGrepLine(raw: string): GrepMatch | undefined {
  const match = raw.match(/^(.+?):(\d+):(.*)$/);
  if (!match?.[1] || !match[2] || match[3] === undefined) return undefined;
  return { file: match[1], line: Number(match[2]), content: match[3] };
}

// Search committed or staged text files (what GitHub will show) from the repo root.
// `pattern` is a POSIX extended regex. Returns no matches when nothing is found.
export async function grepTracked(pattern: string, { ignoreCase = false } = {}): Promise<GrepMatch[]> {
  const args = ["grep", "--cached", "-n", "-I", "--full-name", "-E", ...(ignoreCase ? ["-i"] : []), pattern, "--", ":/"];
  const grep = await execa("git", args, { lines: true, reject: false });
  // Exit code 1 means no match.
  if (grep.exitCode !== 0 && grep.exitCode !== 1) throw new Error(`git grep failed: ${grep.stderr}`);
  return grep.stdout.map(parseGrepLine).filter((m): m is GrepMatch => m !== undefined);
}

// A tracked file's committed or staged content (what GitHub will show), not unsaved edits.
export async function readTracked(file: string): Promise<string> {
  const { stdout } = await execa("git", ["show", `:${file}`]);
  return stdout;
}

// A shallow clone (actions/checkout's default depth 1) has only the latest commits, so a history
// check that finds nothing there must not pass.
export async function isShallow(): Promise<boolean> {
  const { stdout } = await execa("git", ["rev-parse", "--is-shallow-repository"], { reject: false });
  return stdout.trim() === "true";
}

export const SHALLOW_HINT = "In GitHub Actions, set fetch-depth: 0 on actions/checkout. Locally, run git fetch --unshallow";
