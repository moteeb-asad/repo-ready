import { describe, expect, it } from "vitest";
import { parseGitHubRemote } from "./github.js";

describe("parseGitHubRemote", () => {
  const expected = { owner: "moteeb-asad", repo: "repo-ready" };

  it("parses an https URL", () => {
    expect(parseGitHubRemote("https://github.com/moteeb-asad/repo-ready.git")).toEqual(expected);
  });

  it("parses an https URL without .git", () => {
    expect(parseGitHubRemote("https://github.com/moteeb-asad/repo-ready")).toEqual(expected);
  });

  it("parses an ssh URL", () => {
    expect(parseGitHubRemote("git@github.com:moteeb-asad/repo-ready.git\n")).toEqual(expected);
  });

  it("keeps dots in the repo name", () => {
    expect(parseGitHubRemote("https://github.com/me/my.site.git")).toEqual({ owner: "me", repo: "my.site" });
  });

  it("returns undefined for other hosts", () => {
    expect(parseGitHubRemote("https://gitlab.com/me/app.git")).toBeUndefined();
  });
});
