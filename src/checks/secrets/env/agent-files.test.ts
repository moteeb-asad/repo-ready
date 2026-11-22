import { describe, expect, it } from "vitest";
import { claudeFolders, findLocalAgentFiles, ignoredByRepo, judgeAgentFiles, parseHistory } from "./agent-files.js";

describe("findLocalAgentFiles", () => {
  it("finds local agent files at the root and in folders", () => {
    expect(
      findLocalAgentFiles([".claude/settings.local.json", "apps/web/.claude/settings.local.json", "CLAUDE.local.md"]),
    ).toEqual([".claude/settings.local.json", "apps/web/.claude/settings.local.json", "CLAUDE.local.md"]);
  });

  it("ignores the shared agent files", () => {
    expect(findLocalAgentFiles([".claude/settings.json", "CLAUDE.md", ".claude/commands/deploy.md"])).toEqual([]);
  });
});

describe("claudeFolders", () => {
  it("finds folders with a tracked .claude/ folder or CLAUDE.md", () => {
    expect(claudeFolders([".claude/settings.json", "apps/api/CLAUDE.md", "src/a.ts"])).toEqual(["", "apps/api/"]);
  });

  it("returns nothing for a repo that does not use Claude Code", () => {
    expect(claudeFolders(["src/a.ts", "README.md"])).toEqual([]);
  });
});

describe("ignoredByRepo", () => {
  it("accepts a rule from the repo's .gitignore", () => {
    expect(ignoredByRepo(".gitignore:1:.claude/settings.local.json\t.claude/settings.local.json")).toBe(true);
    expect(ignoredByRepo("apps/web/.gitignore:4:settings.local.json\tapps/web/.claude/settings.local.json")).toBe(true);
  });

  it("does not accept the global ignore file or .git/info/exclude", () => {
    expect(
      ignoredByRepo('"C:\\\\Users\\\\ONE/.config/git/ignore":1:**/.claude/settings.local.json\t.claude/settings.local.json'),
    ).toBe(false);
    expect(ignoredByRepo("/home/me/.config/git/ignore:1:**/.claude/settings.local.json\t.claude/settings.local.json")).toBe(false);
    expect(ignoredByRepo(".git/info/exclude:2:.claude/\t.claude/settings.local.json")).toBe(false);
  });

  it("is false when nothing ignores the file", () => {
    expect(ignoredByRepo("")).toBe(false);
  });
});

describe("parseHistory", () => {
  it("links each local agent file to the commit that added it", () => {
    expect(parseHistory(["@@a1b2c3d|3 weeks ago", "", ".claude/settings.local.json", "src/a.ts"])).toEqual([
      { file: ".claude/settings.local.json", commit: "a1b2c3d", when: "3 weeks ago" },
    ]);
  });
});

describe("judgeAgentFiles", () => {
  const none = { tracked: [], inHistory: [], notIgnored: [], historySkipped: undefined };

  it("warns instead of passing when the history was not read", () => {
    expect(judgeAgentFiles({ ...none, historySkipped: "shallow clone" })).toMatchObject({
      status: "warn",
      message: "no local AI agent files tracked, history not checked: shallow clone",
      hint: "In GitHub Actions, set fetch-depth: 0 on actions/checkout. Locally, run git fetch --unshallow",
    });
    expect(judgeAgentFiles({ ...none, historySkipped: "git log failed (exit code 128)" })).toMatchObject({
      status: "warn",
      hint: "Run git log --all in this folder to see the error",
    });
  });

  it("still fails for a tracked file in a shallow clone", () => {
    expect(judgeAgentFiles({ ...none, tracked: ["CLAUDE.local.md"], historySkipped: "shallow clone" })).toMatchObject({ status: "fail" });
  });

  it("passes when nothing is tracked and the file is ignored by the repo", () => {
    expect(judgeAgentFiles(none)).toEqual({ id: "agent-files", status: "pass", message: "no local AI agent files tracked" });
  });

  it("fails when a local agent file is tracked", () => {
    expect(judgeAgentFiles({ ...none, tracked: [".claude/settings.local.json"] })).toMatchObject({
      status: "fail",
      message: "tracked by git: .claude/settings.local.json",
      hint: expect.stringContaining("git rm --cached .claude/settings.local.json"),
    });
  });

  it("fails when one was committed before, even if deleted since", () => {
    const inHistory = [{ file: ".claude/settings.local.json", commit: "a1b2c3d", when: "2 months ago" }];
    expect(judgeAgentFiles({ ...none, inHistory })).toMatchObject({
      status: "fail",
      message: "committed in history: .claude/settings.local.json (a1b2c3d, 2 months ago)",
      hint: expect.stringContaining("Rotate every secret"),
    });
  });

  it("warns when only a global ignore protects it", () => {
    expect(judgeAgentFiles({ ...none, notIgnored: [".claude/settings.local.json"] })).toMatchObject({
      status: "warn",
      message: ".claude/settings.local.json is not in .gitignore (a global ignore only protects your machine)",
    });
  });
});
