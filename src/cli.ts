#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("repo-ready")
  .description("Check if your GitHub repo is ready to share.")
  .action(() => {
    console.log("repo-ready: no checks yet.");
  });

program.parse();
