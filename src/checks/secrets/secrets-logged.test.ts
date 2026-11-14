import { describe, expect, it } from "vitest";
import { findSecretLogs } from "./secrets-logged.js";

const whats = (lines: string[]) => findSecretLogs(lines).map((f) => f.what);

describe("findSecretLogs", () => {
  it("finds a logged secret env variable and reports file, line and what", () => {
    expect(findSecretLogs(["src/auth.ts:42:  console.log(process.env.JWT_SECRET);"])).toEqual([
      { file: "src/auth.ts", line: 42, what: "process.env.JWT_SECRET" },
    ]);
  });

  it("finds env variables inside template literals and import.meta.env", () => {
    expect(
      whats([
        "a.ts:1:console.info(`key is ${process.env.OPENAI_API_KEY}`)",
        "b.ts:2:console.debug('using', import.meta.env.VITE_STRIPE_SECRET)",
      ]),
    ).toEqual(["process.env.OPENAI_API_KEY", "import.meta.env.VITE_STRIPE_SECRET"]);
  });

  it("finds secret-named variables and properties", () => {
    expect(
      whats([
        'a.ts:1:console.log("token:", token)',
        "b.ts:2:console.error(user.password)",
        "c.ts:3:logger.info({ accessToken })",
        "d.js:4:console.log(`Bearer ${apiKey}`)",
        "e.ts:5:log.debug(db_password)",
      ]),
    ).toEqual(["token", "user.password", "accessToken", "apiKey", "db_password"]);
  });

  it("finds Python prints and logging", () => {
    expect(
      whats([
        'app.py:1:print(os.environ["SECRET_KEY"])',
        "app.py:2:logging.info(os.getenv('DB_PASSWORD'))",
        'app.py:3:print(f"token={api_token}")',
      ]),
    ).toEqual(["os.environ SECRET_KEY", "os.environ DB_PASSWORD", "api_token"]);
  });

  it("ignores harmless env variables and public keys", () => {
    expect(
      findSecretLogs([
        "a.ts:1:console.log(`Server on port ${process.env.PORT}`)",
        "b.ts:2:console.log(process.env.NODE_ENV)",
        "c.ts:3:console.log(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)",
      ]),
    ).toEqual([]);
  });

  it("ignores secret words inside strings and names that only start with one", () => {
    expect(
      findSecretLogs([
        'a.ts:1:console.error("Invalid password")',
        "b.ts:2:console.log('token expired, please log in again')",
        "c.ts:3:console.log(tokenCount, tokenizer, passwordStrength)",
        "d.ts:4:console.log(`${tokens.length} tokens used`)",
      ]),
    ).toEqual([]);
  });

  it("ignores logging only whether a secret is set", () => {
    expect(
      findSecretLogs([
        "a.ts:1:console.log(Boolean(process.env.API_KEY))",
        "b.ts:2:console.log(!!token)",
        "c.ts:3:console.log(typeof apiKey)",
        "d.ts:4:console.log(token.length)",
      ]),
    ).toEqual([]);
  });

  it("ignores lines without a log call, test files and docs", () => {
    expect(
      findSecretLogs([
        "a.ts:1:const secret = process.env.JWT_SECRET;",
        "src/auth.test.ts:2:console.log(process.env.JWT_SECRET)",
        "README.md:3:console.log(process.env.JWT_SECRET)",
      ]),
    ).toEqual([]);
  });
});
