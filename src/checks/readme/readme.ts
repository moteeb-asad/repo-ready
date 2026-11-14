import { readTracked, trackedFiles } from "../../git.js";
import type { Result } from "../../types.js";

const README = /^readme(\.(md|markdown|txt|rst))?$/i;

// A line (or inline code) that starts with a common install or run command.
const RUN_STEP =
  /(^|`)\s*(\$\s*)?(npm|npx|pnpm|yarn|bun|pip|pipx|python3?|uv|poetry|docker|docker-compose|make|go|cargo|deno|dotnet|mvn|gradle)\s/m;

export function findReadme(files: string[]): string | undefined {
  return files.find((file) => !file.includes("/") && README.test(file));
}

export function hasRunSteps(content: string): boolean {
  return RUN_STEP.test(content);
}

export async function readme(): Promise<Result> {
  const file = findReadme(await trackedFiles());

  if (!file) {
    return {
      id: "readme",
      status: "fail",
      message: "no README at the repo root",
      hint: "GitHub only shows a README at the root. Move or add one there",
    };
  }

  const content = await readTracked(file);

  if (!hasRunSteps(content)) {
    return {
      id: "readme",
      status: "fail",
      message: `${file} has no setup or run steps`,
      hint: "Add the commands to install and run the project, for example npm install and npm run dev",
    };
  }

  return { id: "readme", status: "pass", message: `${file} has setup or run steps` };
}
