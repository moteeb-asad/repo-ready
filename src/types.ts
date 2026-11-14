// The contract between checks and the runner. Types used by one file stay in that file.

export type Result = {
  id: string;
  label?: string; // shown instead of the id, e.g. a branch name
  status: "pass" | "warn" | "fail";
  message: string;
  hint?: string; // what to do about a warning or failure
  fix?: () => Promise<void>;
};

// A check returns one result, or one per item it looks at (e.g. per branch).
export type Check = () => Promise<Result | Result[]>;

// A report section. Each folder in src/checks/ exports one from its index.ts.
export type Group = { name: string; checks: Check[] };
