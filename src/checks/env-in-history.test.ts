import { describe, expect, it } from "vitest";
import { findEnvCommits } from "./env-in-history.js";

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
