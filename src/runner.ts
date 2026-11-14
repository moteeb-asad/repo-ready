import pc from "picocolors";

export type Result = {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  hint?: string; // what to do about a warning or failure
  fix?: () => Promise<void>;
};

export type Check = () => Promise<Result>;

const icons = {
  pass: pc.green("✓"),
  warn: pc.yellow("!"),
  fail: pc.red("✗"),
};

// Group name -> checks, printed in this order. Example: { Secrets: [envTracked, envInHistory] }
export type Groups = Record<string, Check[]>;

export async function run(groups: Groups, repo: string): Promise<Result[]> {
  // Run every check at once, then print in group order.
  const grouped = await Promise.all(
    Object.entries(groups).map(async ([name, checks]) => ({
      name,
      results: await Promise.all(checks.map((check) => check())),
    })),
  );

  console.log(`${pc.bold("check-repo-ready")}  ${repo}`);

  const hintIndent = " ".repeat(27); // lines the hint up under the message
  for (const group of grouped) {
    console.log(`\n${pc.bold(group.name)}`);
    let lastHint: string | undefined;

    for (const result of group.results) {
      console.log(`  ${icons[result.status]} ${result.id.padEnd(20)}   ${result.message}`);

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
