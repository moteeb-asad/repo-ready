import { posix } from "node:path";
import { trackedFiles } from "../../git.js";
import type { Result } from "../../runner.js";

export function findEnvExample(files: string[]): string | undefined {
  return files.find((file) => posix.basename(file) === ".env.example");
}

export async function envExample(): Promise<Result> {
  const found = findEnvExample(await trackedFiles());

  if (found) {
    return { id: "env-example", status: "pass", message: found };
  }

  return {
    id: "env-example",
    status: "warn",
    message: "no .env.example",
    hint: "If the project needs environment variables, copy .env to .env.example with the values removed",
  };
}
