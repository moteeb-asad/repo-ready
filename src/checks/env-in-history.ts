import { execa } from "execa";
import type { Result } from "../runner.js";
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
  const { stdout } = await execa(
    "git",
    ["log", "--all", "--diff-filter=A", "--name-only", "--format=@@%h|%cr", "--", "*.env*"],
    { lines: true },
  );
  const found = findEnvCommits(stdout);

  if (found.length === 0) {
    return { id: "env-in-history", status: "pass", message: "no .env file in git history" };
  }

  const list = found.map((f) => `${f.file} (${f.commit}, ${f.when})`).join(", ");
  return {
    id: "env-in-history",
    status: "fail",
    message: `committed in history: ${list}. Rotate any keys it held`,
  };
}
