import { describe, expect, it } from "vitest";
import { runsOnPullRequest } from "./ci-on-pr.js";

describe("runsOnPullRequest", () => {
  it("accepts on as a string", () => {
    expect(runsOnPullRequest("on: pull_request\n")).toBe(true);
  });

  it("accepts on as a list", () => {
    expect(runsOnPullRequest("on: [push, pull_request]\n")).toBe(true);
  });

  it("accepts on as a map", () => {
    expect(runsOnPullRequest("on:\n  pull_request:\n    branches: [main]\n")).toBe(true);
  });

  it("accepts pull_request with no settings", () => {
    expect(runsOnPullRequest("on:\n  pull_request:\n  push:\n")).toBe(true);
  });

  it("rejects push only", () => {
    expect(runsOnPullRequest("on:\n  push:\n    branches: [main]\n")).toBe(false);
  });

  it("rejects pull_request_target", () => {
    expect(runsOnPullRequest("on: pull_request_target\n")).toBe(false);
  });

  it("ignores pull_request in comments and job names", () => {
    const workflow = "# runs on pull_request later\non: push\njobs:\n  pull_request:\n    runs-on: ubuntu-latest\n";
    expect(runsOnPullRequest(workflow)).toBe(false);
  });

  it("rejects invalid YAML", () => {
    expect(runsOnPullRequest("on: [push, pull_request\n")).toBe(false);
  });
});
