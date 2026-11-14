import { describe, expect, it } from "vitest";
import { envVarNames, findEnvExample } from "./env-example.js";

describe("findEnvExample", () => {
  it("finds .env.example at the root", () => {
    expect(findEnvExample(["README.md", ".env.example"])).toBe(".env.example");
  });

  it("finds .env.example in a folder", () => {
    expect(findEnvExample(["api/.env.example"])).toBe("api/.env.example");
  });

  it("returns undefined when there is none", () => {
    expect(findEnvExample(["README.md", ".env"])).toBeUndefined();
  });

  it("ignores names that only start with .env.example", () => {
    expect(findEnvExample([".env.example.bak"])).toBeUndefined();
  });
});

describe("envVarNames", () => {
  it("collects the project's own variables from Node, Vite, Deno and Python", () => {
    expect(
      envVarNames([
        "src/db.ts:const url = process.env.DATABASE_URL;",
        "src/api.ts:fetch(import.meta.env.VITE_API_URL)",
        'src/key.ts:const k = process.env["OPENAI_API_KEY"];',
        'deno/main.ts:Deno.env.get("STRIPE_SECRET")',
        'app.py:token = os.environ.get("SLACK_TOKEN")',
        "app.py:db = os.getenv('DB_PASSWORD')",
      ]),
    ).toEqual(["DATABASE_URL", "VITE_API_URL", "OPENAI_API_KEY", "STRIPE_SECRET", "SLACK_TOKEN", "DB_PASSWORD"]);
  });

  it("ignores runtime variables like PORT and NODE_ENV", () => {
    expect(
      envVarNames([
        'bin/www:var port = normalizePort(process.env.PORT || "3000");',
        'a.ts:if (process.env.NODE_ENV === "production") {}',
      ]),
    ).toEqual([]);
  });

  it("ignores docs, tests, lockfiles and .gitignore", () => {
    expect(
      envVarNames([
        "README.md:Set process.env.DATABASE_URL",
        'src/db.test.ts:process.env.DATABASE_URL = "x"',
        "package-lock.json:process.env.FOO",
        ".gitignore:# process.env.BAR",
      ]),
    ).toEqual([]);
  });

  it("lists each name once", () => {
    expect(envVarNames(["a.ts:process.env.JWT_SECRET", "b.ts:process.env.JWT_SECRET"])).toEqual(["JWT_SECRET"]);
  });
});
