import { type GrepMatch, grepTracked } from "../../../git.js";
import type { Result } from "../../../types.js";
import { DOCS_PATH, isEnvExample, TEST_PATH, VENDOR_PATH } from "../paths.js";
import { KEYS } from "./key-patterns.js";

type Severity = "fail" | "warn";
export type Finding = { file: string; line: number; kind: string; severity: Severity };

// A detector looks at one line and returns what it found (never the value), or undefined.
type Detector = { severity: Severity; find: (content: string, file: string) => string | undefined };

// Placeholders like sk-xxxxxxxx or AWS's documented AKIAIOSFODNN7EXAMPLE.
const PLACEHOLDER = /x{4,}|your|example|placeholder|dummy|fake|redacted|changeme|<|\.\.\./i;

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value) || new Set(value).size < 10;
}

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
const TRANSLATIONS = /(^|\/)(locales?|i18n)\//i;
// Names that hold something about a secret, not the secret: apiKeyEnv, TOKEN_COOKIE, INVALID_TOKEN.
const NOT_A_SECRET_NAME = /(env|url|uri|cookie|header|name|field|label|prefix|path|type|cipher|hash|encrypted)$|invalid|example|dummy|mock|fake|test|sample|info/i;

const secretVariable: Detector = {
  severity: "warn",
  find: (content, file) => {
    if (TEST_PATH.test(file) || DOCS_PATH.test(file) || TRANSLATIONS.test(file)) return undefined;
    const [, name, value] = content.match(SECRET_VAR) ?? [];
    if (!name || !value || NOT_A_SECRET_NAME.test(name)) return undefined;
    if (PLACEHOLDER.test(value) || value.includes("${") || new Set(value).size < 6) return undefined;
    if (/^[a-z]+(-[a-z]+)+$/.test(value)) return undefined; // a label like "current-password"
    if (/^[A-Z][A-Z0-9_]{2,}$/.test(value)) return undefined; // the name of an env variable: "OPENAI_API_KEY"
    if (value.includes("://")) return undefined; // a URL
    if (!/[0-9!@#$%^&*()_+=/.,;:?~|-]/.test(value)) return undefined; // plain words, e.g. translations
    return `hardcoded value in ${name}`;
  },
};

// Strongest first: one finding per line.
const DETECTORS: Detector[] = [privateKey, vendorKey, supabaseServiceRole, connectionString, secretVariable];

// Cheap first pass for git grep (POSIX ERE, case-insensitive). The detectors do the exact matching.
const PREFIXES = [
  ...KEYS.map((k) => k.prefix),
  "PRIVATE KEY-----", "eyJ", "://[^ ]*:[^ ]*@",
  "secret", "passw", "pwd", "api_?key", "apikey", "token", "private_?key",
].join("|");

// The matched content is never returned.
// Keys in tests and docs are usually fakes made to look real, so they are warnings, not failures.
export function findSecrets(matches: GrepMatch[]): Finding[] {
  const found: Finding[] = [];

  for (const { file, line, content } of matches) {
    if (isEnvExample(file) || VENDOR_PATH.test(file)) continue;
    const where = TEST_PATH.test(file) ? " in a test file" : DOCS_PATH.test(file) ? " in docs" : "";

    for (const detector of DETECTORS) {
      const kind = detector.find(content, file);
      if (kind) {
        found.push({ file, line, kind: `${kind}${where}`, severity: where ? "warn" : detector.severity });
        break;
      }
    }
  }

  return found;
}

export async function secretsInCode(): Promise<Result> {
  const found = findSecrets(await grepTracked(PREFIXES, { ignoreCase: true }));

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
      : "If these are real secrets, move them to .env and rotate them. In tests, use obviously fake values like sk-test-xxxx",
  };
}
