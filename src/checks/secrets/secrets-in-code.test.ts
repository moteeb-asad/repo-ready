import { describe, expect, it } from "vitest";
import { findSecrets } from "./secrets-in-code.js";

// Fake keys are built from parts so this file never contains a full key pattern
// (otherwise repo-ready would flag its own tests).
const k = (...parts: string[]) => parts.join("");
const RANDOM = "Q7v2Lm9XkR4tB8nZ3pW6yH1cJ5dF0gSa";

describe("findSecrets", () => {
  it("finds an OpenAI key and reports file, line and kind only", () => {
    const lines = [`src/config.ts:12:const key = "${k("sk-", "proj-", RANDOM, "Ux")}";`];
    expect(findSecrets(lines)).toEqual([{ file: "src/config.ts", line: 12, kind: "OpenAI API key" }]);
  });

  it("labels Anthropic keys as Anthropic, not OpenAI", () => {
    const lines = [`api/llm.js:3:apiKey: "${k("sk-", "ant-", "api03-", RANDOM)}"`];
    expect(findSecrets(lines)[0]?.kind).toBe("Anthropic API key");
  });

  it("finds AWS, GitHub, Slack, Stripe and Google keys", () => {
    const lines = [
      `a.ts:1:${k("AKIA", "Q7V2LM9XKR4TB8NZ")}`,
      `b.ts:2:${k("ghp", "_", RANDOM, "Ab12")}`,
      `c.ts:3:${k("xoxb", "-", "1234567890-", RANDOM)}`,
      `d.ts:4:${k("sk", "_live_", RANDOM)}`,
      `e.ts:5:${k("AIza", "Sy", RANDOM, "c1d")}`,
    ];
    expect(findSecrets(lines).map((f) => f.kind)).toEqual([
      "AWS access key",
      "GitHub token",
      "Slack token",
      "Stripe live key",
      "Google API key",
    ]);
  });

  it("finds a private key header", () => {
    const lines = [`deploy/id_rsa:1:${k("-----BEGIN RSA ", "PRIVATE KEY-----")}`];
    expect(findSecrets(lines)).toEqual([{ file: "deploy/id_rsa", line: 1, kind: "private key" }]);
  });

  it("ignores placeholders", () => {
    const lines = [
      `a.ts:1:OPENAI_API_KEY=${k("sk-", "x".repeat(40))}`,
      `b.ts:2:key: "${k("sk-", "your-openai-key-goes-here-1234567890")}"`,
      `c.md:3:${k("AKIA", "IOSFODNN7EXAMPLE")}`,
    ];
    expect(findSecrets(lines)).toEqual([]);
  });

  it("ignores words that only contain a prefix", () => {
    const lines = [
      ".gitignore:28:# Grunt intermediate storage (https://gruntjs.com/creating-plugins#storing-task-files)",
      `src/a.ts:4:const disk-${RANDOM} = 1`,
      "src/b.ts:9:const stripeTest = 'sk_test_only'",
    ];
    expect(findSecrets(lines)).toEqual([]);
  });

  it("ignores .env.example", () => {
    const lines = [`api/.env.example:1:OPENAI_API_KEY=${k("sk-", "proj-", RANDOM)}`];
    expect(findSecrets(lines)).toEqual([]);
  });

  it("reports one finding per line", () => {
    const lines = [`a.ts:7:${k("sk-", "ant-", RANDOM)} ${k("AKIA", "Q7V2LM9XKR4TB8NZ")}`];
    expect(findSecrets(lines)).toHaveLength(1);
  });
});
