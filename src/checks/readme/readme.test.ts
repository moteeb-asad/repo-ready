import { describe, expect, it } from "vitest";
import { defaultTemplate, findReadme, hasRunSteps } from "./readme.js";

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

describe("defaultTemplate", () => {
  it("recognises untouched generator READMEs", () => {
    expect(
      defaultTemplate("# React + TypeScript + Vite\n\nThis template provides a minimal setup to get React working in Vite with HMR"),
    ).toBe("Vite");
    expect(
      defaultTemplate(
        "# Getting Started with Create React App\n\nThis project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).\n\n### `npm start`",
      ),
    ).toBe("Create React App");
    expect(
      defaultTemplate(
        "This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs).\n\n```bash\nnpm run dev\n```",
      ),
    ).toBe("Next.js");
    expect(defaultTemplate("# Welcome to your Expo app\n\nThis is an [Expo](https://expo.dev) project created with")).toBe(
      "Expo",
    );
    expect(defaultTemplate("# MyApp\n\nThis project was generated using [Angular CLI](https://github.com/angular)")).toBe(
      "Angular CLI",
    );
  });

  it("passes a README that starts with the project's own text", () => {
    const own = "# Lead Followup\n\nTracks leads and sends reminders.\n\n".padEnd(700, "More about the app. ");
    expect(defaultTemplate(`${own}\nThis project was bootstrapped with [Create React App](https://x).`)).toBeUndefined();
  });

  it("returns undefined for a normal README", () => {
    expect(defaultTemplate("# my-app\n\n```bash\nnpm install\nnpm run dev\n```")).toBeUndefined();
  });
});
