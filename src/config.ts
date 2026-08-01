import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// IMPORTANT: termmind is meant to be run as a global command from INSIDE
// whatever project you're debugging (e.g. D:\Laiba\CodeX\MultiTenantBM).
// That means process.cwd() is your project folder, not termmind's own
// install folder. So we deliberately load .env from where termmind itself
// is installed (relative to this compiled file), NOT from cwd — otherwise
// you'd have to copy your API key into every project you ever debug.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// .termmind/ lives inside whatever project directory you run termmind from —
// it holds the session log and the resolved-error history for THAT project.
export const TERMMIND_DIR = path.join(process.cwd(), ".termmind");
export const LOG_FILE = path.join(TERMMIND_DIR, "session.log");
export const HISTORY_FILE = path.join(TERMMIND_DIR, "history.json");

export function ensureTermmindDir(): void {
  if (!fs.existsSync(TERMMIND_DIR)) {
    fs.mkdirSync(TERMMIND_DIR, { recursive: true });
  }
}

export function getConfig() {
  const rawKey = process.env.GROQ_API_KEY;
  if (!rawKey) {
    throw new Error(
      "GROQ_API_KEY is missing. Copy .env.example to .env and add your Groq API key from console.groq.com/keys."
    );
  }
  // .trim() matters more than it looks like it should: Windows editors often
  // leave a trailing \r or trailing space in .env values, which silently
  // breaks the Authorization header and produces confusing, inconsistent
  // "invalid key" errors that look unrelated to whitespace.
  const apiKey = rawKey.trim();
  return {
    apiKey,
    model: (process.env.GROQ_MODEL || "llama-3.3-70b-versatile").trim(),
    whisperModel: (process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo").trim(),
    contextLines: parseInt(process.env.CONTEXT_LINES || "200", 10),
    // Exposed only for debugging — never log the full key.
    keyPreview: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)} (length ${apiKey.length})`,
  };
}
