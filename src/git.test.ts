import { describe, expect, it } from "vitest";
import { pickDefaultBranch } from "./git.js";

describe("pickDefaultBranch", () => {
  it("uses origin/HEAD when it is set", () => {
    expect(pickDefaultBranch("origin/develop", ["main", "develop"])).toBe("develop");
  });

  it("falls back to a local main, then master", () => {
    expect(pickDefaultBranch(undefined, ["develop", "main"])).toBe("main");
    expect(pickDefaultBranch(undefined, ["master", "feature/x"])).toBe("master");
  });

  it("returns undefined when it cannot tell", () => {
    expect(pickDefaultBranch(undefined, ["trunk", "feature/x"])).toBeUndefined();
  });
});
