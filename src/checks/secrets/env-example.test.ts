import { describe, expect, it } from "vitest";
import { findEnvExample } from "./env-example.js";

describe("findEnvExample", () => {
  it("finds .env.example at the root", () => {
    expect(findEnvExample(["README.md", ".env.example"])).toBe(".env.example");
  });

  it("finds .env.example in a folder", () => {
    expect(findEnvExample(["api/.env.example"])).toBe("api/.env.example");
  });

  it("returns undefined when there is none", () => {
    expect(findEnvExample(["README.md", ".env"])).toBeUndefined();
  });

  it("ignores names that only start with .env.example", () => {
    expect(findEnvExample([".env.example.bak"])).toBeUndefined();
  });
});
