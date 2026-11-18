# Security

## What repo-ready does with your repo

repo-ready looks for leaked secrets, so it has to look at your files. This is exactly what it
does, and what it never does.

**It only reads, and only on your machine.**

- It reads the files git tracks in your repo, and your git history, with read-only git commands
  (`git ls-files`, `git grep`, `git show`, `git log`). It runs them on your computer. The file
  contents never leave it.
- It never changes your repo: it writes no files, makes no commits, and changes no settings.

**It never shows, saves or sends a secret.**

- When it finds a key, it prints the file, the line and the kind of key, for example
  `src/config.ts:12 (OpenAI API key)`. Never the key itself.
- It does not save anything to disk, and has no logs or cache.

**It only talks to GitHub, and only to read.**

- The checks `branch-protection` and `direct-pushes` call `api.github.com` to read your branch
  rules and which commits came through pull requests. Nothing else uses the network.
- They use your GitHub token from `GH_TOKEN`, `GITHUB_TOKEN` or the GitHub CLI (`gh auth token`).
  The token is only sent to `api.github.com`. It is never printed or saved.
- Without a token, or without a network, those two checks are skipped and everything else
  still runs.

**It downloads nothing and runs nothing.**

- It does not download code, and does not run your scripts, tests or package manager.
- The npm package has no install scripts (`preinstall`, `postinstall`): installing it runs nothing.
- There is no telemetry, no analytics and no tracking.

The only download is the package itself, when you run `npx check-repo-ready` or
`npm install -g check-repo-ready`.

## How releases are made

- From version `0.1.2`, every version is built and tested by GitHub Actions
  (`.github/workflows/publish.yml`), with npm Trusted Publishing. No npm token exists.
- Every version has npm provenance: a signed record of the commit and workflow run that built it.
  Check it with `npm audit signatures` in a project that installs `check-repo-ready`, or on the
  package's npm page.
- The workflow can only stage a version. It goes live after the maintainer approves it on npm
  with a security key.

## Supported versions

Only the latest version gets security fixes. Update with `npx check-repo-ready@latest`, or
`npm update -g check-repo-ready`.

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

1. Go to the repo's **Security** tab.
2. Click **Report a vulnerability**.

Include what you found, how to reproduce it, and the version (`npm view check-repo-ready version`).
You can expect a first reply within 7 days. Once a fix is released, the report is published as a
security advisory, crediting you if you want.

This repo is maintained by one person, so please be patient, and please give time to fix a problem
before sharing it publicly.
