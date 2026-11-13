# repo-ready

> Early, in progress.

Check if your GitHub repo is ready to share.

    npx check-repo-ready

Run it inside your project folder.

## What it checks

- the default branch and `develop` are protected (a pull request is required)
- a workflow runs on pull requests
- `.env` is not tracked, and was never committed in the git history
- `.env.example` exists (a warning, not a failure)
- the README explains how to run the project

Planned:

- the last CI run on the default branch passed
- commit messages say what changed

repo-ready only reads. It never changes your repo.

## Requirements

- Node.js 22.12 or newer
- git
- [GitHub CLI](https://cli.github.com), logged in with `gh auth login`, for the
  branch protection check. Without it, that check is skipped and the others still run.

## Not the same as

[gh-repo-health](https://github.com/itxashancode/gh-repo-health) and
[repolinter](https://github.com/todogroup/repolinter) check community files
(LICENSE, CONTRIBUTING, CODE_OF_CONDUCT). repo-ready checks how the repo is
maintained: protection, CI, secrets and history.

## License

MIT
