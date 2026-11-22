import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envInHistory, findEnvCommits } from "./env-in-history.js";

describe("findEnvCommits", () => {
  it("passes when no commit added a .env file", () => {
    expect(findEnvCommits([])).toEqual([]);
  });

  it("ignores .env.example", () => {
    expect(findEnvCommits(["@@a1b2c3d|2 days ago", "", ".env.example"])).toEqual([]);
  });

  it("finds a .env file with its commit and date", () => {
    expect(findEnvCommits(["@@a1b2c3d|3 weeks ago", "", ".env"])).toEqual([
      { file: ".env", commit: "a1b2c3d", when: "3 weeks ago" },
    ]);
  });

  it("links each file to the commit that added it", () => {
    const lines = [
      "@@1111111|1 day ago",
      "",
      "api/.env.local",
      "@@2222222|5 months ago",
      "",
      ".env",
      ".env.example",
    ];
    expect(findEnvCommits(lines)).toEqual([
      { file: "api/.env.local", commit: "1111111", when: "1 day ago" },
      { file: ".env", commit: "2222222", when: "5 months ago" },
    ]);
  });
});

// envInHistory() against real temp repos. execa is wrapped so a test can fake one git log failure.
vi.mock("execa", async (importOriginal) => {
  const real = await importOriginal<typeof import("execa")>();
  return { ...real, execa: vi.fn(real.execa) };
});
const realExeca = (await vi.importActual<typeof import("execa")>("execa")).execa;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });

describe("envInHistory", { timeout: 30_000 }, () => {
  const home = process.cwd();
  const dirs: string[] = [];
  const newDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "rr-env-"));
    dirs.push(dir);
    return dir;
  };
  const emptyRepo = () => {
    const dir = newDir();
    git(dir, "init", "-q");
    return dir;
  };

  afterEach(() => {
    process.chdir(home);
    vi.mocked(execa).mockImplementation(realExeca as never);
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  it("passes in a repo with no commits", async () => {
    process.chdir(emptyRepo());
    expect(await envInHistory()).toMatchObject({ status: "pass", message: "no .env file in git history" });
  });

  it("warns instead of passing in a shallow clone", async () => {
    // .env added and deleted in old commits; a depth-1 clone only has the last one.
    const full = emptyRepo();
    writeFileSync(join(full, ".env"), "PORT=3000\n");
    git(full, "add", ".");
    git(full, "commit", "-qm", "chore: add env");
    git(full, "rm", "-q", ".env");
    git(full, "commit", "-qm", "chore: remove env");
    const shallow = join(newDir(), "clone");
    git(home, "clone", "-q", "--depth", "1", `file://${full.replace(/\\/g, "/")}`, shallow);
    process.chdir(shallow);
    expect(await envInHistory()).toMatchObject({
      status: "warn",
      message: "skipped: shallow clone, older commits are not on this machine",
    });
  });

  it("warns instead of passing when git log fails", async () => {
    process.chdir(emptyRepo());
    vi.mocked(execa).mockImplementation(((file: string, args: string[], options: object) =>
      args[0] === "log"
        ? Promise.resolve({ failed: true, exitCode: 128, stdout: [] })
        : realExeca(file, args, options)) as never);
    expect(await envInHistory()).toMatchObject({ status: "warn", message: "skipped: git log failed (exit code 128)" });
  });
});
