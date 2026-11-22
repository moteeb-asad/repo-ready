import { execa } from "execa";
import { isShallow, SHALLOW_HINT } from "../../../git.js";
import type { Result } from "../../../types.js";
import { findEnvFiles } from "./env-tracked.js";

type Found = { file: string; commit: string; when: string };

// `lines` is output of: git log --name-only --format=@@<hash>|<relative date>
export function findEnvCommits(lines: string[]): Found[] {
  const found: Found[] = [];
  let commit = "";
  let when = "";

  for (const line of lines) {
    if (line.startsWith("@@")) {
      [commit = "", when = ""] = line.slice(2).split("|");
    } else if (findEnvFiles([line]).length > 0) {
      found.push({ file: line, commit, when });
    }
  }

  return found;
}

export async function envInHistory(): Promise<Result> {
  if (await isShallow()) {
    return {
      id: "env-in-history",
      status: "warn",
      message: "skipped: shallow clone, older commits are not on this machine",
      hint: SHALLOW_HINT,
    };
  }

  const log = await execa(
    "git",
    ["log", "--all", "--diff-filter=A", "--name-only", "--format=@@%h|%cr", "--", ":/*.env*"],
    { lines: true, reject: false },
  );
  // A repo with no commits exits 0, so a failure always means the history was not scanned.
  if (log.failed) {
    return {
      id: "env-in-history",
      status: "warn",
      message: `skipped: git log failed (exit code ${log.exitCode})`,
      hint: "Run git log --all in this folder to see the error",
    };
  }
  const found = findEnvCommits(log.stdout);

  if (found.length === 0) {
    return { id: "env-in-history", status: "pass", message: "no .env file in git history" };
  }

  const list = found.map((f) => `${f.file} (${f.commit}, ${f.when})`).join(", ");
  return {
    id: "env-in-history",
    status: "fail",
    message: `committed in history: ${list}`,
    hint: "Rotate every key it held. Deleting the file or rewriting history does not make a leaked key safe",
  };
}
