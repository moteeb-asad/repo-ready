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

## Alternatives

- **Ask for a personal access token.** Extra setup, and users tend to give it too many scopes.
- **Build our own OAuth login.** Needs a registered OAuth app, a login flow and token storage.
  Too much for a CLI that only reads.
- **Read only a `GITHUB_TOKEN` env var.** Fine in CI, but most people don't have it set locally.

## Consequences

- No new login and no token stored by repo-ready.
- Users without `gh` get a partial report, not an error.
- The token never appears in output or logs.
