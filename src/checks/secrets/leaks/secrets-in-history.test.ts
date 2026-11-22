import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findInHistory, judgeHistory, secretsInHistory } from "./secrets-in-history.js";

// Fake keys are built from parts so this file never contains a full key pattern.
const k = (...parts: string[]) => parts.join("");
const KEY = k("sk-", "proj-", "Q7v2Lm9XkR4tB8nZ3pW6yH1cJ5dF0gSaUx");

// git log -p --unified=0 output for one commit that adds `added` to `file`.
function commit(hash: string, when: string, file: string, added: string[], deleted = false): string[] {
  return [
    `##RR## ${hash}|${when}`,
    "",
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    deleted ? "+++ /dev/null" : `+++ b/${file}`,
    "@@ -0,0 +1 @@",
    ...added.map((a) => `+${a}`),
  ];
}

describe("findInHistory", () => {
  it("finds a key in a doc that was deleted later", () => {
    const lines = [
      ...commit("2222222", "1 month ago", "docs/ci-setup.md", ["text"]),
      ...commit("1111111", "4 months ago", "docs/ci-setup.md", [`export OPENAI_API_KEY=${KEY}`]),
    ];
    expect(findInHistory(lines, new Set())).toEqual([
      { file: "docs/ci-setup.md", commit: "1111111", when: "4 months ago", kind: "OpenAI API key in docs", severity: "fail" },
    ]);
  });

  it("only looks at added lines, not removed ones", () => {
    const lines = [`##RR## 3333333|1 day ago`, "+++ b/src/a.ts", `-const key = "${KEY}"`];
    expect(findInHistory(lines, new Set())).toEqual([]);
  });

  it("skips keys still in today's files: secrets-in-code reports those", () => {
    const line = `const key = "${KEY}"`;
    const lines = commit("1111111", "2 days ago", "src/a.ts", [line]);
    expect(findInHistory(lines, new Set([`src/a.ts\0${line}`]))).toEqual([]);
  });

  it("skips .env files: env-in-history reports those", () => {
    expect(findInHistory(commit("1111111", "1 day ago", ".env", [`OPENAI_API_KEY=${KEY}`]), new Set())).toEqual([]);
  });

  it("skips the deleted side of a diff", () => {
    expect(findInHistory(commit("1111111", "1 day ago", "src/a.ts", [KEY], true), new Set())).toEqual([]);
  });

  it("reports each key type once per file, at the newest commit", () => {
    const lines = [
      ...commit("2222222", "1 week ago", "src/a.ts", [`const k = "${KEY}"`]),
      ...commit("1111111", "1 year ago", "src/a.ts", [`const k = "${KEY}"`]),
    ];
    expect(findInHistory(lines, new Set()).map((f) => f.commit)).toEqual(["2222222"]);
  });

  it("only uses exact formats, not the secret-named-variable warning", () => {
    expect(findInHistory(commit("1111111", "1 day ago", "src/a.ts", ['const JWT_SECRET = "Zq8!vL2mR7"']), new Set())).toEqual([]);
  });

  it("warns, not fails, for keys in test files", () => {
    expect(findInHistory(commit("1111111", "1 day ago", "src/a.test.ts", [KEY]), new Set())[0]?.severity).toBe("warn");
  });
});

describe("judgeHistory", () => {
  it("passes when nothing was found", () => {
    expect(judgeHistory([])).toEqual({ id: "secrets-in-history", status: "pass", message: "no secrets in git history" });
  });

  it("fails and lists file, kind, commit and age, never the value", () => {
    const result = judgeHistory([
      { file: "docs/ci-setup.md", commit: "1111111", when: "4 months ago", kind: "OpenAI API key in docs", severity: "fail" },
    ]);
    expect(result).toMatchObject({
      status: "fail",
      message: "docs/ci-setup.md (OpenAI API key in docs, 1111111, 4 months ago)",
      hint: "Rotate each key: it is still readable in git history. Deleting the file or line does not help",
    });
  });
});

// secretsInHistory() against real temp repos. execa is wrapped so a test can fake one git log failure.
vi.mock("execa", async (importOriginal) => {
  const real = await importOriginal<typeof import("execa")>();
  return { ...real, execa: vi.fn(real.execa) };
});
const realExeca = (await vi.importActual<typeof import("execa")>("execa")).execa;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });

describe("secretsInHistory", { timeout: 30_000 }, () => {
  const home = process.cwd();
  const dirs: string[] = [];
  const newDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "rr-hist-"));
    dirs.push(dir);
    return dir;
  };
  const emptyRepo = () => {
    const dir = newDir();
    git(dir, "init", "-q");
    return dir;
  };
  // A key added to docs/setup.md in the first commit and deleted in the second.
  const deletedKeyRepo = () => {
    const dir = emptyRepo();
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "setup.md"), `export OPENAI_API_KEY=${KEY}\n`);
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "docs: add setup");
    writeFileSync(join(dir, "docs", "setup.md"), "export OPENAI_API_KEY=\n");
    git(dir, "commit", "-qam", "docs: remove key");
    return dir;
  };
  // Fakes the git log result; every other git call runs for real.
  const failLog = (result: object) =>
    vi.mocked(execa).mockImplementation(((file: string, args: string[], options: object) =>
      args[0] === "log"
        ? Promise.resolve({ failed: true, timedOut: false, isMaxBuffer: false, exitCode: 128, stdout: [], ...result })
        : realExeca(file, args, options)) as never);

  afterEach(() => {
    process.chdir(home);
    vi.mocked(execa).mockImplementation(realExeca as never);
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  it("passes in a repo with no commits", async () => {
    process.chdir(emptyRepo());
    expect(await secretsInHistory()).toMatchObject({ status: "pass", message: "no secrets in git history" });
  });

  it("fails for a key that a later commit deleted", async () => {
    process.chdir(deletedKeyRepo());
    const result = await secretsInHistory();
    expect(result).toMatchObject({ status: "fail" });
    expect(result.message).toContain("docs/setup.md (OpenAI API key in docs,");
    expect(result.message).not.toContain(KEY);
  });

  it("warns instead of passing in a shallow clone", async () => {
    const shallow = join(newDir(), "clone");
    git(home, "clone", "-q", "--depth", "1", `file://${deletedKeyRepo().replace(/\\/g, "/")}`, shallow);
    process.chdir(shallow);
    expect(await secretsInHistory()).toMatchObject({
      status: "warn",
      message: "skipped: shallow clone, older commits are not on this machine",
    });
  });

  it("warns instead of passing when git log fails", async () => {
    process.chdir(emptyRepo());
    failLog({});
    expect(await secretsInHistory()).toMatchObject({ status: "warn", message: "skipped: git log failed (exit code 128)" });
  });

  it("warns instead of passing when the output is too large", async () => {
    process.chdir(emptyRepo());
    failLog({ isMaxBuffer: true });
    expect(await secretsInHistory()).toMatchObject({ status: "warn", message: "skipped: history too large to scan" });
  });
});
