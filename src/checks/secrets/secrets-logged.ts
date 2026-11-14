import { execa } from "execa";
import type { Result } from "../../types.js";

export type LoggedSecret = { file: string; line: number; what: string };

const LOG_CALL = /\b(?:console\.(?:log|info|debug|warn|error|trace)|print|logger\.\w+|logging\.\w+|log\.(?:info|debug|warn|error))\s*\(/;
const SKIP_FILES = /\.(test|spec)\.|__tests__\/|\.md$/i;

// Env variable names that hold secrets. NEXT_PUBLIC_* and similar are public by design.
const SECRET_ENV = /SECRET|KEY|TOKEN|PASSWORD|PASSWD|PWD|PRIVATE|CREDENTIAL/i;
const JS_ENV = /\b(?:process\.env|import\.meta\.env)\.([A-Za-z0-9_]+)/g;
const PY_ENV = /\bos\.(?:environ\[\s*|environ\.get\(\s*|getenv\(\s*)["']([A-Za-z0-9_]+)["']/g;

// The last word of a name decides: accessToken, user.password, db_password, apiKey.
const SECRET_WORDS = new Set(["secret", "secrets", "password", "passwd", "pwd", "token", "credential", "credentials"]);
const SECRET_PAIRS = new Set(["api_key", "private_key", "secret_key", "access_key"]);

function isSecretName(name: string): boolean {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/_+/).filter(Boolean);
  const last = words.at(-1) ?? "";
  return SECRET_WORDS.has(last) || SECRET_PAIRS.has(words.slice(-2).join("_"));
}

// Keep the code inside a log call: drop string text, keep ${...} and f-string {...} expressions,
// and drop safe ways to log a secret (Boolean(x), !!x, typeof x).
function codeOnly(args: string): string {
  const expressions = (text: string, open: RegExp) => [...text.matchAll(open)].map((m) => m[1]).join(" ");
  return args
    .replace(/`(?:[^`\\]|\\.)*`/g, (t) => ` ${expressions(t, /\$\{([^}]*)\}/g)} `)
    .replace(/\bf(["'])(?:(?!\1).)*\1/g, (t) => ` ${expressions(t, /\{([^}]*)\}/g)} `)
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, " ")
    .replace(/\bBoolean\([^)]*\)|!!\s*[\w$.]+|\btypeof\s+[\w$.]+/g, " ");
}

// `lines` is git grep output: "<file>:<line>:<content>".
export function findSecretLogs(lines: string[]): LoggedSecret[] {
  const found: LoggedSecret[] = [];

  for (const raw of lines) {
    const match = raw.match(/^(.+?):(\d+):(.*)$/);
    if (!match?.[1] || !match[2] || match[3] === undefined) continue;
    const [, file, line, content] = match;
    if (SKIP_FILES.test(file)) continue;

    const call = content.match(LOG_CALL);
    if (call?.index === undefined) continue;
    const args = content.slice(call.index + call[0].length);
    const code = codeOnly(args);

    const what = firstSecret(args, code);
    if (what) found.push({ file, line: Number(line), what });
  }

  return found;
}

function firstSecret(args: string, code: string): string | undefined {
  for (const m of code.matchAll(JS_ENV)) {
    const name = m[1] ?? "";
    if (SECRET_ENV.test(name) && !/PUBLIC/i.test(name)) return m[0];
  }
  // Python env names are quoted, so read them from the raw arguments.
  for (const m of args.matchAll(PY_ENV)) {
    const name = m[1] ?? "";
    if (SECRET_ENV.test(name) && !/PUBLIC/i.test(name)) return `os.environ ${name}`;
  }
  for (const m of code.matchAll(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g)) {
    const chain = m[0];
    if (/^(process\.env|import\.meta)/.test(chain)) continue;
    const last = chain.split(".").at(-1) ?? "";
    if (isSecretName(last)) return chain;
  }
  return undefined;
}

export async function secretsLogged(): Promise<Result> {
  const grep = await execa(
    "git",
    [
      "grep", "--cached", "-n", "-I", "--full-name", "-E",
      "console\\.|print\\(|logger\\.|logging\\.|log\\.(info|debug|warn|error)",
      "--", ":/",
    ],
    { lines: true, reject: false },
  );
  if (grep.exitCode !== 0 && grep.exitCode !== 1) {
    throw new Error(`git grep failed: ${grep.stderr}`);
  }
  const found = findSecretLogs(grep.stdout);

  if (found.length === 0) {
    return { id: "secrets-logged", status: "pass", message: "no secrets written to logs" };
  }

  const shown = found.slice(0, 3).map((f) => `${f.file}:${f.line} logs ${f.what}`);
  const more = found.length > 3 ? ` and ${found.length - 3} more` : "";
  return {
    id: "secrets-logged",
    status: "warn",
    message: `${shown.join(", ")}${more}`,
    hint: "Remove the log, or log only whether the value is set, e.g. Boolean(value)",
  };
}
