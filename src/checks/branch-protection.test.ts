import { describe, expect, it } from "vitest";
import { judge, judgeBranch } from "./branch-protection.js";

describe("judgeBranch", () => {
  it("passes when a ruleset requires a pull request and passing CI", () => {
    const rules = ["deletion", "non_fast_forward", "pull_request", "required_status_checks"];
    expect(judgeBranch({ name: "main", rules, classic: false }).status).toBe("pass");
  });

  it("warns when a pull request is required but CI is not", () => {
    expect(judgeBranch({ name: "main", rules: ["pull_request"], classic: false })).toEqual({
      status: "warn",
      text: "main: pull request required, but CI doesn't have to pass",
      hint: "In the ruleset, turn on Require status checks to pass and add your CI job",
    });
  });

  it("does not pass on required CI alone", () => {
    const rules = ["required_status_checks"];
    expect(judgeBranch({ name: "main", rules, classic: false }).status).toBe("warn");
  });

  it("passes with classic branch protection only", () => {
    expect(judgeBranch({ name: "main", rules: [], classic: true }).status).toBe("pass");
  });

  it("warns when rules exist but no pull request is required", () => {
    expect(judgeBranch({ name: "main", rules: ["deletion"], classic: false }).status).toBe("warn");
  });

  it("fails when the branch is not protected", () => {
    expect(judgeBranch({ name: "main", rules: [], classic: false })).toEqual({
      status: "fail",
      text: "main: not protected, anyone can push to it",
      hint: "Settings → Rules → Rulesets: require a pull request and passing status checks",
    });
  });
});

describe("judge", () => {
  const protectedMain = { name: "main", rules: ["pull_request", "required_status_checks"], classic: false };
  const openDevelop = { name: "develop", rules: [], classic: false };

  it("passes when every branch is protected, with no hint", () => {
    expect(judge([protectedMain], false)).toEqual({
      id: "branch-protection",
      status: "pass",
      message: "main: pull request and passing CI required",
    });
  });

  it("uses the hint of the worst branch", () => {
    const prOnly = { name: "main", rules: ["pull_request"], classic: false };
    const result = judge([prOnly, openDevelop], false);
    expect(result.status).toBe("fail");
    expect(result.hint).toBe("Settings → Rules → Rulesets: require a pull request and passing status checks");
  });

  it("fails when any branch is not protected", () => {
    const result = judge([protectedMain, openDevelop], false);
    expect(result.status).toBe("fail");
    expect(result.message).toBe(
      "main: pull request and passing CI required; develop: not protected, anyone can push to it",
    );
  });

  it("warns instead of failing on a private repo", () => {
    const result = judge([openDevelop], true);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("GitHub Pro");
    expect(result.hint).toBe("Make the repo public, or use GitHub Pro to enforce protection");
  });
});
