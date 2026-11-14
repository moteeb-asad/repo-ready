import { execa } from "execa";

// Every tracked file, as a path from the repo root, wherever repo-ready runs from.
// `path` limits it to a folder, e.g. ".github/workflows/".
export async function trackedFiles(path = ""): Promise<string[]> {
  const { stdout } = await execa("git", ["ls-files", "--full-name", `:/${path}`], { lines: true });
  return stdout;
}

// A tracked file's committed or staged content (what GitHub will show), not unsaved edits.
export async function readTracked(file: string): Promise<string> {
  const { stdout } = await execa("git", ["show", `:${file}`]);
  return stdout;
}
