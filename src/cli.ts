#!/usr/bin/env node
import { Command } from "commander";
import { spawn } from "child_process";
import * as fs from "fs";
import chalk from "chalk";
import {
  ensureTermmindDir,
  getConfig,
  LOG_FILE,
  HISTORY_FILE,
} from "./config";
import { assembleContext } from "./contextAssembler";
import { diagnose } from "./grokClient";
import { createServer } from "./server";
import { findSimilar } from "./similarity";
import { loadHistory, appendHistory } from "./historyStore";
import { ResolvedErrorRecord } from "./types";
import open from "open";

const program = new Command();

program
  .name("termmind")
  .description(
    "Voice-narrated live debugging copilot (Phase 1: text-only MVP)"
  );

// ---------------------------------------------------------------------------
// termmind record <command...>
// Runs your dev command as a child process, streams its output to your
// terminal AS NORMAL, and simultaneously appends everything to
// .termmind/session.log. This is the Phase-1 stand-in for the full node-pty
// wrapper described in the design doc — much simpler to build, and it's
// exactly the same log file the "ask" command reads from, so upgrading to
// a real PTY wrapper later is a drop-in replacement, not a rewrite.
// ---------------------------------------------------------------------------
program
  .command("record")
  .description("Run a command and log its output for later diagnosis")
  .argument("<command...>", "the command to run, e.g. npm run dev")
  .action((commandParts: string[]) => {
    ensureTermmindDir();
    const commandStr = commandParts.join(" ");
    const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

    logStream.write(`\n\n----- ${new Date().toISOString()} :: ${commandStr} -----\n`);
    console.log(chalk.cyan(`[termmind] recording: ${commandStr}`));
    console.log(chalk.gray(`[termmind] logging to ${LOG_FILE}`));

    const child = spawn(commandStr, { shell: true });

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });
    child.on("close", (code) => {
      logStream.write(`\n----- process exited with code ${code} -----\n`);
      logStream.end();
      process.exit(code ?? 0);
    });
  });

// ---------------------------------------------------------------------------
// termmind ask "<question>"
// Assembles context (log tail + git diff) and asks Groq to diagnose.
// ---------------------------------------------------------------------------
program
  .command("ask")
  .description("Ask why something broke, using recent terminal output + git diff as context")
  .argument("<question>", "your question, e.g. \"why did this break?\"")
  .action(async (question: string) => {
    ensureTermmindDir();
    try {
      const config = getConfig();
      console.log(chalk.gray("[termmind] assembling context..."));
      const ctx = await assembleContext(config.contextLines);

      const history = loadHistory();
      const similarPast = findSimilar(question, history);
      if (similarPast.length > 0) {
        console.log(
          chalk.magenta(
            `[termmind] found ${similarPast.length} similar past error(s) — using as extra context`
          )
        );
      }

      console.log(chalk.gray("[termmind] asking Groq..."));
      const result = await diagnose(question, ctx, config.apiKey, config.model, similarPast);

      console.log("\n" + chalk.bold.yellow("Diagnosis"));
      console.log(chalk.white(result.cause));
      console.log("\n" + chalk.bold.green("Suggested fix"));
      console.log(chalk.white(result.suggestedFix));
      if (result.relevantFile) {
        console.log(
          "\n" +
          chalk.gray(
            `Relevant: ${result.relevantFile}${result.relevantLine ? ":" + result.relevantLine : ""}`
          )
        );
      }
      if (result.referencedPastFix) {
        console.log(chalk.magenta("(diagnosis references a similar error you resolved before)"));
      }
      console.log(chalk.gray(`Confidence: ${result.confidence}\n`));

      appendHistory({
        timestamp: new Date().toISOString(),
        question,
        diagnosis: result,
      });
    } catch (err) {
      console.error(chalk.red(`[termmind] error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// termmind history
// Quick text view of past diagnoses — the CLI precursor to the dashboard.
// ---------------------------------------------------------------------------
program
  .command("history")
  .description("List past questions and diagnoses for this project")
  .action(() => {
    const records = loadHistory();
    if (records.length === 0) {
      console.log(chalk.gray("No history yet — run `termmind ask` first."));
      return;
    }
    records.forEach((r, i) => {
      console.log(chalk.bold(`\n${i + 1}. [${r.timestamp}] ${r.question}`));
      console.log(chalk.white(`   ${r.diagnosis.cause}`));
    });
  });

// ---------------------------------------------------------------------------
// termmind debug
// Safe way to verify which .env / key termmind is actually loading, without
// ever printing the full key. Use this whenever auth errors look inconsistent.
// ---------------------------------------------------------------------------
program
  .command("debug")
  .description("Show which config/key termmind is loading (safe — never prints the full key)")
  .action(() => {
    try {
      const config = getConfig();
      console.log(chalk.cyan("[termmind] config loaded from:"), require("path").join(__dirname, "..", ".env"));
      console.log(chalk.cyan("[termmind] model:"), config.model);
      console.log(chalk.cyan("[termmind] key preview:"), config.keyPreview);
    } catch (err) {
      console.error(chalk.red(`[termmind] error: ${(err as Error).message}`));
    }
  });

// ---------------------------------------------------------------------------
// termmind serve
// Starts the local voice UI. Run this from inside the project you're
// debugging (same as `record`/`ask`) — it reads .termmind/session.log and
// git diffs from whatever directory it's launched in.
// ---------------------------------------------------------------------------
program
  .command("serve")
  .description("Start the voice UI (hold-to-talk mic → transcribe → diagnose → speak)")
  .option("-p, --port <port>", "port to run on", "4756")
  .action(async (opts: { port: string }) => {
    try {
      getConfig(); // fail fast with a clear error if the key is missing
    } catch (err) {
      console.error(chalk.red(`[termmind] error: ${(err as Error).message}`));
      process.exit(1);
    }
    ensureTermmindDir();
    const port = parseInt(opts.port, 10);
    const app = createServer();
    app.listen(port, async () => {
      const url = `http://localhost:${port}`;
      console.log(chalk.cyan(`[termmind] voice UI running at ${url}`));
      console.log(chalk.gray("[termmind] leave this running, keep your other tab open with `termmind record ...`"));
      await open(url);
    });
  });

program.parse();