import { posix } from "node:path";
import { execa } from "execa";
import type { Result } from "../runner.js";

export function findEnvExample(files: string[]): string | undefined {
  return files.find((file) => posix.basename(file) === ".env.example");
}

export async function envExample(): Promise<Result> {
  const { stdout } = await execa("git", ["ls-files", "--full-name", ":/"], { lines: true });
  const found = findEnvExample(stdout);

  if (found) {
    return { id: "env-example", status: "pass", message: found };
  }

  return {
    id: "env-example",
    status: "warn",
    message: "no .env.example: add one if the project needs environment variables",
  };
}
