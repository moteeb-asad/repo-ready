// File paths that need different treatment in the Secrets checks.

// Tests, fixtures, mocks and sample data: fake keys and example config live here.
export const TEST_PATH =
  /(^|\/)(tests?|__tests__|e2e|testing|specs?|fixtures?|mocks?|__mocks__|seeds?)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py|rb)$|(^|\/)(test_[^/]*\.py|conftest\.py)$|(^|\/)[^/]*(dummy|mock|fake|sample)[^/]*\.[a-z]+$/i;

// Documentation: examples, not code that runs.
export const DOCS_PATH = /\.(md|mdx|markdown|rst|txt|adoc)$|(^|\/)docs?\//i;

// Not the project's own code: patches, minified bundles, vendored code, lockfiles.
export const VENDOR_PATH =
  /\.(patch|diff)$|\.min\.[a-z]+$|(^|\/)(vendor|third[_-]party|node_modules)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

// .env.example and its variants: .env.local.example, .env.sample, .env.template.
export function isEnvExample(file: string): boolean {
  const name = file.split("/").at(-1) ?? "";
  return /^\.env(\..+)?\.(example|sample|template)$/i.test(name);
}
