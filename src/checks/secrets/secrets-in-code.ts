import { posix } from "node:path";
import { execa } from "execa";
import type { Result } from "../../types.js";

type Severity = "fail" | "warn";
export type Finding = { file: string; line: number; kind: string; severity: Severity };

// A detector looks at one line and returns what it found (never the value), or undefined.
type Detector = { severity: Severity; find: (content: string, file: string) => string | undefined };

// Placeholders like sk-xxxxxxxx or AWS's documented AKIAIOSFODNN7EXAMPLE.
const PLACEHOLDER = /x{4,}|your|example|placeholder|dummy|fake|redacted|changeme|<|\.\.\./i;

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value) || new Set(value).size < 10;
}

// Well-known key formats. Order matters: Anthropic keys also start with "sk-".
const KEYS: { kind: string; pattern: RegExp }[] = [
  { kind: "Anthropic API key", pattern: /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{32,}/ },
  { kind: "OpenAI API key", pattern: /(?<![A-Za-z0-9])sk-(proj-)?[A-Za-z0-9_-]{32,}/ },
  { kind: "AWS access key", pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/ },
  { kind: "GitHub token", pattern: /(?<![A-Za-z0-9])(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})/ },
  { kind: "Slack token", pattern: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,}/ },
  { kind: "Stripe live key", pattern: /(?<![A-Za-z0-9])[sr]k_live_[A-Za-z0-9]{20,}/ },
  { kind: "Google API key", pattern: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/ },
  { kind: "Google OAuth client secret", pattern: /(?<![A-Za-z0-9])GOCSPX-[A-Za-z0-9_-]{28}/ },
  { kind: "Supabase secret key", pattern: /(?<![A-Za-z0-9])sb_secret_[A-Za-z0-9_-]{20,}/ },
  { kind: "SendGrid API key", pattern: /(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },
  { kind: "npm token", pattern: /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{36}/ },
  { kind: "Hugging Face token", pattern: /(?<![A-Za-z0-9])hf_[A-Za-z0-9]{34}/ },
  { kind: "Groq API key", pattern: /(?<![A-Za-z0-9])gsk_[A-Za-z0-9]{52}/ },
  { kind: "Resend API key", pattern: /(?<![A-Za-z0-9])re_[A-Za-z0-9]{8}_[A-Za-z0-9]{24}/ },
];

const vendorKey: Detector = {
  severity: "fail",
  find: (content) => {
    for (const { kind, pattern } of KEYS) {
      const key = content.match(pattern)?.[0];
      if (key && !isPlaceholder(key)) return kind;
    }
    return undefined;
  },
};

const privateKey: Detector = {
  severity: "fail",
  find: (content) => (/-----BEGIN ([A-Z]+ )?PRIVATE KEY-----/.test(content) ? "private key" : undefined),
};

