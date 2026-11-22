import { execa } from "execa";
import { grepTracked } from "../../../git.js";
import type { Result } from "../../../types.js";
import { findEnvFiles } from "../env/env-tracked.js";
import { detect, type Severity, STRONG_PREFIXES } from "./detectors.js";

const ID = "secrets-in-history";
const MARK = "##RR## ";
const TIMEOUT_MS = 20_000;

export type HistoryFinding = { file: string; commit: string; when: string; kind: string; severity: Severity };

// `lines` is `git log -p --unified=0 --format=##RR## <hash>|<age>` output, newest commit first.
// Only added lines count: a key that was ever added is readable in history, even if deleted later.
// `current` holds "<file>\0<trimmed line>" for lines in today's files; secrets-in-code reports those.
export function findInHistory(lines: string[], current: Set<string>): HistoryFinding[] {
  const found = new Map<string, HistoryFinding>();
  let commit = "";
  let when = "";
  let file = "";

  for (const line of lines) {
    if (line.startsWith(MARK)) {
      [commit = "", when = ""] = line.slice(MARK.length).split("|");
    } else if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^"|"$/g, "");
      file = path.startsWith("b/") ? path.slice(2) : ""; // "+++ /dev/null": the file was deleted
    } else if (line.startsWith("+") && file) {
      const content = line.slice(1);
      if (findEnvFiles([file]).length > 0) continue; // .env files: env-in-history reports them
      if (current.has(`${file}\0${content.trim()}`)) continue; // still there: secrets-in-code reports it
      const hit = detect(file, content, { strongOnly: true });
      const key = `${file}\0${hit?.kind}`;
      if (hit && !found.has(key)) found.set(key, { file, commit, when, ...hit }); // newest commit wins
    }
  }
  return [...found.values()];
}

export function judgeHistory(found: HistoryFinding[]): Result {
  if (found.length === 0) return { id: ID, status: "pass", message: "no secrets in git history" };
  const failing = found.some((f) => f.severity === "fail");
  const sorted = [...found.filter((f) => f.severity === "fail"), ...found.filter((f) => f.severity === "warn")];
  const shown = sorted.slice(0, 3).map((f) => `${f.file} (${f.kind}, ${f.commit}, ${f.when})`);
  const more = found.length > 3 ? ` and ${found.length - 3} more` : "";
  return {
    id: ID,
    status: failing ? "fail" : "warn",
    message: `${shown.join(", ")}${more}`,
    hint: "Rotate each key: it is still readable in git history. Deleting the file or line does not help",
  };
}

export async function secretsInHistory(): Promise<Result> {
  // A partial clone (--filter=blob:none) has no old file contents: git log -p would download them.
  const partial = await execa("git", ["config", "--get", "extensions.partialclone"], { reject: false });
  if (partial.stdout.trim()) {
    return {
      id: ID,
      status: "warn",
      message: "skipped: partial clone, old file contents are not on this machine",
      hint: "Run it in a full clone (git clone without --filter) to scan the history",
    };
  }

  const log = await execa(
    "git",
    ["log", "--all", `-G${STRONG_PREFIXES}`, "-p", "--unified=0", "--no-color", "--no-ext-diff", `--format=${MARK}%h|%cr`],
    { lines: true, reject: false, timeout: TIMEOUT_MS },
  );
  if (log.timedOut) {
    return { id: ID, status: "warn", message: `skipped: history too large to scan in ${TIMEOUT_MS / 1000} seconds` };
  }
  if (log.failed) return judgeHistory([]); // no commits yet

  const current = new Set((await grepTracked(STRONG_PREFIXES)).map((m) => `${m.file}\0${m.content.trim()}`));
  return judgeHistory(findInHistory(log.stdout, current));
}
