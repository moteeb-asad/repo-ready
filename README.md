# repo-ready

[![npm version](https://img.shields.io/npm/v/check-repo-ready)](https://www.npmjs.com/package/check-repo-ready)
[![CI](https://github.com/moteeb-asad/repo-ready/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/moteeb-asad/repo-ready/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/node/v/check-repo-ready)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Check if your GitHub repo is ready to share: protected branches, CI on pull requests,
no leaked `.env` files, and a README that explains how to run the project.

**repo-ready only reads. It never changes your repo.**

> Early release (0.x). Checks and output may change between versions.

## Quick start

Run it inside your project folder:

```bash
npx check-repo-ready
```

```
check-repo-ready  repo-ready (main)

Branches
  ✓ main                   pull request and passing CI required
  ✓ develop                pull request and passing CI required

CI
  ✓ ci-on-pr               .github/workflows/ci.yml

Secrets
  ✓ env-tracked            no .env file is tracked
  ✓ env-in-history         no .env file in git history
  ✓ secrets-in-code        no secrets in tracked files
  ✓ secrets-logged         no secrets written to logs
  ! env-example            no .env.example, but the code reads GH_TOKEN, GITHUB_TOKEN
                           → Add .env.example listing every variable the project needs, with the values removed

README
  ✓ readme                 README.md has setup or run steps

0 problems, 1 warning
```

`✓` passed, `!` warning, `✗` problem. Each warning and problem has a `→` line that says what to do.

The file checks read the branch you have checked out (shown in the header). On any other branch
than the default one, the report says so: run it on the default branch to see what visitors see.

## Installation

**Run without installing.** npx downloads the package once and caches it:

```bash
npx check-repo-ready
npx check-repo-ready@latest   # make sure you get the newest version
```

**Install globally** to get the short `repo-ready` command:

```bash
npm install -g check-repo-ready
repo-ready
```

Update with `npm update -g check-repo-ready`, remove with `npm uninstall -g check-repo-ready`.

> The npm package is `check-repo-ready`. The command it installs is `repo-ready`.
> `npx repo-ready` does not work: there is no npm package with that name.

### Requirements

- Node.js 22.12 or newer
- git
- For the `branch-protection` check only, a GitHub token from one of:
  - the [GitHub CLI](https://cli.github.com), logged in with `gh auth login`
  - a `GH_TOKEN` or `GITHUB_TOKEN` environment variable (GitHub Actions sets `GITHUB_TOKEN`)

  Without a token, that check is skipped and the others still run.

## Checks

| Check | Passes when | Otherwise |
|---|---|---|
| `branch-protection` | The default branch, and `develop` if it exists, require a pull request and passing CI before a change is merged. The report shows one line per branch. | Warns if a pull request is required but CI is not. Fails if the branch is not protected. Warns instead of failing on a private repo, because protection there needs a paid GitHub plan. |
| `ci-on-pr` | A workflow in `.github/workflows/` runs on `pull_request`. | Fails. |
| `env-tracked` | No `.env` or `.env.*` file is tracked by git. `.env.example` is allowed. | Fails and lists the files. |
| `env-in-history` | No commit on any branch ever added a `.env` file, even one deleted later. | Fails and lists the file, commit and date. |
| `secrets-in-code` | No tracked file contains a secret: API keys in a well-known format (OpenAI, Anthropic, AWS, GitHub, Slack, Stripe live, Google, Supabase, SendGrid, npm, Hugging Face, Groq, Resend), a `PRIVATE KEY` block, a database URL with a real password, or a Supabase service-role key. Placeholders, `localhost` URLs and the public Supabase `anon` key are ignored. | Fails and lists the file, line and type. Warns when a variable named like a secret (`JWT_SECRET`, `password`, `apiKey`) is set to a literal value, outside tests and docs. The value is never shown. |
| `secrets-logged` | No log call (`console.*`, `print`, `logger.*`, `logging.*`) prints a secret env variable (`process.env.JWT_SECRET`, `os.getenv("DB_PASSWORD")`) or a variable named like a secret (`token`, `user.password`, `apiKey`). Logging whether it is set (`Boolean(...)`, `!!x`, `.length`) is fine. Test files are skipped. | Warns and lists the file and line. |
| `env-example` | A `.env.example` is tracked anywhere in the repo, or the code reads no project env variables (runtime ones like `PORT` and `NODE_ENV` don't count). | Warns and names the variables the code reads, e.g. `JWT_SECRET, MONGODB_URI`. |
| `readme` | A README at the repo root shows how to install or run the project, for example `npm install` or `docker compose up`, and is not an untouched generator README (Vite, Create React App, Next.js, Expo, Angular, SvelteKit). | Fails. |

Branches with classic branch protection pass without their settings being checked, because
reading those settings needs admin access.

## Security

- repo-ready never prints the contents of a `.env` file. It shows file names, commits and dates.
- It never rewrites git history. If a `.env` file was committed, **rotate every key it held**:
  removing it from history does not make a leaked key safe again.
- The GitHub token is only used to read branch rules. It is never printed or stored.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | The checks ran. Problems are shown in the report, not in the exit code. |
| `1` | Not inside a git repository, or git is not installed. |

A `--ci` flag that exits with `1` when a check fails is planned.

## Roadmap

- `ci-green` check: the last CI run on the default branch passed
- `commit-messages` check: recent commit messages say what changed
- `--json` output for scripts and AI agents, and `--ci` for exit codes
- `repo-ready explain <check>`: what a problem means and how to fix it
- `--fix`: fix what can be fixed (a ruleset, a CI workflow, `.env.example`), always through a
  pull request and only after asking
- An agent skill, so Claude Code or Cursor can run the checks and fix them with you
- A GitHub Action that comments the report on every pull request

## Comparison

[gh-repo-health](https://github.com/itxashancode/gh-repo-health) and
[repolinter](https://github.com/todogroup/repolinter) check community files such as LICENSE,
CONTRIBUTING and CODE_OF_CONDUCT. repo-ready checks how the repo is maintained: branch
protection, CI, secrets and history.

## Background

repo-ready started from a blog post:
[Keep your repo healthy when AI writes the code](https://moteebasad.dev/blog/keep-your-repo-healthy-when-ai-writes-the-code).

## Contributing

Issues and pull requests are welcome.

```bash
git clone https://github.com/moteeb-asad/repo-ready.git
cd repo-ready
npm install
npm test
npm run build
npm link        # makes your local build available as `repo-ready`
```

- Branch from `develop` and open the pull request into `develop`.
- Use [Conventional Commits](https://www.conventionalcommits.org): `feat(checks): add ci-green check`.
- Each check is one file in its report section's folder (`src/checks/secrets/`, ...), with a test
  file next to it that covers the failure case. Add it to that folder's `index.ts`.
- Design decisions are recorded in [`docs/decisions/`](docs/decisions).

## License

[MIT](LICENSE)