// postgres://user:password@host. Local and docker hosts and default passwords are ignored.
const CONNECTION = /\b(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\/([^:\s/@'"`]+):([^@\s'"`]+)@([^\s/:'"`?]+)/i;
const DEFAULT_PASSWORDS = new Set(["password", "pass", "postgres", "root", "secret", "admin", "test", "mysql", "mongo", "redis", "guest"]);

const connectionString: Detector = {
  severity: "fail",
  find: (content) => {
    const [, , user, password, host] = content.match(CONNECTION) ?? [];
    if (!user || !password || !host) return undefined;
    // No dot: localhost or a docker-compose service name like "db".
    if (!host.includes(".") || /^(127\.|0\.0\.0\.0)|^host\.docker\.internal$/.test(host)) return undefined;
    if (password.includes("$") || password === user || DEFAULT_PASSWORDS.has(password.toLowerCase())) return undefined;
    if (PLACEHOLDER.test(password)) return undefined;
    return "database URL with password";
  },
};

// Supabase keys are JWTs. The anon key is public by design; the service-role key bypasses security.
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/;

const supabaseServiceRole: Detector = {
  severity: "fail",
  find: (content) => {
    const payload = content.match(JWT)?.[1];
    if (!payload) return undefined;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
      return claims.role === "service_role" ? "Supabase service-role key" : undefined;
    } catch {
      return undefined;
    }
  },
};

// JWT_SECRET = "...", password: "...". A warning: tests and fixtures look the same.
const SECRET_VAR =
  /(?<![A-Za-z0-9_])([A-Za-z0-9_]*(?:secret|password|passwd|pwd|api_?key|apikey|auth_?token|access_?token|refresh_?token|private_?key)[A-Za-z0-9_]*)["']?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/i;
const NOT_FOR_SECRET_VARS = /\.(test|spec)\.|__tests__\/|(^|\/)(fixtures?|mocks?|locales?|i18n)\/|\.md$/i;

const secretVariable: Detector = {
  severity: "warn",
  find: (content, file) => {
    if (NOT_FOR_SECRET_VARS.test(file)) return undefined;
    const [, name, value] = content.match(SECRET_VAR) ?? [];
    if (!name || !value) return undefined;
    if (PLACEHOLDER.test(value) || value.includes("${") || new Set(value).size < 6) return undefined;
    if (/^[a-z]+(-[a-z]+)+$/.test(value)) return undefined; // a label like "current-password"
    if (!/[0-9!@#$%^&*()_+=/.,;:?~|-]/.test(value)) return undefined; // plain words, e.g. translations
    return `hardcoded value in ${name}`;
  },
};

// Strongest first: one finding per line.
const DETECTORS: Detector[] = [privateKey, vendorKey, supabaseServiceRole, connectionString, secretVariable];

// Cheap first pass for git grep (POSIX ERE, case-insensitive). The detectors do the exact matching.
const PREFIXES = [
  "sk-", "AKIA", "gh[pousr]_", "github_pat_", "xox[baprs]-", "[sr]k_live_", "AIza", "PRIVATE KEY-----",
  "GOCSPX-", "sb_secret_", "SG\\.", "npm_", "hf_", "gsk_", "re_", "eyJ", "://[^ ]*:[^ ]*@",
  "secret", "passw", "pwd", "api_?key", "apikey", "token", "private_?key",
].join("|");

// `lines` is git grep output: "<file>:<line>:<content>". The content is never returned.
export function findSecrets(lines: string[]): Finding[] {
  const found: Finding[] = [];

  for (const raw of lines) {
    const match = raw.match(/^(.+?):(\d+):(.*)$/);
    if (!match?.[1] || !match[2] || match[3] === undefined) continue;
    const [, file, line, content] = match;
    if (posix.basename(file) === ".env.example") continue;

    for (const detector of DETECTORS) {
      const kind = detector.find(content, file);
      if (kind) {
        found.push({ file, line: Number(line), kind, severity: detector.severity });
        break;
      }
    }
  }

  return found;
}

export async function secretsInCode(): Promise<Result> {
  // --cached: what is committed or staged. -I: skip binary files. Exit code 1 means no match.
  const grep = await execa(
    "git",
    ["grep", "--cached", "-n", "-I", "-i", "--full-name", "-E", PREFIXES, "--", ":/"],
    { lines: true, reject: false },
  );
  if (grep.exitCode !== 0 && grep.exitCode !== 1) {
    throw new Error(`git grep failed: ${grep.stderr}`);
  }
  const found = findSecrets(grep.stdout);

  if (found.length === 0) {
    return { id: "secrets-in-code", status: "pass", message: "no secrets in tracked files" };
  }

  const failing = found.some((f) => f.severity === "fail");
  const sorted = [...found.filter((f) => f.severity === "fail"), ...found.filter((f) => f.severity === "warn")];
  const shown = sorted.slice(0, 3).map((f) => `${f.file}:${f.line} (${f.kind})`);
  const more = found.length > 3 ? ` and ${found.length - 3} more` : "";

  return {
    id: "secrets-in-code",
    status: failing ? "fail" : "warn",
    message: `${shown.join(", ")}${more}`,
    hint: failing
      ? "Move each value to .env and read it from process.env. If it was ever committed, rotate the key"
      : "If these are real secrets, move them to .env and read them from process.env",
  };
}
