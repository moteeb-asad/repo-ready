import { describe, expect, it } from "vitest";
import { type GrepMatch, parseGrepLine } from "../../../git.js";
import { findSecrets as findInMatches } from "./secrets-in-code.js";

// Test cases are written as git grep output lines: "<file>:<line>:<content>".
const findSecrets = (lines: string[]) => findInMatches(lines.map(parseGrepLine) as GrepMatch[]);

// Fake secrets are built from parts (or encoded at runtime) so this file never contains
// a full secret pattern. Otherwise repo-ready would flag its own tests.
const k = (...parts: string[]) => parts.join("");
const RANDOM = "Q7v2Lm9XkR4tB8nZ3pW6yH1cJ5dF0gSa";
const kinds = (lines: string[]) => findSecrets(lines).map((f) => f.kind);

function jwt(claims: object): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.${RANDOM}`;
}

describe("findSecrets: vendor keys", () => {
  it("finds an OpenAI key and reports file, line, kind and severity only", () => {
    const lines = [`src/config.ts:12:const key = "${k("sk-", "proj-", RANDOM, "Ux")}";`];
    expect(findSecrets(lines)).toEqual([
      { file: "src/config.ts", line: 12, kind: "OpenAI API key", severity: "fail" },
    ]);
  });

  it("labels Anthropic keys as Anthropic, not OpenAI", () => {
    expect(kinds([`api/llm.js:3:apiKey: "${k("sk-", "ant-", "api03-", RANDOM)}"`])).toEqual(["Anthropic API key"]);
  });

  it("finds AWS, GitHub, Slack, Stripe and Google keys", () => {
    expect(
      kinds([
        `a.ts:1:${k("AKIA", "Q7V2LM9XKR4TB8NZ")}`,
        `b.ts:2:${k("ghp", "_", RANDOM, "Ab12")}`,
        `c.ts:3:${k("xoxb", "-", "1234567890-", RANDOM)}`,
        `d.ts:4:${k("sk", "_live_", RANDOM)}`,
        `e.ts:5:${k("AIza", "Sy", RANDOM, "c1d")}`,
      ]),
    ).toEqual(["AWS access key", "GitHub token", "Slack token", "Stripe live key", "Google API key"]);
  });

  it("finds Supabase, SendGrid, npm, Hugging Face, Groq, Google OAuth and Resend keys", () => {
    expect(
      kinds([
        `a.ts:1:${k("sb_", "secret_", RANDOM)}`,
        `b.ts:2:${k("SG", ".", RANDOM.slice(0, 22), ".", RANDOM, "Ab3dE6gH9jK")}`,
        `c.ts:3:${k("npm", "_", RANDOM, "Zq12")}`,
        `d.ts:4:${k("hf", "_", RANDOM, "Zq")}`,
        `e.ts:5:${k("gsk", "_", RANDOM, "Zq1w2e3r4t5y6u7i8o9p")}`,
        `f.ts:6:${k("GOCSPX", "-", RANDOM.slice(0, 28))}`,
        `g.ts:7:${k("re", "_", "Ab12Cd34", "_", RANDOM.slice(0, 24))}`,
      ]),
    ).toEqual([
      "Supabase secret key",
      "SendGrid API key",
      "npm token",
      "Hugging Face token",
      "Groq API key",
      "Google OAuth client secret",
      "Resend API key",
    ]);
  });

  it("finds a private key header", () => {
    expect(kinds([`deploy/id_rsa:1:${k("-----BEGIN RSA ", "PRIVATE KEY-----")}`])).toEqual(["private key"]);
  });

  it("ignores placeholders", () => {
    expect(
      findSecrets([
        `a.ts:1:OPENAI_API_KEY=${k("sk-", "x".repeat(40))}`,
        `b.ts:2:key: "${k("sk-", "your-openai-key-goes-here-1234567890")}"`,
        `c.md:3:${k("AKIA", "IOSFODNN7EXAMPLE")}`,
      ]),
    ).toEqual([]);
  });

  it("ignores words that only contain a prefix", () => {
    expect(
      findSecrets([
        ".gitignore:28:# https://gruntjs.com/creating-plugins#storing-task-files",
        `src/a.ts:4:const disk-${RANDOM} = 1`,
        "src/b.ts:9:const stripeTest = 'sk_test_only'",
        "src/c.ts:2:const re_render_component_now = true",
      ]),
    ).toEqual([]);
  });

  it("fails on a real key in .env.example and its variants", () => {
    for (const file of ["api/.env.example", ".env.local.example", ".env.sample", ".env.template"]) {
      expect(findSecrets([`${file}:1:OPENAI_API_KEY=${k("sk-", "proj-", RANDOM)}`]), file).toEqual([
        { file, line: 1, kind: "OpenAI API key in .env.example", severity: "fail" },
      ]);
    }
  });

  it("fails on a real database URL in .env.example", () => {
    const url = k("postgres", "://", "app:Zq8vL2mR7x", "@", "db.abc123.supabase.co:5432/app");
    expect(findSecrets([`.env.example:3:DATABASE_URL=${url}`])).toEqual([
      { file: ".env.example", line: 3, kind: "database URL with password in .env.example", severity: "fail" },
    ]);
  });

  it("allows placeholders, empty values and local URLs in .env.example", () => {
    expect(
      findSecrets([
        ".env.example:1:OPENAI_API_KEY=",
        `.env.example:2:OPENAI_API_KEY=${k("sk-", "x".repeat(40))}`,
        `.env.example:3:ANTHROPIC_API_KEY=${k("sk-", "ant-", "your-key-here-1234567890abcdefghij")}`,
        ".env.example:4:DATABASE_URL=postgres://user:password@localhost:5432/app",
        ".env.example:5:JWT_SECRET=change-me",
        `.env.example:6:JWT_SECRET="${k("Zq8!", "vL2mR7")}"`,
      ]),
    ).toEqual([]);
  });

  it("warns for keys in test files, fails for keys in docs, and says where", () => {
    const key = k("ghp", "_", RANDOM, "Ab12");
    expect(findSecrets([`src/feedback.test.ts:107:${key}`, `docs/setup.mdx:80:${key}`])).toEqual([
      { file: "src/feedback.test.ts", line: 107, kind: "GitHub token in a test file", severity: "warn" },
      { file: "docs/setup.mdx", line: 80, kind: "GitHub token in docs", severity: "fail" },
    ]);
  });

  it("fails for real keys and database URLs in docs and reports an AI agent wrote", () => {
    const url = k("postgres", "://", "app:Zq8vL2mR7x", "@", "db.abc123.supabase.co:5432/app");
    expect(
      findSecrets([
        `docs/ci-setup.md:12:export OPENAI_API_KEY=${k("sk-", "proj-", RANDOM)}`,
        `TASK_REPORT.md:30:DATABASE_URL=${url}`,
        `notes/configured.txt:4:${k("AKIA", "Q7V2LM9XKR4TB8NZ")}`,
      ]).map((f) => `${f.kind} ${f.severity}`),
    ).toEqual(["OpenAI API key in docs fail", "database URL with password in docs fail", "AWS access key in docs fail"]);
  });

  it("only warns for a PRIVATE KEY header in docs: one line can't tell an example from a real key", () => {
    expect(findSecrets([`docs/other-git.mdx:80:${k("-----BEGIN RSA ", "PRIVATE KEY-----")}`])).toEqual([
      { file: "docs/other-git.mdx", line: 80, kind: "private key in docs", severity: "warn" },
    ]);
  });

  it("still ignores placeholders in docs", () => {
    expect(
      findSecrets([
        `README.md:40:OPENAI_API_KEY=${k("sk-", "x".repeat(40))}`,
        `docs/setup.md:8:${k("AKIA", "IOSFODNN7EXAMPLE")}`,
        "docs/setup.md:9:DATABASE_URL=postgres://user:password@localhost:5432/app",
      ]),
    ).toEqual([]);
  });

  it("skips patches, minified bundles and vendored code", () => {
    const key = k("ghp", "_", RANDOM, "Ab12");
    expect(findSecrets([`a.patch:6:${key}`, `static/pdf.worker.min.mjs:28:${key}`, `vendor/lib.js:1:${key}`])).toEqual([]);
  });

  it("reports one finding per line", () => {
    expect(findSecrets([`a.ts:7:${k("sk-", "ant-", RANDOM)} ${k("AKIA", "Q7V2LM9XKR4TB8NZ")}`])).toHaveLength(1);
  });
});

describe("findSecrets: database URLs", () => {
  const url = (user: string, pass: string, host: string) => k("postgres", "://", user, ":", pass, "@", host, ":5432/app");

  it("finds a connection string with a real password on a real host", () => {
    expect(findSecrets([`src/db.ts:3:const db = "${url("admin", "Zq8!vL2mR7", "db.abc123.supabase.co")}"`])).toEqual([
      { file: "src/db.ts", line: 3, kind: "database URL with password", severity: "fail" },
    ]);
  });

  it("finds mongodb+srv and redis URLs", () => {
    expect(
      kinds([
        `a.ts:1:${k("mongodb+srv", "://", "app:Zq8vL2mR7x", "@", "cluster0.ab1cd.mongodb.net")}`,
        `b.ts:2:${k("rediss", "://", "default:Zq8vL2mR7x", "@", "eu1.upstash.io")}`,
      ]),
    ).toEqual(["database URL with password", "database URL with password"]);
  });

  it("ignores localhost, docker service names and default or placeholder passwords", () => {
    expect(
      findSecrets([
        `a.ts:1:${url("admin", "Zq8vL2mR7x", "localhost")}`,
        `b.ts:2:${url("admin", "Zq8vL2mR7x", "127.0.0.1")}`,
        `c.yml:3:${url("postgres", "postgres", "db")}`,
        `d.ts:4:${url("user", "password", "db.example.com")}`,
        `e.ts:5:${url("app", "${DB_PASSWORD}", "db.prod.internal")}`,
      ]),
    ).toEqual([]);
  });
});

describe("findSecrets: Supabase JWTs", () => {
  it("finds the service-role key", () => {
    expect(kinds([`src/admin.ts:2:createClient(url, "${jwt({ role: "service_role", iss: "supabase" })}")`])).toEqual([
      "Supabase service-role key",
    ]);
  });

  it("ignores the anon key, which is public by design", () => {
    expect(findSecrets([`src/client.ts:2:createClient(url, "${jwt({ role: "anon", iss: "supabase" })}")`])).toEqual([]);
  });
});

describe("findSecrets: secret-named variables", () => {
  it("warns about a literal assigned to a secret-named variable", () => {
    expect(findSecrets([`src/auth.ts:5:const JWT_SECRET = "${k("mysuper", "secret", "key123")}";`])).toEqual([
      { file: "src/auth.ts", line: 5, kind: "hardcoded value in JWT_SECRET", severity: "warn" },
    ]);
  });

  it("covers object keys and other names", () => {
    expect(
      kinds([
        `a.ts:1:  password: "${k("Zq8!", "vL2m")}",`,
        `b.py:2:CLIENT_SECRET = '${k("a8f3", "c91e", "7b2d")}'`,
        `c.js:3:const apiKey = "${k("live", "-", "9f8e7d6c")}"`,
      ]),
    ).toEqual(["hardcoded value in password", "hardcoded value in CLIENT_SECRET", "hardcoded value in apiKey"]);
  });

  it("ignores env lookups, placeholders, labels, plain words and short values", () => {
    expect(
      findSecrets([
        "a.ts:1:const JWT_SECRET = process.env.JWT_SECRET;",
        `b.ts:2:const password = "${k("your-", "password-here")}"`,
        `c.tsx:3:<input autoComplete="current-password" />`,
        `d.tsx:4:password: "${k("current", "-password")}",`,
        `e.json:5:"password": "Contraseña",`,
        `f.ts:6:const secret = "${k("abc", "12")}"`,
        "g.ts:7:const token = `Bearer ${token}`",
      ]),
    ).toEqual([]);
  });

  it("skips test files, fixtures, sample data, translations and docs", () => {
    const line = `const JWT_SECRET = "${k("Zq8!", "vL2mR7")}"`;
    expect(
      findSecrets([
        `src/auth.test.ts:1:${line}`,
        `test/fixtures/users.ts:1:${line}`,
        `apps/shop/e2e/support.ts:1:${line}`,
        `backend/cmd/worker_test.go:1:${line}`,
        `scripts/test_setup.py:1:${line}`,
        `src/assets/dummyData.js:1:${line}`,
        `src/locales/en.ts:1:${line}`,
        `README.md:1:${line}`,
      ]),
    ).toEqual([]);
  });

  it("ignores secret-named variables in comment lines", () => {
    const value = k("Zq8!", "vL2mR7");
    expect(
      findSecrets([
        `src/a.ts:73:// Dependency lists: "@acme/secrets": "${value}" is a package name.`,
        `app.py:2:# JWT_SECRET = "${value}"`,
        `src/b.ts:3: * password: "${value}"`,
      ]),
    ).toEqual([]);
  });

  it("still finds a real key in a comment line", () => {
    expect(findSecrets([`src/a.ts:1:// old key: ${k("sk-", "proj-", RANDOM)}`])).toEqual([
      { file: "src/a.ts", line: 1, kind: "OpenAI API key", severity: "fail" },
    ]);
  });

  it("ignores dependency names in package manifests", () => {
    expect(findSecrets(['backend/runner/package.json:37:    "@novadeck/secrets": "workspace:*",'])).toEqual([]);
  });

  it("ignores names that hold something about a secret, not the secret", () => {
    expect(
      findSecrets([
        'a.ts:1:const apiKeyEnv = "OPENAI_API_KEY",',
        'b.ts:2:const apiKeyUrl = "https://platform.openai.com/api-keys",',
        `c.ts:3:const REFRESH_TOKEN_COOKIE = "${k("refresh", "_token_v2")}";`,
        `d.ts:4:const INVALID_OAUTH_TOKEN = "${k("abc123", "!xyz")}";`,
        `e.js:5:const PROXY_PASSWORD_CIPHER = "${k("Zq8!", "vL2mR7x")}";`,
        `f.ts:6:const HKDF_INFO_AUTH_TOKEN = "${k("sync-", "auth-v1")}";`,
      ]),
    ).toEqual([]);
  });

  it("prefers a vendor key over a secret-named variable on the same line", () => {
    expect(kinds([`a.ts:1:const apiKey = "${k("sk-", "proj-", RANDOM)}"`])).toEqual(["OpenAI API key"]);
  });
});

