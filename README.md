# repo-ready

> Early, in progress.

Check if your GitHub repo is ready to share.

    npx check-repo-ready

## What it checks

- `main` and `develop` are protected
- CI runs on pull requests, and the last run passed
- `.env` is not tracked or in the git history
- `.env.example` exists
- commit messages say what changed
- the README explains how to run the project

Reading is automatic. Changing anything always asks first.

## Not the same as

[gh-repo-health](https://github.com/itxashancode/gh-repo-health) and
[repolinter](https://github.com/todogroup/repolinter) check community files
(LICENSE, CONTRIBUTING, CODE_OF_CONDUCT). repo-ready checks how the repo is
maintained: protection, CI, secrets and history.

## License

MIT
