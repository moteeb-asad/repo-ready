import { execa } from "execa";
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
  // A shallow clone (actions/checkout's default depth 1) has only the latest commits: a pass would mislead.
  const shallow = await execa("git", ["rev-parse", "--is-shallow-repository"], { reject: false });
  if (shallow.stdout.trim() === "true") {
    return {
      id: "env-in-history",
      status: "warn",
      message: "skipped: shallow clone, older commits are not on this machine",
      hint: "In GitHub Actions, set fetch-depth: 0 on actions/checkout. Locally, run git fetch --unshallow",
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
