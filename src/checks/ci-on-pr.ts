import { execa } from "execa";
import { parse } from "yaml";
import type { Result } from "../runner.js";

export function runsOnPullRequest(workflow: string): boolean {
  let on: unknown;
  try {
    on = parse(workflow)?.on;
  } catch {
    return false;
  }

  if (typeof on === "string") return on === "pull_request";
  if (Array.isArray(on)) return on.includes("pull_request");
  if (on && typeof on === "object") return "pull_request" in on;
  return false;
}

export async function ciOnPr(): Promise<Result> {
  const { stdout: files } = await execa(
    "git",
    ["ls-files", "--full-name", ":/.github/workflows/"],
    { lines: true },
  );
  const workflows = files.filter((file) => /\.ya?ml$/.test(file));

  if (workflows.length === 0) {
    return {
      id: "ci-on-pr",
      status: "fail",
      message: "no workflows in .github/workflows",
      hint: "Add .github/workflows/ci.yml that runs your tests on: pull_request",
    };
  }

  const onPr: string[] = [];
  for (const file of workflows) {
    const { stdout } = await execa("git", ["show", `:${file}`]);
    if (runsOnPullRequest(stdout)) onPr.push(file);
  }

  if (onPr.length === 0) {
    return {
      id: "ci-on-pr",
      status: "fail",
      message: "no workflow runs on pull_request",
      hint: "Add pull_request under on: in the workflow that runs your tests",
    };
  }

  return { id: "ci-on-pr", status: "pass", message: onPr.join(", ") };
}
