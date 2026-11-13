#!/usr/bin/env node
import { Command } from "commander";
import { envTracked } from "./checks/env-tracked.js";
import { run } from "./runner.js";

const program = new Command();

program
  .name("repo-ready")
  .description("Check if your GitHub repo is ready to share.")
  .action(async () => {
    await run([envTracked]);
  });

await program.parseAsync();
