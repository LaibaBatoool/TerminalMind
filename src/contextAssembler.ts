import * as fs from "fs";
import simpleGit, { SimpleGit } from "simple-git";
import { LOG_FILE } from "./config";
import { AssembledContext } from "./types";

const git: SimpleGit = simpleGit();

// This is the core design decision the README calls out: we never dump the
// whole session into the LLM. We keep only the last N lines of terminal
// output. Phase 3 (RAG) is where older history gets summarized/embedded
// instead of discarded — for now, discarding is the "compression."
function tailLines(filePath: string, maxLines: number): string {
  if (!fs.existsSync(filePath)) return "(no session log yet — run `termmind record <command>` first)";
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  return lines.slice(-maxLines).join("\n");
}

async function safeDiff(args: string[]): Promise<string> {
  try {
    const diff = await git.diff(args);
    return diff || "(no changes)";
  } catch {
    // Not a git repo, or no commits yet — don't crash the whole ask.
    return "(git diff unavailable — not a git repo, or no prior commits)";
  }
}

async function safeChangedFiles(): Promise<string[]> {
  try {
    const status = await git.status();
    return [...status.modified, ...status.not_added, ...status.created];
  } catch {
    return [];
  }
}

export async function assembleContext(contextLines: number): Promise<AssembledContext> {
  const [gitDiffUnstaged, gitDiffLastCommit, changedFiles] = await Promise.all([
    safeDiff([]),
    safeDiff(["HEAD~1"]),
    safeChangedFiles(),
  ]);

  return {
    recentTerminalOutput: tailLines(LOG_FILE, contextLines),
    gitDiffUnstaged,
    gitDiffLastCommit,
    changedFiles,
  };
}
