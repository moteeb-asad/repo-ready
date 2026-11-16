import { describe, expect, it } from "vitest";
import { findEnvFiles } from "./env-tracked.js";

describe("findEnvFiles", () => {
  it("passes when no .env file is tracked", () => {
    expect(findEnvFiles(["README.md", "src/cli.ts"])).toEqual([]);
  });

  it("allows .env.example", () => {
    expect(findEnvFiles([".env.example", "api/.env.example"])).toEqual([]);
  });

  it("allows example variants", () => {
    expect(findEnvFiles([".env.agent-bridge.example", ".env.local.example", ".env.sample", ".env.template"])).toEqual([]);
  });

  it("still finds a real config with an unusual name", () => {
    expect(findEnvFiles([".env.bridge"])).toEqual([".env.bridge"]);
  });

  it("finds .env at the root and in folders", () => {
    expect(findEnvFiles([".env", "api/.env"])).toEqual([".env", "api/.env"]);
  });

  it("finds .env variants like .env.local", () => {
    expect(findEnvFiles([".env.local", ".env.production"])).toEqual([
      ".env.local",
      ".env.production",
    ]);
  });

  it("ignores files that only contain env in the name", () => {
    expect(findEnvFiles(["env.ts", "src/.environment.json"])).toEqual([]);
  });
});
