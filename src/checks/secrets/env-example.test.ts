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

  it("ignores reads with a default, which are optional", () => {
    expect(
      envVarNames([
        'a.ts:const port = process.env.API_PORT || "3000";',
        "b.ts:const region = process.env.AWS_REGION ?? DEFAULT_REGION;",
        'c.ts:const t = Deno.env.get("TIMEOUT_MS") ?? "500";',
        'app.py:jar = os.environ.get("DBLOG_DEMO_JAR", "demo.jar")',
        "app.py:level = os.getenv('LOG_LEVEL', 'info')",
        "src/github.ts:const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;",
      ]),
    ).toEqual([]);
  });

  it("still counts reads without a default, and a comma that only separates arguments", () => {
    expect(
      envVarNames([
        "src/app.ts:const name = process.env.APP_NAME;",
        "src/db.ts:connect(process.env.DATABASE_URL, { ssl: true })",
        'app.py:key = os.environ["SECRET_KEY"]',
      ]),
    ).toEqual(["APP_NAME", "DATABASE_URL", "SECRET_KEY"]);
  });

  it("treats a bare Python .get / getenv as optional, unless the name looks required", () => {
    expect(
      envVarNames([
        'lib.py:override = os.environ.get("DBLOG_COMPOSE_PROJECT_NAME")',
        'lib.py:override = os.environ.get("DBLOG_CONTROL_PLANE_PORT")',
        'lib.py:jar = os.environ.get("DBLOG_DEMO_JAR")',
        'app.py:client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))',
        'app.py:engine = create_engine(os.environ.get("DATABASE_URL"))',
        'app.py:mode = os.environ["APP_MODE"]',
      ]),
    ).toEqual(["OPENAI_API_KEY", "DATABASE_URL", "APP_MODE"]);
  });

  it("counts a variable as required if any read has no default", () => {
    expect(
      envVarNames(['a.ts:const u = process.env.API_URL || "http://localhost";', "b.ts:fetch(process.env.API_URL)"]),
    ).toEqual(["API_URL"]);
  });

  it("lists each name once", () => {
    expect(envVarNames(["a.ts:process.env.JWT_SECRET", "b.ts:process.env.JWT_SECRET"])).toEqual(["JWT_SECRET"]);
  });
});
