#!/usr/bin/env node
import { Command } from "commander";
import { execa } from "execa";
import { envExample } from "./checks/env-example.js";
import { envInHistory } from "./checks/env-in-history.js";
import { envTracked } from "./checks/env-tracked.js";
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

    await run([envTracked, envInHistory, envExample]);
  });

await program.parseAsync();
