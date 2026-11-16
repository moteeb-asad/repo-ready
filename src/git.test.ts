import { describe, expect, it } from "vitest";
import { parseGrepLine, pickDefaultBranch } from "./git.js";

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

describe("parseGrepLine", () => {
  it("splits file, line and content", () => {
    expect(parseGrepLine("src/a.ts:12:const x = 1;")).toEqual({ file: "src/a.ts", line: 12, content: "const x = 1;" });
  });

  it("keeps colons in the content", () => {
    expect(parseGrepLine("a.ts:3:url: http://x")).toEqual({ file: "a.ts", line: 3, content: "url: http://x" });
  });

  it("returns undefined for lines without a line number", () => {
    expect(parseGrepLine("a.ts:no number")).toBeUndefined();
  });
});
