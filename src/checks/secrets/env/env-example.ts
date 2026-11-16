import { type GrepMatch, grepTracked, trackedFiles } from "../../../git.js";
import type { Result } from "../../../types.js";
import { DOCS_PATH, isEnvExample, TEST_PATH, VENDOR_PATH } from "../paths.js";

// Reads of a named env variable: Node, Vite, Bun, Deno, Python.
const ENV_READ =
  /(?:process\.env|import\.meta\.env|Bun\.env)\.([A-Z_][A-Z0-9_]*)|(?:process\.env|import\.meta\.env)\[["']([A-Z_][A-Z0-9_]*)["']\]|Deno\.env\.get\(["']([A-Z_][A-Z0-9_]*)["']|os\.environ(?:\.get\(|\[)\s*["']([A-Z_][A-Z0-9_]*)["']|os\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']/g;
const GREP = "process\\.env|import\\.meta\\.env|Bun\\.env|Deno\\.env|os\\.environ|os\\.getenv";

// Set by the runtime or the platform, not by the project: no .env.example needed for these.
const RUNTIME = new Set(["PORT", "HOST", "NODE_ENV", "CI", "DEBUG", "HOME", "PATH", "PWD", "TZ", "LANG", "MODE", "DEV", "PROD", "SSR", "BASE_URL"]);
// Env reads in tests, docs, vendored code and .gitignore are not the project's own config.
function notProjectCode(file: string): boolean {
  return TEST_PATH.test(file) || DOCS_PATH.test(file) || VENDOR_PATH.test(file) || /(^|\/)\.gitignore$/.test(file);
}

// .env.example, or a variant like .env.local.example, .env.sample or .env.template.
export function findEnvExample(files: string[]): string | undefined {
  return files.find(isEnvExample);
}

// Names of config an app usually cannot run without.
const LOOKS_REQUIRED = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|URL|URI|DSN|DATABASE/i;

// A read with a default is optional: the code works without the variable.
// JS/TS: process.env.X || "a", process.env.X ?? "a", Deno.env.get("X") ?? "a".
// A read right after || or ?? is the fallback in a chain (process.env.A || process.env.B): optional too.
// Python: os.environ["X"] raises when missing, so it is required. .get("X", "a") and getenv("X", "a")
// are optional. A bare .get("X") / getenv("X") returns None, which Python code uses for "optional",
// but AI-written apps also use it for required keys, so it counts only for names like API_KEY or DATABASE_URL.
function isOptional(m: RegExpMatchArray, line: string, name: string): boolean {
  const before = line.slice(0, m.index ?? 0);
  const rest = line.slice((m.index ?? 0) + m[0].length);
  if (/(\|\||\?\?)\s*$/.test(before)) return true;

  const python = Boolean(m[4] ?? m[5]);
  if (!python) return /^\s*\)?\s*(\|\||\?\?)/.test(rest);
  if (m[0].includes("[")) return false;
  return /^\s*,/.test(rest) || !LOOKS_REQUIRED.test(name);
}

// Returns the env variables the project needs: read somewhere without a default, and not set by the runtime.
export function envVarNames(matches: GrepMatch[]): string[] {
  const required = new Set<string>();
  for (const { file, content } of matches) {
    if (notProjectCode(file)) continue;
    // A comment line describes code, it doesn't run it: // JS, # Python, /* and * block comments.
    if (/^\s*(\/\/|#|\/\*|\*)/.test(content)) continue;
    for (const m of content.matchAll(ENV_READ)) {
      const name = m.slice(1).find(Boolean);
      if (name && !RUNTIME.has(name) && !isOptional(m, content, name)) required.add(name);
    }
  }
  return [...required];
}

export async function envExample(): Promise<Result> {
  const found = findEnvExample(await trackedFiles());
  if (found) {
    return { id: "env-example", status: "pass", message: found };
  }

  const names = envVarNames(await grepTracked(GREP));
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
