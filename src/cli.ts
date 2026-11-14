#!/usr/bin/env node
import { basename } from "node:path";
import { Command } from "commander";
import { execa } from "execa";
import { branches } from "./checks/branches/index.js";
import { ci } from "./checks/ci/index.js";
import { readmeGroup } from "./checks/readme/index.js";
import { secrets } from "./checks/secrets/index.js";
import { currentBranch, defaultBranch } from "./git.js";
import { githubRemote } from "./github.js";
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

    // File checks read the checked-out branch, so say which one, and whether it is the one
    // visitors see on GitHub.
    const branch = await currentBranch();
    const main = await defaultBranch();
    const note = main && branch !== main ? `checked ${branch}, not ${main}. Run on ${main} to see what visitors see` : undefined;

    // Report sections, in print order. Each lives in its own folder under src/checks/.
    await run([branches, ci, secrets, readmeGroup], { title: `${repo} (${branch})`, note });
  });

await program.parseAsync();
