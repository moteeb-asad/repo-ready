import { posix } from "node:path";
import { execa } from "execa";
import { trackedFiles } from "../../git.js";
import type { Result } from "../../types.js";

// Reads of a named env variable: Node, Vite, Bun, Deno, Python.
const ENV_READ =
  /(?:process\.env|import\.meta\.env|Bun\.env)\.([A-Z_][A-Z0-9_]*)|(?:process\.env|import\.meta\.env)\[["']([A-Z_][A-Z0-9_]*)["']\]|Deno\.env\.get\(["']([A-Z_][A-Z0-9_]*)["']|os\.environ(?:\.get\(|\[)\s*["']([A-Z_][A-Z0-9_]*)["']|os\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']/g;
const GREP = "process\\.env|import\\.meta\\.env|Bun\\.env|Deno\\.env|os\\.environ|os\\.getenv";

// Set by the runtime or the platform, not by the project: no .env.example needed for these.
const RUNTIME = new Set(["PORT", "HOST", "NODE_ENV", "CI", "DEBUG", "HOME", "PATH", "PWD", "TZ", "LANG", "MODE", "DEV", "PROD", "SSR", "BASE_URL"]);
const NOT_CODE = /\.(md|markdown|txt|rst)$|(^|\/)\.gitignore$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.(test|spec)\.|__tests__\//i;

export function findEnvExample(files: string[]): string | undefined {
  return files.find((file) => posix.basename(file) === ".env.example");
}

// A read with a default is optional: the code works without the variable.
// JS/TS: process.env.X || "a", process.env.X ?? "a", Deno.env.get("X") ?? "a".
// Python: os.environ.get("X", "a"), os.getenv("X", "a"). A bare .get("X") is not enough to tell.
// A read right after || or ?? is the fallback in a chain (process.env.A || process.env.B): optional too.
function hasDefault(m: RegExpMatchArray, line: string): boolean {
  const before = line.slice(0, m.index ?? 0);
  const rest = line.slice((m.index ?? 0) + m[0].length);
  if (/(\|\||\?\?)\s*$/.test(before)) return true;
  const python = Boolean(m[4] ?? m[5]);
  return python ? /^\s*,/.test(rest) && !m[0].includes("[") : /^\s*\)?\s*(\|\||\?\?)/.test(rest);
}

// `lines` is git grep output: "<file>:<content>". Returns the env variables the project needs:
// read somewhere without a default, and not set by the runtime.
export function envVarNames(lines: string[]): string[] {
  const required = new Set<string>();
  for (const raw of lines) {
    const match = raw.match(/^(.+?):(.*)$/);
    if (!match?.[1] || match[2] === undefined || NOT_CODE.test(match[1])) continue;
    for (const m of match[2].matchAll(ENV_READ)) {
      const name = m.slice(1).find(Boolean);
      if (name && !RUNTIME.has(name) && !hasDefault(m, match[2])) required.add(name);
    }
  }
  return [...required];
}

export async function envExample(): Promise<Result> {
  const found = findEnvExample(await trackedFiles());
  if (found) {
    return { id: "env-example", status: "pass", message: found };
  }

  // Exit code 1 means no match.
  const grep = await execa("git", ["grep", "--cached", "-I", "--full-name", "-E", GREP, "--", ":/"], {
    lines: true,
    reject: false,
  });
  const names = envVarNames(grep.stdout);
  if (names.length === 0) {
    return { id: "env-example", status: "pass", message: "not needed: the code reads no project env variables" };
  }

  const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
  return {
    id: "env-example",
    status: "warn",
    message: `no .env.example, but the code reads ${shown}`,
    hint: "Add .env.example listing every variable the project needs, with the values removed",
  };
}
