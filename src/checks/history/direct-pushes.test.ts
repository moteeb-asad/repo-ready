import { describe, expect, it } from "vitest";
import { type Commit, ago, firstParentChain, judgeDirectPushes } from "./direct-pushes.js";

// A linear history c0 <- c1 <- ... <- c(n-1), newest last. viaPr[i] says if commit i came through a PR.
function linear(viaPr: boolean[]): Commit[] {
  return viaPr.map((v, i) => ({ oid: `c${i}`, parent: i === 0 ? undefined : `c${i - 1}`, viaPr: v }));
}

describe("firstParentChain", () => {
  it("follows the first parent from the tip, newest first", () => {
    const commits = linear([false, true, true]);
    expect(firstParentChain(commits, "c2", 10).map((c) => c.oid)).toEqual(["c2", "c1", "c0"]);
  });

  it("skips commits that only came in through a merge's second parent", () => {
    const commits: Commit[] = [
      { oid: "m", parent: "a", viaPr: true }, // merge commit on main; second parent "f" not followed
      { oid: "f", parent: "a", viaPr: false }, // pushed directly to develop
      { oid: "a", parent: undefined, viaPr: false },
    ];
    expect(firstParentChain(commits, "m", 10).map((c) => c.oid)).toEqual(["m", "a"]);
  });

  it("stops at the limit", () => {
    expect(firstParentChain(linear(Array(50).fill(true)), "c49", 30)).toHaveLength(30);
  });
});

describe("ago", () => {
  const now = Date.parse("2026-11-14T00:00:00Z");
  it("formats days, months and years", () => {
    expect(ago("2026-11-14T00:00:00Z", now)).toBe("today");
    expect(ago("2026-11-11T00:00:00Z", now)).toBe("3 days ago");
    expect(ago("2026-07-14T00:00:00Z", now)).toBe("4 months ago");
    expect(ago("2024-11-14T00:00:00Z", now)).toBe("2 years ago");
  });
});

describe("judgeDirectPushes", () => {
  const chain = (viaPr: boolean[]) => firstParentChain(linear(viaPr), `c${viaPr.length - 1}`, 30);

  it("ignores the first commit", () => {
    expect(judgeDirectPushes("main", chain([false]))).toMatchObject({
      status: "pass",
      message: "no commits on main after the first one",
    });
  });

  it("passes when every commit came through a pull request", () => {
    expect(judgeDirectPushes("main", chain([false, true, true, true])).message).toBe(
      "all 3 recent commits on main came through pull requests",
    );
    expect(judgeDirectPushes("main", chain([false, true])).message).toBe(
      "the only commit on main after the first came through a pull request",
    );
  });

  it("does not count direct pushes from before the first pull request", () => {
    expect(judgeDirectPushes("main", chain([false, false, false, true, true]))).toMatchObject({
      status: "pass",
      message:
        "all 2 commits on main since the first pull request came through pull requests (2 direct pushes before that)",
    });
  });

  it("passes with a single direct push after pull requests started, and says so", () => {
    expect(judgeDirectPushes("main", chain([false, true, true, false, true, true]))).toMatchObject({
      status: "pass",
      message: "1 of 5 recent commits on main pushed directly",
    });
  });

  it("warns from 20% direct pushes", () => {
    const result = judgeDirectPushes("main", chain([false, ...Array(8).fill(true), false, false]));
    expect(result.status).toBe("warn");
    expect(result.message).toBe("2 of 10 recent commits on main were pushed directly, not through a pull request");
    expect(result.hint).toBe("Protect main and make every change a short branch with a pull request");
  });

  it("fails when half or more were pushed directly after pull requests started", () => {
    expect(judgeDirectPushes("master", chain([false, true, false, false]))).toMatchObject({
      status: "fail",
      message: "2 of 3 recent commits on master were pushed directly, not through a pull request",
    });
  });

  it("fails a repo that never used pull requests", () => {
    expect(judgeDirectPushes("main", chain([false, false, false])).status).toBe("fail");
  });

  it("says when the latest direct push was", () => {
    const now = Date.parse("2026-11-14T00:00:00Z");
    const commits: Commit[] = [
      { oid: "c4", parent: "c3", viaPr: false, date: "2026-05-15T00:00:00Z" },
      { oid: "c3", parent: "c2", viaPr: false, date: "2026-05-01T00:00:00Z" },
      { oid: "c2", parent: "c1", viaPr: true, date: "2026-04-01T00:00:00Z" },
      { oid: "c1", parent: "c0", viaPr: true, date: "2026-03-01T00:00:00Z" },
      { oid: "c0", parent: undefined, viaPr: false, date: "2026-02-01T00:00:00Z" },
    ];
    expect(judgeDirectPushes("main", firstParentChain(commits, "c4", 30), now).message).toBe(
      "2 of 4 recent commits on main were pushed directly, not through a pull request, the latest 6 months ago",
    );
  });
});
