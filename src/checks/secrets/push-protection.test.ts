import { describe, expect, it } from "vitest";
import { judgePushProtection } from "./push-protection.js";

const on = { status: "enabled" };
const off = { status: "disabled" };
const publicAdmin = { private: false, admin: true };

describe("judgePushProtection", () => {
  it("passes when secret scanning and push protection are on", () => {
    expect(judgePushProtection({ secret_scanning: on, secret_scanning_push_protection: on }, publicAdmin)).toEqual({
      id: "push-protection",
      status: "pass",
      message: "secret scanning and push protection are on",
    });
  });

  it("warns when push protection is off", () => {
    expect(judgePushProtection({ secret_scanning: on, secret_scanning_push_protection: off }, publicAdmin)).toMatchObject({
      status: "warn",
      message: "push protection is off: a leaked key is found after it is public, not blocked before",
      hint: "Settings → Advanced Security → enable Secret scanning and Push protection",
    });
  });

  it("warns when both are off", () => {
    expect(judgePushProtection({ secret_scanning: off, secret_scanning_push_protection: off }, publicAdmin)).toMatchObject({
      status: "warn",
      message: "secret scanning and push protection are off: GitHub won't catch a pushed key",
      hint: "Settings → Advanced Security → enable Secret scanning and Push protection",
    });
  });

  it("explains a private repo without GitHub Advanced Security", () => {
    expect(judgePushProtection(undefined, { private: true, admin: true })).toMatchObject({
      status: "warn",
      message: "private repo: secret scanning needs GitHub Advanced Security",
      hint: expect.stringContaining("gitleaks"),
    });
  });

  it("is skipped for someone who is not a repo admin", () => {
    expect(judgePushProtection(undefined, { private: false, admin: false })).toMatchObject({
      status: "warn",
      message: "skipped: only repo admins can see this setting",
    });
  });
});
