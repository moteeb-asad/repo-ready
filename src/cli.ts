#!/usr/bin/env node
import { basename } from "node:path";
import { Command } from "commander";
import { execa } from "execa";
import { envExample } from "./checks/env-example.js";
import { envInHistory } from "./checks/env-in-history.js";
import { branchProtection } from "./checks/branch-protection.js";
import { ciOnPr } from "./checks/ci-on-pr.js";
import { envTracked } from "./checks/env-tracked.js";
import { readme } from "./checks/readme.js";
import { githubRemote } from "./context.js";
import { run } from "./runner.js";

const program = new Command();

program
  .name("repo-ready")
  .description("Check if your GitHub repo is ready to share.")
  .action(async () => {
    const git = await execa("git", ["rev-parse", "--is-inside-work-tree"], { reject: false });
    if (git.failed) {
      console.error("repo-ready: not inside a git repository (or git is not installed). Run it in your project folder.");
      process.exitCode = 1;
      return;
    }

    // Header: the repo name only (no owner), or the folder name when origin is not on GitHub.
    const remote = await githubRemote();
    const top = await execa("git", ["rev-parse", "--show-toplevel"]);
    const repo = remote?.repo ?? basename(top.stdout);

    await run(
      {
        Branches: [branchProtection],
        CI: [ciOnPr],
        Secrets: [envTracked, envInHistory, envExample],
        README: [readme],
      },
      repo,
    );
  });

await program.parseAsync();
