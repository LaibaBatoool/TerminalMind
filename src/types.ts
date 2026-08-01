// Shape of the context we hand to the LLM. Keeping this explicit (rather than
// a raw string blob) makes it easy to log, test, and later swap in a
// smarter context-assembly strategy (e.g. summarized older history).
export interface AssembledContext {
  recentTerminalOutput: string;
  gitDiffUnstaged: string;
  gitDiffLastCommit: string;
  changedFiles: string[];
}

// The structured response we ask the model to return. Forcing JSON keeps
// the CLI output consistent and makes this easy to extend later (e.g. a
// dashboard that renders `relevantFile` + `relevantLine` as a clickable link).
export interface Diagnosis {
  cause: string;
  confidence: "low" | "medium" | "high";
  suggestedFix: string;
  relevantFile: string | null;
  relevantLine: number | null;
  referencedPastFix: boolean;
}

export interface ResolvedErrorRecord {
  timestamp: string;
  question: string;
  diagnosis: Diagnosis;
}
