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

// The opening lines of READMEs that project generators write. Some include npm commands,
// so an untouched one would pass the run-steps test.
const TEMPLATES: { name: string; marker: RegExp }[] = [
  { name: "Vite", marker: /This template provides a minimal setup to get React working in Vite/i },
  { name: "Vue + Vite", marker: /This template should help get you started developing with Vue 3 in Vite/i },
  { name: "Create React App", marker: /This project was bootstrapped with \[Create React App\]/i },
  { name: "Next.js", marker: /This is a \[Next\.js\]\(https:\/\/nextjs\.org\/?\) project bootstrapped with/i },
  { name: "Expo", marker: /This is an \[Expo\]\(https:\/\/expo\.dev\/?\) project created with/i },
  { name: "Angular CLI", marker: /This project was generated (using|with) \[Angular CLI\]/i },
  { name: "SvelteKit", marker: /Everything you need to build a Svelte project, powered by/i },
];

// Only the top counts: a README that starts with the project's own text and keeps the
// template further down has been written by someone.
export function defaultTemplate(content: string): string | undefined {
  const top = content.trimStart().slice(0, 600);
  return TEMPLATES.find((t) => t.marker.test(top))?.name;
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

  const template = defaultTemplate(content);
  if (template) {
    return {
      id: "readme",
      status: "fail",
      message: `${file} is still the default ${template} README`,
      hint: "Replace it with what the project does and how to install and run it",
    };
  }

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
