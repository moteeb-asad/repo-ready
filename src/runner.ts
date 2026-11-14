import pc from "picocolors";

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

const icons = {
  pass: pc.green("✓"),
  warn: pc.yellow("!"),
  fail: pc.red("✗"),
};

// A report section. Each folder in src/checks/ exports one from its index.ts.
export type Group = { name: string; checks: Check[] };

export async function run(groups: Group[], repo: string): Promise<Result[]> {
  // Run every check at once, then print in group order.
  const grouped = await Promise.all(
    groups.map(async (group) => ({
      name: group.name,
      results: (await Promise.all(group.checks.map((check) => check()))).flat(),
    })),
  );

  console.log(`${pc.bold("check-repo-ready")}  ${repo}`);

  const hintIndent = " ".repeat(27); // lines the hint up under the message
  for (const group of grouped) {
    console.log(`\n${pc.bold(group.name)}`);
    let lastHint: string | undefined;

    for (const result of group.results) {
      console.log(`  ${icons[result.status]} ${(result.label ?? result.id).padEnd(20)}   ${result.message}`);

      // A hint shared by consecutive lines prints once.
      if (result.status !== "pass" && result.hint && result.hint !== lastHint) {
        console.log(pc.dim(`${hintIndent}→ ${result.hint}`));
      }
      lastHint = result.hint;
    }
  }

  const results = grouped.flatMap((group) => group.results);
  const problems = results.filter((result) => result.status === "fail").length;
  const warnings = results.filter((result) => result.status === "warn").length;
  console.log(`\n${problems} problem${problems === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`);

  return results;
}
