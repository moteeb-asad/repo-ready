import { describe, expect, it } from "vitest";
import { apiSkipReason, parseGitHubRemote } from "./github.js";

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

describe("apiSkipReason", () => {
  const remote = { owner: "me", repo: "app" };

  it("explains a timeout", () => {
    expect(apiSkipReason(new Error("The operation was aborted due to timeout"), remote)).toBe(
      "GitHub did not answer within 20 seconds",
    );
  });

  it("explains a network failure", () => {
    for (const message of ["connect ENETUNREACH 20.207.73.85:443", "getaddrinfo ENOTFOUND api.github.com", "fetch failed"]) {
      expect(apiSkipReason(new Error(message), remote), message).toBe("could not reach GitHub, check your internet connection");
    }
  });

  it("explains a rate limit", () => {
    expect(apiSkipReason(new Error("API rate limit exceeded for 1.2.3.4."), remote)).toBe(
      "GitHub API rate limit reached, try again later",
    );
  });

  it("explains a missing or private repo, from REST and GraphQL", () => {
    const expected = "me/app not found on GitHub, or this token has no access to it";
    expect(apiSkipReason(new Error("Not Found - https://docs.github.com/rest"), remote)).toBe(expected);
    expect(apiSkipReason(new Error("Could not resolve to a Repository with the name 'me/app'."), remote)).toBe(expected);
  });

  it("keeps only the first line of anything else", () => {
    expect(apiSkipReason(new Error("Bad credentials\nmore detail"), remote)).toBe("GitHub API error: Bad credentials");
  });
});
