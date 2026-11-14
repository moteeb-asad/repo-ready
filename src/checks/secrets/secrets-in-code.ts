import { posix } from "node:path";
import { execa } from "execa";
import type { Result } from "../../types.js";

export type Finding = { file: string; line: number; kind: string };

// Well-known key formats only, so ordinary code doesn't trigger it.
// Order matters: Anthropic keys also start with "sk-", so they are tested first.
const KEYS: { kind: string; pattern: RegExp }[] = [
  { kind: "Anthropic API key", pattern: /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{32,}/ },
  { kind: "OpenAI API key", pattern: /(?<![A-Za-z0-9])sk-(proj-)?[A-Za-z0-9_-]{32,}/ },
  { kind: "AWS access key", pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/ },
  { kind: "GitHub token", pattern: /(?<![A-Za-z0-9])(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})/ },
  { kind: "Slack token", pattern: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,}/ },
  { kind: "Stripe live key", pattern: /(?<![A-Za-z0-9])[sr]k_live_[A-Za-z0-9]{20,}/ },
  { kind: "Google API key", pattern: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/ },
  { kind: "private key", pattern: /-----BEGIN ([A-Z]+ )?PRIVATE KEY-----/ },
];

// Cheap first pass for git grep (POSIX ERE). findSecrets() does the exact matching.
const PREFIXES = "sk-|AKIA|gh[pousr]_|github_pat_|xox[baprs]-|[sr]k_live_|AIza|PRIVATE KEY-----";

// Placeholders like sk-xxxxxxxx or AWS's documented AKIAIOSFODNN7EXAMPLE.
const PLACEHOLDER = /x{4,}|your|example|placeholder|dummy|fake|redacted|changeme|<|\.\.\./i;

function isPlaceholder(key: string): boolean {
  return PLACEHOLDER.test(key) || new Set(key).size < 10;
}

// `lines` is git grep output: "<file>:<line>:<content>". The content is never returned.
export function findSecrets(lines: string[]): Finding[] {
  const found: Finding[] = [];

  for (const raw of lines) {
    const match = raw.match(/^(.+?):(\d+):(.*)$/);
    if (!match?.[1] || !match[2] || match[3] === undefined) continue;
    const [, file, line, content] = match;
    if (posix.basename(file) === ".env.example") continue;

    for (const { kind, pattern } of KEYS) {
      const key = content.match(pattern)?.[0];
      if (key && (kind === "private key" || !isPlaceholder(key))) {
        found.push({ file, line: Number(line), kind });
        break; // one finding per line is enough
      }
    }
  }

  return found;
}

export async function secretsInCode(): Promise<Result> {
  // --cached: what is committed or staged. -I: skip binary files. Exit code 1 means no match.
  const grep = await execa(
    "git",
    ["grep", "--cached", "-n", "-I", "--full-name", "-E", PREFIXES, "--", ":/"],
    { lines: true, reject: false },
  );
  if (grep.exitCode !== 0 && grep.exitCode !== 1) {
    throw new Error(`git grep failed: ${grep.stderr}`);
  }
  const found = findSecrets(grep.stdout);

  if (found.length === 0) {
    return { id: "secrets-in-code", status: "pass", message: "no API keys or private keys in tracked files" };
  }

  const shown = found.slice(0, 3).map((f) => `${f.file}:${f.line} (${f.kind})`);
  const more = found.length > 3 ? ` and ${found.length - 3} more` : "";
  return {
    id: "secrets-in-code",
    status: "fail",
    message: `${shown.join(", ")}${more}`,
    hint: "Move each value to .env and read it from process.env. If it was ever committed, rotate the key",
  };
}
