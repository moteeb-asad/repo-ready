import { posix } from "node:path";
import { trackedFiles } from "../../../git.js";
import type { Result } from "../../../types.js";
import { isEnvExample } from "../paths.js";

const ENV_FILE = /^\.env(\..+)?$/;

// .env, .env.local, .env.production. Not .env.example and its variants (.sample, .template).
export function findEnvFiles(files: string[]): string[] {
  return files.filter((file) => ENV_FILE.test(posix.basename(file)) && !isEnvExample(file));
}

export async function envTracked(): Promise<Result> {
  const found = findEnvFiles(await trackedFiles());

  if (found.length === 0) {
    return { id: "env-tracked", status: "pass", message: "no .env file is tracked" };
  }

  return {
    id: "env-tracked",
    status: "fail",
    message: `tracked by git: ${found.join(", ")}`,
    hint: `From the repo root: git rm --cached ${found.join(" ")}, add it to .gitignore, and rotate its keys`,
  };
}
