import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import { execa } from "execa";
import { isShallow, SHALLOW_HINT, trackedFiles } from "../../../git.js";
import type { Result } from "../../../types.js";

const ID = "agent-files";

// Files AI coding agents keep for one developer's machine. Claude Code saves approved commands
// here, secrets included ("Yes, and don't ask again"). They must never be committed.
const LOCAL_AGENT_FILE = /(^|\/)(\.claude\/settings\.local\.json|CLAUDE\.local\.md)$/;

export function findLocalAgentFiles(files: string[]): string[] {
  return files.filter((file) => LOCAL_AGENT_FILE.test(file));
}

// Folders that use Claude Code: they track a .claude/ folder or a CLAUDE.md. "" is the repo root.
export function claudeFolders(files: string[]): string[] {
  const folders = new Set<string>();
  for (const file of files) {
    const claudeDir = file.match(/^(.*?)\.claude\//);
    if (claudeDir) folders.add(claudeDir[1] ?? "");
    if (posix.basename(file) === "CLAUDE.md") folders.add(file.slice(0, -"CLAUDE.md".length));
  }
  return [...folders];
}

// One line of `git check-ignore -v`: "<source>:<line>:<pattern>\t<path>".
// Only a .gitignore inside the repo protects every clone. A global ignore file (an absolute,
// often quoted path) or .git/info/exclude only protects this machine.
export function ignoredByRepo(checkIgnoreLine: string): boolean {
  const source = checkIgnoreLine.match(/^(.*):\d+:.*\t/)?.[1] ?? "";
  if (!source || source.startsWith('"') || /^([A-Za-z]:|\/|\\)/.test(source)) return false;
  return /(^|\/)\.gitignore$/.test(source);
}

export type AgentFilesState = {
  tracked: string[];
  inHistory: { file: string; commit: string; when: string }[];
  notIgnored: string[]; // settings.local.json paths in Claude Code folders that no repo .gitignore covers
  historySkipped: string | undefined; // why the history was not read, e.g. "shallow clone"
};

export function judgeAgentFiles({ tracked, inHistory, notIgnored, historySkipped }: AgentFilesState): Result {
  if (tracked.length > 0) {
    return {
      id: ID,
      status: "fail",
      message: `tracked by git: ${tracked.join(", ")}`,
      hint: `git rm --cached ${tracked.join(" ")}, add it to .gitignore, and rotate any secret it holds`,
    };
  }
  if (inHistory.length > 0) {
    const list = inHistory.map((h) => `${h.file} (${h.commit}, ${h.when})`).join(", ");
    return {
      id: ID,
      status: "fail",
      message: `committed in history: ${list}`,
      hint: "Rotate every secret it held. Deleting the file does not remove it from history",
    };
  }
  if (notIgnored.length > 0) {
    return {
      id: ID,
      status: "warn",
      message: `${notIgnored.join(", ")} is not in .gitignore (a global ignore only protects your machine)`,
      hint: "Add .claude/settings.local.json and CLAUDE.local.md to the repo's .gitignore",
    };
  }
  // Nothing tracked, but the history was not read: a pass would mislead.
  if (historySkipped) {
    return {
      id: ID,
      status: "warn",
      message: `no local AI agent files tracked, history not checked: ${historySkipped}`,
      hint: historySkipped === "shallow clone" ? SHALLOW_HINT : "Run git log --all in this folder to see the error",
    };
  }
  return { id: ID, status: "pass", message: "no local AI agent files tracked" };
}

// `lines` is git log output: "@@<hash>|<relative date>" then the added file names.
export function parseHistory(lines: string[]): AgentFilesState["inHistory"] {
  const found: AgentFilesState["inHistory"] = [];
  let commit = "";
  let when = "";
  for (const line of lines) {
    if (line.startsWith("@@")) [commit = "", when = ""] = line.slice(2).split("|");
    else if (LOCAL_AGENT_FILE.test(line)) found.push({ file: line, commit, when });
  }
  return found;
}

export async function agentFiles(): Promise<Result> {
  const files = await trackedFiles();
  const tracked = findLocalAgentFiles(files);

  const shallow = await isShallow();
  const log = shallow
    ? undefined
    : await execa(
        "git",
        ["log", "--all", "--diff-filter=A", "--name-only", "--format=@@%h|%cr", "--", ":/*.claude/settings.local.json", ":/*CLAUDE.local.md"],
        { lines: true, reject: false },
      );
  const inHistory = log && !log.failed ? parseHistory(log.stdout) : [];
  const historySkipped = shallow ? "shallow clone" : log?.failed ? `git log failed (exit code ${log.exitCode})` : undefined;

  // check-ignore takes paths from the repo root.
  const root = (await execa("git", ["rev-parse", "--show-toplevel"])).stdout;
  const folders = new Set(claudeFolders(files));
  // The file can exist without anything Claude-related being tracked: one `git add .` from leaking.
  if (existsSync(join(root, ".claude", "settings.local.json"))) folders.add("");

  const notIgnored: string[] = [];
  for (const folder of folders) {
    const path = `${folder}.claude/settings.local.json`;
    const check = await execa("git", ["check-ignore", "-v", "--no-index", path], { cwd: root, reject: false });
    if (!ignoredByRepo(check.stdout)) notIgnored.push(path);
  }

  return judgeAgentFiles({ tracked, inHistory, notIgnored, historySkipped });
}
