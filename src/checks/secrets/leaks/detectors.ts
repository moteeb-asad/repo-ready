// Recognising secrets in one line of text. Shared by secrets-in-code (current files) and
// secrets-in-history (past commits), so a new key type or rule is added in one place.
// Detectors return what they found (the kind), never the value.
import { DOCS_PATH, isEnvExample, TEST_PATH, VENDOR_PATH } from "../paths.js";
import { KEYS } from "./key-patterns.js";

export type Severity = "fail" | "warn";
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
// Dependency lists: "@acme/secrets": "workspace:*" is a package name and a version.
const MANIFESTS = /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|composer\.json|Gemfile)$/i;
// Names that hold something about a secret, not the secret: apiKeyEnv, TOKEN_COOKIE, INVALID_TOKEN.
const NOT_A_SECRET_NAME = /(env|url|uri|cookie|header|name|field|label|prefix|path|type|cipher|hash|encrypted)$|invalid|example|dummy|mock|fake|test|sample|info/i;

const secretVariable: Detector = {
  severity: "warn",
  find: (content, file) => {
    if (TEST_PATH.test(file) || DOCS_PATH.test(file) || TRANSLATIONS.test(file) || MANIFESTS.test(file)) return undefined;
    // A comment line describes code, it doesn't hold a value: // JS, # Python, /* and * block comments.
    if (/^\s*(\/\/|#|\/\*|\*)/.test(content)) return undefined;
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

// Exact formats only: a match is a real secret unless it is a placeholder. Strongest first.
const STRONG: Detector[] = [privateKey, vendorKey, supabaseServiceRole, connectionString];
const ALL: Detector[] = [...STRONG, secretVariable];

// Cheap first pass for git grep / git log -G (POSIX ERE). The detectors do the exact matching.
export const STRONG_PREFIXES = [...KEYS.map((k) => k.prefix), "PRIVATE KEY-----", "eyJ", "://[^ ]*:[^ ]*@"].join("|");
// Also the names the secret-named-variable warning looks for. Use with case-insensitive search.
export const PREFIXES = [STRONG_PREFIXES, "secret", "passw", "pwd", "api_?key", "apikey", "token", "private_?key"].join("|");

type Place = "env-example" | "test" | "docs" | "code";
const WHERE: Record<Place, string> = { "env-example": " in .env.example", test: " in a test file", docs: " in docs", code: "" };

// Docs and .env.example are written to be read by others, and AI agents copy real values into
// them, so a real key there fails. Two cases stay warnings: test files (fakes made to look real)
// and a PRIVATE KEY header in docs (one line can't tell an example block from a real one).
function severityFor(detector: Detector, place: Place): Severity {
  if (place === "test") return "warn";
  if (place === "docs" && detector === privateKey) return "warn";
  if (place === "env-example" || place === "docs") return "fail";
  return detector.severity;
}

// What one line holds, or undefined. `strongOnly` skips the secret-named-variable warning.
// .env.example always runs the exact formats only: `JWT_SECRET=` is the point of that file.
export function detect(file: string, content: string, { strongOnly = false } = {}): { kind: string; severity: Severity } | undefined {
  if (VENDOR_PATH.test(file)) return undefined;
  const place: Place = isEnvExample(file) ? "env-example" : TEST_PATH.test(file) ? "test" : DOCS_PATH.test(file) ? "docs" : "code";

  for (const detector of strongOnly || place === "env-example" ? STRONG : ALL) {
    const kind = detector.find(content, file);
    if (kind) return { kind: `${kind}${WHERE[place]}`, severity: severityFor(detector, place) };
  }
  return undefined;
}
