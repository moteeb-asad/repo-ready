# 0002. Reuse the GitHub CLI token

- Status: accepted
- Date: 2026-11-13

## Context

Some checks need the GitHub API: branch protection and CI status.
The API needs a token. The users are learners, and asking them to create
a personal access token is a step many will skip or get wrong.

## Decision

Get the token from `gh auth token`.
If `gh` is missing or not logged in, run the local checks only and say what was skipped.

Update 2026-11-14: read `GH_TOKEN`, then `GITHUB_TOKEN`, before `gh auth token`. This is the
order `gh` itself uses. GitHub Actions sets `GITHUB_TOKEN`, so `--ci` can run there without `gh`.

## Alternatives

- **Ask for a personal access token.** Extra setup, and users tend to give it too many scopes.
- **Build our own OAuth login.** Needs a registered OAuth app, a login flow and token storage.
  Too much for a CLI that only reads.
- **Read only a `GITHUB_TOKEN` env var.** Fine in CI, but most people don't have it set locally.
  Kept as a fallback, not the only source.

## Consequences

- No new login and no token stored by repo-ready.
- Users without `gh` get a partial report, not an error.
- The token never appears in output or logs.
