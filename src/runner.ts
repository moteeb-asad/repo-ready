import pc from "picocolors";

export type Result = {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: () => Promise<void>;
};

export type Check = () => Promise<Result>;

const icons = {
  pass: pc.green("✓"),
  warn: pc.yellow("!"),
  fail: pc.red("✗"),
};

export async function run(checks: Check[]): Promise<Result[]> {
  const results = await Promise.all(checks.map((check) => check()));

  for (const result of results) {
    console.log(`  ${icons[result.status]} ${result.id.padEnd(20)} ${result.message}`);
  }

  const problems = results.filter((result) => result.status === "fail").length;
  const warnings = results.filter((result) => result.status === "warn").length;
  console.log(
    `\n  ${problems} problem${problems === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`,
  );

  return results;
}
