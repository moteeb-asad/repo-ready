import { describe, expect, it } from "vitest";
import { findReadme, hasRunSteps } from "./readme.js";

describe("findReadme", () => {
  it("finds README.md at the root", () => {
    expect(findReadme(["src/cli.ts", "README.md"])).toBe("README.md");
  });

  it("matches any case and plain README", () => {
    expect(findReadme(["readme.md"])).toBe("readme.md");
    expect(findReadme(["README"])).toBe("README");
  });

  it("ignores a README in a folder", () => {
    expect(findReadme(["docs/README.md"])).toBeUndefined();
  });

  it("returns undefined when there is none", () => {
    expect(findReadme(["src/cli.ts"])).toBeUndefined();
  });
});

describe("hasRunSteps", () => {
  it("finds a command in a fenced block", () => {
    expect(hasRunSteps("# app\n\n```bash\nnpm install\nnpm run dev\n```\n")).toBe(true);
  });

  it("finds an indented command", () => {
    expect(hasRunSteps("# app\n\n    npx check-repo-ready\n")).toBe(true);
  });

  it("finds a command with a $ prompt", () => {
    expect(hasRunSteps("$ docker compose up\n")).toBe(true);
  });

  it("finds an inline command", () => {
    expect(hasRunSteps("Run `pnpm dev` to start.")).toBe(true);
  });

  it("fails a default README with only a title and description", () => {
    expect(hasRunSteps("# my-app\n\nA todo app built with React.\n")).toBe(false);
  });

  it("does not match a command name inside a word", () => {
    expect(hasRunSteps("# gopher\n\nmakefile notes\n")).toBe(false);
  });
});
