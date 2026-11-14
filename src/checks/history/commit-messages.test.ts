import { describe, expect, it } from "vitest";
import { isVague, judgeCommits } from "./commit-messages.js";

describe("isVague", () => {
  it("flags single words", () => {
    for (const s of ["update", "fix", "polish", "Lockfile", "wip", "."]) expect(isVague(s), s).toBe(true);
  });

  it("flags messages made only of generic words", () => {
    for (const s of ["minor changes", "fix bug", "Update code", "small fixes again", "final version"]) {
      expect(isVague(s), s).toBe(true);
    }
  });

  it("flags GitHub web editor defaults", () => {
    for (const s of ["Create script.js", "Update index.html", "Add files via upload", "Delete old.txt"]) {
      expect(isVague(s), s).toBe(true);
    }
  });

  it("judges the description after a Conventional Commits prefix", () => {
    expect(isVague("fix: update")).toBe(true);
    expect(isVague("chore(deps): bump typescript from 6.0.3 to 7.0.2")).toBe(false);
    expect(isVague("feat(auth)!: drop password login")).toBe(false);
  });

  it("accepts messages that say what changed", () => {
    for (const s of [
      "fix login redirect loop",
      "Remove unused overview capture",
      "Rename Neon Dash Game/index.html to index.html",
      "Scaffold Storefront",
      "chore:basic folder structure",
      "update README with setup steps",
    ]) {
      expect(isVague(s), s).toBe(false);
    }
  });

  it("accepts initial commits", () => {
    for (const s of ["init", "Initial commit", "first commit", "Initialize project using Create React App"]) {
      expect(isVague(s), s).toBe(false);
    }
  });
});

describe("judgeCommits", () => {
  const good = (n: number) => Array.from({ length: n }, (_, i) => `fix login bug in form ${i}`);

  it("passes with no commits", () => {
    expect(judgeCommits([])).toEqual({ id: "commit-messages", status: "pass", message: "no commits yet" });
  });

  it("passes when every message says what changed", () => {
    expect(judgeCommits(good(10)).message).toBe("all 10 recent commits say what changed");
  });

  it("says 'the only commit' for a single commit", () => {
    expect(judgeCommits(["fix login redirect loop"]).message).toBe("the only commit says what changed");
  });

  it("passes with a single vague commit, even in a small repo", () => {
    expect(judgeCommits(["Lockfile", "Scaffold Storefront", "Setup Tailwind v4", "Generate routes"])).toMatchObject({
      status: "pass",
      message: "3 of 4 recent commits say what changed",
    });
  });

  it("passes when under 20% are vague", () => {
    expect(judgeCommits([...good(18), "update", "wip"])).toMatchObject({
      status: "pass",
      message: "18 of 20 recent commits say what changed",
    });
  });

  it("warns from 20% and lists up to 3 distinct examples", () => {
    const result = judgeCommits([...good(6), "update", "update", "wip", "polish"]);
    expect(result.status).toBe("warn");
    expect(result.message).toBe('4 of 10 recent commits say nothing, e.g. "update", "wip", "polish"');
    expect(result.hint).toContain("fix login redirect loop");
  });

  it("fails when half or more are vague", () => {
    const subjects = ["Create script.js", "Create style.css", "Update index.html", "Add files via upload", "Rename a to b"];
    expect(judgeCommits(subjects)).toMatchObject({ status: "fail", message: expect.stringContaining("4 of 5") });
  });

  it("shortens long examples to 30 characters", () => {
    const long = "Update very-long-file-name-for-testing.html";
    const example = judgeCommits([long, "wip"]).message.match(/"([^"]+)"/)?.[1] ?? "";
    expect(example).toHaveLength(30);
    expect(example.endsWith("…")).toBe(true);
  });
});