describe("findSecrets: Azure Storage connection strings", () => {
  // 86 base64 characters and "==", the length of a real account key.
  const ACCOUNT_KEY = `${(RANDOM + RANDOM + RANDOM).slice(0, 86)}==`;
  const connection = (account: string) =>
    k("DefaultEndpointsProtocol=https;AccountName=", account, ";AccountKey=", ACCOUNT_KEY, ";EndpointSuffix=core.windows.net");

  it("finds an account key in a connection string", () => {
    expect(kinds([`appsettings.json:4:"Storage": "${connection("acmeprod")}"`])).toEqual(["Azure Storage account key"]);
  });

  it("ignores the Azurite emulator account and placeholders", () => {
    expect(kinds([`a.json:1:"${connection("devstoreaccount1")}"`, `b.json:1:"${connection("youraccount")}"`])).toEqual([]);
  });
});

describe("findSecrets: Azure AD client secrets", () => {
  // 3 characters, a digit, "Q~", then 31-34 more: 40 characters in all.
  const CLIENT_SECRET = k("aB3", "8Q~", RANDOM.slice(0, 34));

  it("finds a client secret, for example in an app registration config", () => {
    expect(kinds([`appsettings.json:6:"ClientSecret": "${CLIENT_SECRET}"`])).toEqual(["Azure AD client secret"]);
    expect(kinds([`deploy.sh:2:az login --service-principal -u app -p ${CLIENT_SECRET} --tenant acme`])).toEqual([
      "Azure AD client secret",
    ]);
  });

  it("ignores placeholders, short values and Q~ inside longer words", () => {
    expect(
      kinds([
        `a.json:1:"value": "${k("abc", "1Q~", "x".repeat(34))}"`,
        `b.json:2:"value": "${k("aB3", "8Q~", "Q7v2Lm9X")}"`,
        `c.txt:3:${k("prefix", "aB3", "8Q~", RANDOM.slice(0, 34))}`,
      ]),
    ).toEqual([]);
  });
});

