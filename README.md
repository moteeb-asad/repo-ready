# repo-ready

> Early, in progress.

Check if your GitHub repo is ready to share.

## Install and run

Run these inside your project folder.

**Without installing** (npx downloads it once and caches it):

    npx check-repo-ready

Add `@latest` to make sure you get the newest version: `npx check-repo-ready@latest`.

**Or install it once** and use the short `repo-ready` command in any repo:

    npm install -g check-repo-ready
    repo-ready

Update with `npm update -g check-repo-ready`. Remove with `npm uninstall -g check-repo-ready`.

The npm package is `check-repo-ready`. The command it installs is `repo-ready`.
`npx repo-ready` does not work: there is no npm package called `repo-ready`.

## Example

```
  ✓ branch-protection    main: pull request required; develop: pull request required
  ✓ ci-on-pr             .github/workflows/ci.yml
  ✓ env-tracked          no .env file is tracked
  ✓ env-in-history       no .env file in git history
  ! env-example          no .env.example: add one if the project needs environment variables
  ✓ readme               README.md has setup or run steps

  0 problems, 1 warning
```

repo-ready only reads. It never changes your repo.

## What it checks

| Check | Passes when | Otherwise |
|---|---|---|
| `branch-protection` | The default branch, and `develop` if it exists, need a pull request to change (a ruleset or classic branch protection). | Fails. Warns on a private repo, because protection there needs a paid GitHub plan. |
| `ci-on-pr` | A workflow in `.github/workflows/` runs on `pull_request`. | Fails. |
| `env-tracked` | No `.env` or `.env.*` file is tracked by git (`.env.example` is fine). | Fails, and lists the files. |
| `env-in-history` | No commit on any branch ever added a `.env` file, even if it was deleted later. | Fails, and lists the file, commit and date. Rotate any keys that file held. |
| `env-example` | A `.env.example` is tracked, anywhere in the repo. | Warns. Projects without environment variables don't need one. |
| `readme` | A README at the root shows how to install or run the project (`npm install`, `docker compose up`, ...). | Fails. |

It never prints the contents of a `.env` file, and never rewrites git history.

## Requirements

- Node.js 22.12 or newer
- git
- For the `branch-protection` check, a GitHub token: the [GitHub CLI](https://cli.github.com)
  logged in with `gh auth login`, or a `GH_TOKEN` or `GITHUB_TOKEN` environment variable
  (GitHub Actions sets `GITHUB_TOKEN`). Without one, that check is skipped and the others still run.

## Planned

More checks:

- `ci-green`: the last CI run on the default branch passed
- `commit-messages`: recent commit messages say what changed

More ways to run it:

- `--json` output for scripts and AI agents, and `--ci` to exit with code 1 when a check fails
- `repo-ready explain <check>`: what a problem means and how to fix it
- `--fix`: fix what can be fixed (add a ruleset, a CI workflow, `.env.example`), always through a
  pull request and only after asking
- An agent skill, so Claude Code or Cursor can run the checks and fix them with you
- A GitHub Action that comments the report on every pull request

## Not the same as

[gh-repo-health](https://github.com/itxashancode/gh-repo-health) and
[repolinter](https://github.com/todogroup/repolinter) check community files
(LICENSE, CONTRIBUTING, CODE_OF_CONDUCT). repo-ready checks how the repo is
maintained: protection, CI, secrets and history.

## Why

I wrote about [keeping your repo healthy when AI writes the code](https://moteebasad.dev/blog/keep-your-repo-healthy-when-ai-writes-the-code).
repo-ready checks those things for you.

## License

MIT
