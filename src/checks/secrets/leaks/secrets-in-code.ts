import { type GrepMatch, grepTracked } from "../../../git.js";
import type { Result } from "../../../types.js";
import { DOCS_PATH, isEnvExample, TEST_PATH } from "../paths.js";
import { detect, PREFIXES, type Severity } from "./detectors.js";

export type Finding = { file: string; line: number; kind: string; severity: Severity };

// One finding per line. The matched content is never returned.
export function findSecrets(matches: GrepMatch[]): Finding[] {
  const found: Finding[] = [];
  for (const { file, line, content } of matches) {
    const hit = detect(file, content);
    if (hit) found.push({ file, line, ...hit });
  }
  return found;
}

export async function secretsInCode(): Promise<Result> {
  const found = findSecrets(await grepTracked(PREFIXES, { ignoreCase: true }));

  if (found.length === 0) {
    return { id: "secrets-in-code", status: "pass", message: "no secrets in tracked files" };
  }

  const failing = found.some((f) => f.severity === "fail");
  // Files meant to be shared (docs, .env.example) get a placeholder, not process.env.
  const onlySharedFiles = found.every((f) => isEnvExample(f.file) || (DOCS_PATH.test(f.file) && !TEST_PATH.test(f.file)));
  const sorted = [...found.filter((f) => f.severity === "fail"), ...found.filter((f) => f.severity === "warn")];
  const shown = sorted.slice(0, 3).map((f) => `${f.file}:${f.line} (${f.kind})`);
  const more = found.length > 3 ? ` and ${found.length - 3} more` : "";

  return {
    id: "secrets-in-code",
    status: failing ? "fail" : "warn",
    message: `${shown.join(", ")}${more}`,
    hint: onlySharedFiles
      ? "Replace each value with a placeholder (OPENAI_API_KEY=) and rotate the key: docs and .env.example are shared with everyone"
      : failing
        ? "Move each value to .env and read it from process.env. If it was ever committed, rotate the key"
        : "If these are real secrets, move them to .env and rotate them. In tests, use obviously fake values like sk-test-xxxx",
  };
}
