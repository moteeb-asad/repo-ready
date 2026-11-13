# 0001. Read branch protection from the Rulesets API

- Status: accepted
- Date: 2026-11-13

## Context

The `branch-protection` check must say whether `main` and `develop` are protected.
GitHub has two systems for this: classic branch protection and rulesets.
A branch can be protected by either one, or both.

The classic endpoint, `GET /repos/{owner}/{repo}/branches/{branch}/protection`,
needs admin access and does not see rulesets.

## Decision

Use `GET /repos/{owner}/{repo}/rules/branches/{branch}`.
It returns the rules actually in force on the branch, from every ruleset that applies.

Use the `protected` field from `GET /repos/{owner}/{repo}/branches/{branch}`
to catch branches that only have classic protection.

## Alternatives

- **Classic protection endpoint only.** Misses rulesets, which is what GitHub now recommends.
  Needs admin access, so it fails for most users who just cloned a repo.
- **List rulesets with `GET /repos/{owner}/{repo}/rulesets`.** Returns ruleset definitions,
  not what applies to one branch. We would have to match branch patterns ourselves.

## Consequences

- The check works with read access, not only admin.
- `--fix` creates a ruleset, not classic protection.
- A branch with only classic protection shows as protected, but without rule details.
