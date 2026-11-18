# 0003. Publish to npm from GitHub Actions with Trusted Publishing

- Status: accepted
- Date: 2026-11-18

## Context

Versions up to `0.1.1` were published with `npm publish` from a laptop. That works, but:

- what gets published is whatever is built on that laptop, not what CI tested;
- nobody can check where a version came from (no provenance);
- a publish token, if one is ever created for automation, is a long-lived secret that can leak.

repo-ready tells people to keep secrets out of their repos and to trust CI. Its own releases
should follow the same rules.

## Decision

Publish from `.github/workflows/publish.yml` when a GitHub release is published, using npm
Trusted Publishing (OIDC):

- npm is told to trust this repo and this workflow file, so no npm token exists at all;
- every version gets a provenance statement linking it to the commit and workflow run;
- the workflow runs the type check, tests and build, checks the release tag matches
  `package.json`, and installs and runs the packed `.tgz` before publishing;
- the workflow only **stages** the version (`npm stage publish`, npm 12). It goes live when the
  maintainer approves it on npmjs.com (Staged Packages) with their security key. The trusted
  publisher is not allowed to run `npm publish` directly, so a compromised workflow alone
  cannot publish a version.

After the first successful publish this way, the package is set to "Require two-factor
authentication and disallow tokens", so the workflow plus approval is the only way to publish.

## Alternatives

- **Keep publishing from the laptop.** No setup, but no provenance, and the published files
  are not the ones CI tested.
- **An npm automation token in a GitHub secret.** Works in CI, but it is a long-lived secret
  that must bypass 2FA, which npm is phasing out.
- **Trusted Publishing with direct `npm publish`.** One step less per release, but npm marks it
  "not recommended": whoever can change the workflow can publish without the maintainer.

## Consequences

- A release is: merge to `main`, create the GitHub release, then approve the staged version on
  npmjs.com → Staged Packages.
- `npm publish` from a laptop stops working once tokens are disallowed. That is intended.
- The npm page shows a provenance badge for each version.
- "Run workflow" on the Publish workflow runs every step up to the smoke test, to test changes
  to the pipeline. It does not stage anything.
