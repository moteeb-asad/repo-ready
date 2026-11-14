import { posix } from "node:path";
import { execa } from "execa";
import type { Result } from "../runner.js";

const ENV_FILE = /^\.env(\..+)?$/;

export function findEnvFiles(files: string[]): string[] {
  return files.filter((file) => {
    const name = posix.basename(file);
    return ENV_FILE.test(name) && name !== ".env.example";
  });
}

export async function envTracked(): Promise<Result> {
  const { stdout } = await execa("git", ["ls-files", "--full-name", ":/"], { lines: true });
  const found = findEnvFiles(stdout);

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