describe("findSecrets: secrets in commands", () => {
  const PASSWORD = k("Tr0ub4", "dor!9x");
  const TOKEN = k("ghx9", RANDOM);

  it("finds passwords passed to psql and mysql", () => {
    expect(
      kinds([
        `.claude/settings.local.json:5:"Bash(PGPASSWORD=${PASSWORD} psql -h db.acme.io -U app)"`,
        `scripts/backup.sh:2:MYSQL_PWD='${PASSWORD}' mysqldump -h db.acme.io -u app shop > shop.sql`,
        `scripts/seed.sh:3:mysql -h db.acme.io -u app -p${PASSWORD} shop < seed.sql`,
        `scripts/seed.sh:4:mysql --host=db.acme.io --user=app --password=${PASSWORD} shop`,
      ]),
    ).toEqual(Array(4).fill("password in a command"));
  });

  it("finds a bearer token in a curl command", () => {
    expect(kinds([`docs/api.md:7:curl -H "Authorization: Bearer ${TOKEN}" https://api.acme.io/v1/me`])).toEqual([
      "bearer token in docs",
    ]);
  });

  it("ignores variables, placeholders, defaults and a bare -p prompt", () => {
    expect(
      kinds([
        `a.sh:1:PGPASSWORD=$DB_PASSWORD psql -U app`,
        `b.sh:2:PGPASSWORD=postgres psql -h localhost`,
        `c.sh:3:mysql -u root -p shop`,
        `d.md:4:curl -H "Authorization: Bearer YOUR_API_TOKEN" https://api.acme.io`,
        `e.md:5:curl -H "Authorization: Bearer <token>" https://api.acme.io`,
        "f.ts:6:headers: { Authorization: `Bearer ${token}` }",
        `g.sh:7:MYSQL_PWD="\${MYSQL_PASSWORD}" mysql -h db.acme.io -u app`,
      ]),
    ).toEqual([]);
  });

  it("ignores passwords for a local database: no host, localhost or a docker service", () => {
    expect(
      kinds([
        `.github/workflows/ci.yml:9:--health-cmd="mysqladmin ping -uroot -p${PASSWORD}"`,
        `a.sh:1:PGPASSWORD=${PASSWORD} psql -h localhost -U app`,
        `b.sh:2:mysql -h db -u app -p${PASSWORD}`,
        `c.sh:3:mysql -h 127.0.0.1 -u app -p${PASSWORD}`,
      ]),
    ).toEqual([]);
  });
});
