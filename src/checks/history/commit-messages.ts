import { execa } from "execa";
import type { Result } from "../../types.js";

const SAMPLE = 50;

// "feat(auth)!: " and similar. The description after it is what gets judged.
const CONVENTIONAL_PREFIX = /^[a-z]+(\([^)]*\))?!?:\s*/i;
// A repo's first commit has nothing to describe yet.
const INITIAL = /^(init|initial|initialize|first commit)\b/i;
// What GitHub's web editor writes by default: "Update index.html", "Add files via upload".
const GITHUB_DEFAULT = /^((create|update|delete|add)\s+[\w./-]+\.\w+|add files via upload)$/i;
// Messages made only of these words say nothing: "minor changes", "fix bug", "update code".
const GENERIC = new Set([
  "update", "updates", "updated", "fix", "fixes", "fixed", "bug", "bugs", "bugfix", "change", "changes",
  "changed", "minor", "small", "some", "more", "quick", "code", "file", "files", "stuff", "misc", "final",
  "new", "latest", "version", "wip", "temp", "tmp", "test", "tests", "testing", "again", "cleanup", "clean",
  "refactor", "improvements", "improve", "tweak", "tweaks", "edit", "edits", "work", "done", "commit", "save",
  "add", "added", "upload", "uploaded", "via", "it", "the", "a", "and", "of", "to", "my",
]);

export function isVague(subject: string): boolean {
  const text = subject.replace(CONVENTIONAL_PREFIX, "").trim().replace(/[.!]+$/, "");
  if (!text) return true;
  if (INITIAL.test(text)) return false;
  if (GITHUB_DEFAULT.test(text)) return true;

  const words = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  return words.length <= 1 || words.every((w) => GENERIC.has(w));
}

// `subjects` are the first lines of recent commits, newest first, merges excluded.
export function judgeCommits(subjects: string[]): Result {
  const id = "commit-messages";
  const n = subjects.length;
  if (n === 0) return { id, status: "pass", message: "no commits yet" };

  const vague = subjects.filter(isVague);
  if (vague.length === 0) {
    return { id, status: "pass", message: n === 1 ? "the only commit says what changed" : `all ${n} recent commits say what changed` };
  }

  // One vague commit in a small repo is noise, not a habit.
  const share = vague.length < 2 ? 0 : vague.length / n;
  const examples = [...new Set(vague)]
    .slice(0, 3)
    .map((s) => `"${s.length > 30 ? `${s.slice(0, 29)}…` : s}"`)
    .join(", ");
  const message = `${vague.length} of ${n} recent commits say nothing, e.g. ${examples}`;

  if (share < 0.2) return { id, status: "pass", message: `${n - vague.length} of ${n} recent commits say what changed` };
  return {
    id,
    status: share >= 0.5 ? "fail" : "warn",
    message,
    hint: 'Say what changed and where: "fix login redirect loop", not "fix" or "Update index.html"',
  };
}

export async function commitMessages(): Promise<Result> {
  // Fails when the repo has no commits yet; that is the same as an empty list.
  const log = await execa("git", ["log", `-${SAMPLE}`, "--no-merges", "--format=%s"], { lines: true, reject: false });
  return judgeCommits(log.failed ? [] : log.stdout.filter(Boolean));
}
