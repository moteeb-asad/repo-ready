# repo-ready: project notes

## What this is

`repo-ready` is a command-line tool that checks if a GitHub repo is ready to share.

You run it inside a repo:

```bash
npx check-repo-ready
```

It reads the local git folder and the GitHub settings, and prints a report: what is fine, what is missing, and how to fix it. Later, `--fix` will fix the things that can be fixed, through a pull request, never by pushing to main.

It is a TypeScript project running on Node.js. There is no UI and no React.

## How the idea came

I see a lot of repos shared on LinkedIn by people building with AI. The apps work, but the repos look unmaintained:

- one branch, `main`, with everything pushed straight to it
- hundreds of commits called "update", "fix" or "changes"
- one commit that touches 40 files
- no README, or the default one
- a `.env` file in the history

So I wrote a blog post for learners about keeping a repo healthy when AI writes the code: protect main, short branches, a pull request for every change, CI, clear commits, no secrets, a real README, and decision records.
Post: https://moteebasad.dev/blog/keep-your-repo-healthy-when-ai-writes-the-code

After writing it, I wanted one command that checks all of that for you. I looked at what already exists:

- `gh-repo-health` (https://github.com/itxashancode/gh-repo-health): checks community files only (README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and PR templates). Only checks that a README exists, not what is in it. Audit only.
- `repolinter` (TODO Group): lints open source repos, also mainly community files.
- `gh-repo-config`, `gitorules`: apply repo settings or rulesets from a config file. Settings only, no audit of the repo itself.

None of them check what my post is about: protection, CI, secrets, history and commits. That is the gap repo-ready fills.

A comment on the gh-repo-health post said "if you build it like an agent skill, more people will use it". That fits the audience, people building with AI, so an agent skill is part of the plan.

## Goal

1. Help people who are learning, especially those building with AI, keep their repos in a state someone else can trust and work on.
2. Be a real, public portfolio project that matches my blog post. The post links to the tool, and the tool's README links to the post.
3. The repo itself must pass its own checks from the first commit. It is the demo.

## Who it is for

Developers who are learning, or building side projects with AI tools, who share their repos on LinkedIn or with recruiters and don't know what is missing.

## What it checks (MVP)

| Check | How |
|---|---|
| `main` (and `develop`) protected | GitHub API: `GET /repos/{owner}/{repo}/rules/branches/{branch}` returns the rules actually in force |
| CI runs on pull requests | parse `.github/workflows/*.yml` for `on: pull_request` |
| last CI run on main passed | `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` |
| `.env` is not tracked | `git ls-files` (anything matching `.env*` except `.env.example`) |
| `.env` was never committed | `git log --all --diff-filter=A --name-only -- '*.env*'` |
| `.env.example` exists | file check |
| commit messages are clear | `git log -50 --format=%s` against the Conventional Commits pattern |
| README is useful | exists, has setup or run steps, has a live link if there is one |

Start with these 5 for the first release: protection, CI on PR, `.env` tracked, `.env` in history, README.

## How it works for the user

1. `npx check-repo-ready` prints a grouped report with a score.
2. `npx check-repo-ready explain <check-id>` explains one problem and how to fix it.
3. `npx check-repo-ready --fix` asks before each change, then puts file changes on a new branch and opens a pull request.
4. `npx check-repo-ready --json` for scripts and agents. `--ci` exits with code 1 when something fails.

Example report:

```
repo-ready  owner/my-project

 Branches
  ✗ main is not protected         anyone can push to it directly

 CI
  ✓ workflow runs on pull_request  .github/workflows/ci.yml

 Secrets
  ✗ .env was committed in history  commit a1b2c3d, 3 weeks ago
  ✓ .env.example exists

 README
  ✗ no setup or run steps

 Score: 4/10   3 problems
```

## Rules the tool must follow

- **Reading is automatic. Changing anything always asks first.**
- File changes go through a pull request on a new branch. Never push to `main`.
- **Never print a secret value.** Show the file, line and commit, not the key.
- **Never rewrite git history.** For a leaked key, tell the user to rotate it first.
- If there is no GitHub login, run the local checks only and say what was skipped.
- Branch protection on private repos needs a paid GitHub plan. Report it as a warning with the reason, not a failure.

## Architecture

One command, many small checks. Each check is one file and returns one result, or one per
item it looks at (e.g. per branch):

```ts
type Result = {
  id: string;                  // "branch-protection"
  label?: string;              // shown instead of the id, e.g. "main"
  status: "pass" | "warn" | "fail";
  message: string;             // "not protected, anyone can push to it"
  hint?: string;               // what to do, printed as "→ ..." under a warn or fail
  fix?: () => Promise<void>;
};
```

Checks are grouped by report section. Each section is a folder under `src/checks/` with an
`index.ts` that exports `{ name, checks }`. The runner prints sections in the order `cli.ts`
lists them.

```
src/
  cli.ts             commands and flags; lists the groups in print order
  types.ts           Result, Check and Group: the contract between checks and the runner
  runner.ts          runs checks, prints the report
  git.ts             shared git helpers: trackedFiles(), readTracked()
  github.ts          owner/repo from origin, token (GH_TOKEN, GITHUB_TOKEN, gh auth token)
  checks/
    branches/        index.ts  branch-protection.ts
    ci/              index.ts  ci-on-pr.ts
    history/         index.ts  commit-messages.ts
    secrets/         index.ts  env-tracked.ts  env-in-history.ts  secrets-in-code.ts  secrets-logged.ts  env-example.ts
    readme/          index.ts  readme.ts
```

Each check has a test file next to it (`env-tracked.test.ts`).

- **Add a check:** add the file (and its test) to its group folder, then add it to that folder's
  `index.ts`. `cli.ts` and the runner stay the same.
- **Add a group:** add a folder with an `index.ts`, then add the group to the list in `cli.ts`.
- **Shared code:** git calls used by more than one check go in `git.ts`, GitHub API setup in
  `github.ts`. Code used by one check stays in that check.
- **Types:** a type lives in the file that uses it. Checks import `Result` and `Group` from
  `types.ts`, never from `runner.ts`. When two checks in one group share a type, it moves to
  that group's `types.ts` (e.g. `src/checks/secrets/types.ts`). No per-folder `types.ts` until then.

## Stack

- TypeScript on Node.js
- `commander` for the CLI
- `@octokit/rest` for the GitHub API (reuse the token from `gh auth token`, no new login)
- `execa` to run local `git` commands
- `picocolors` for terminal colours
- `tsup` to build to `dist/`
- `vitest` for tests

## Roadmap

1. Audit MVP: 5 checks and a readable report. Read-only.
2. `--json` and `--ci` (exit codes).
3. `--fix`: create the ruleset through the API, add `ci.yml`, `.env.example` and `.gitignore` entries, all through a pull request.
4. Agent skill: a `SKILL.md` that tells Claude Code or Cursor to run `npx check-repo-ready --json`, explain the results and do the fixes with the user.
5. GitHub Action that runs it on every pull request and comments the report.
6. Later: a `gh` extension in a separate repo named `gh-repo-ready` that calls the npm package.

## How I work on this repo

- `main` is what is released. `develop` is where work comes together.
- Every change is a short branch: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`.
- Every branch goes into `develop` through a pull request. Releases are one pull request from `develop` into `main`, merged with a merge commit (the only method `main` allows). No back-merge from `main` into `develop` is needed.
- Before merging a pull request into `develop`, its branch must be up to date with `develop`. Use "Update branch" on the pull request.
- CI runs on every pull request: lint, type check, tests, build.
- Commit messages follow Conventional Commits: `feat(checks): add env-in-history check`.
- No AI attribution in commit messages. Never mention Claude or any AI tool in commits or PRs.
- Ask me before any commit, push, branch change or deleting files.
- Keep it simple. Don't add a dependency or a layer unless a check needs it.
- Write tests for each check, including the failure case.
- I'm on Windows with PowerShell 5, so `&&` does not work in my terminal. Give commands one per line.

## Keep it simple

Build the smallest thing that solves the task. Nothing more.

- Do only what was asked. If something else looks worth changing, say so; don't change it.
- No new dependency unless the task can't be done without one. Ask first.
- No new abstraction (base class, factory, plugin system, generic helper) until the same code exists in at least three places.
- No config options, flags or settings that nobody asked for.
- Prefer one plain function over a class. Prefer a standard Node or TypeScript API over a package.
- Don't add error handling, retries or caching for cases that can't happen yet.
- Don't create new folders or files to "organise" a few lines of code.
- Small diffs. If a change touches more than 5 files, stop and explain why before going on.
- Before writing code, say in 2-3 lines what you'll change and why. If there's a simpler way, use it.
- When in doubt between two approaches, pick the one with less code.

## Current status

- Repo created: public, `moteeb-asad/repo-ready`, with MIT license and Node `.gitignore`.
- `develop` branch created.
- Packages installed: commander, @octokit/rest, execa, picocolors, yaml, typescript, tsup, vitest, @types/node.
- Published on npm as `check-repo-ready` (the name `repo-ready` was blocked as too similar to `repoready`). The installed command is `repo-ready`. Latest release: `0.0.3`, with a GitHub release per version.
- CI: `.github/workflows/ci.yml`, job `check` (type check, test, build) on pull requests and pushes to `main` and `develop`.
- Rulesets: "Protect main branch" (`main`) and "Protect develop" (`develop`). Both require a pull request and a passing `check`, block force pushes and deletion. Only `develop` requires branches to be up to date: `main` only takes pull requests from `develop`, and CI already tests the merge result, so on `main` it would only force a back-merge after every release. `main` allows merge commits only.
- Decision records in `docs/decisions/`. Write one only when choosing between real alternatives.
- Checks built: `branch-protection`, `ci-on-pr`, `commit-messages`, `env-tracked`, `env-in-history`, `secrets-in-code`, `secrets-logged`, `env-example`, `readme`. The report is grouped by section, shows the checked branch, and has a fix hint under each warning and failure.
- Roadmap and progress: private GitHub project "repo-ready roadmap" (Version and Priority fields).
- Tested against other people's repos (blobless clones in `C:\dev\tests\repo-ready-tests`); false alarms found there are fixed before new checks.
- Next (v0.1.0): `direct-pushes` (History group), then `ci-green`.
