import { describe, expect, it } from "vitest";
import { findSecrets } from "./secrets-in-code.js";

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

  it("ignores .env.example", () => {
    expect(findSecrets([`api/.env.example:1:OPENAI_API_KEY=${k("sk-", "proj-", RANDOM)}`])).toEqual([]);
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

  it("skips test files, fixtures, translations and docs", () => {
    const line = `const JWT_SECRET = "${k("Zq8!", "vL2mR7")}"`;
    expect(
      findSecrets([
        `src/auth.test.ts:1:${line}`,
        `test/fixtures/users.ts:1:${line}`,
        `src/locales/en.ts:1:${line}`,
        `README.md:1:${line}`,
      ]),
    ).toEqual([]);
  });

  it("prefers a vendor key over a secret-named variable on the same line", () => {
    expect(kinds([`a.ts:1:const apiKey = "${k("sk-", "proj-", RANDOM)}"`])).toEqual(["OpenAI API key"]);
  });
});
