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

// A tracked file's committed or staged content (what GitHub will show), not unsaved edits.
export async function readTracked(file: string): Promise<string> {
  const { stdout } = await execa("git", ["show", `:${file}`]);
  return stdout;
}
