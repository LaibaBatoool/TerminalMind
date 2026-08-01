# TerminalMind (Phase 1) — text-only debugging copilot

Watches your terminal output, correlates errors with your git diff, and asks
an LLM (Groq — free tier) to diagnose what broke and how to fix it — grounded in your
actual code, not generic Stack Overflow advice.

This is **Phase 1** from the design doc: no voice, no PTY wrapper yet. Just
the core loop: record → ask → diagnose. Everything here is a drop-in
foundation for Phase 2 (voice) and Phase 3 (RAG memory) later.

## How it works

1. `termmind record <your dev command>` — runs your command exactly as
   normal (you see all the output live), and *also* appends everything to
   `.termmind/session.log` in the current project folder.
2. When something breaks, in another terminal tab run
   `termmind ask "why did this break?"`.
3. TerminalMind reads the last N lines of the log, pulls your current git
   diff and last commit's diff, sends it all to Groq, and prints a
   structured diagnosis + suggested fix.
4. Every diagnosis is appended to `.termmind/history.json` — this becomes
   the RAG knowledge base in Phase 3.

## Setup (run once)

```bash
cd termmind
npm install
cp .env.example .env
```

Open `.env` and paste in your Groq API key (get one free, no credit card, at https://console.groq.com/keys):

```
GROQ_API_KEY=your_real_key_here
```

## Running it (every time you use it)

You need **two terminal tabs** open in your project directory.

**Tab 1 — start recording your dev server / test runner:**
```bash
npm run record -- "npm run dev"
```
(replace `"npm run dev"` with whatever command you're actually debugging —
e.g. `"pytest"`, `"npm test"`, `"python app.py"`)

**Tab 2 — whenever something breaks, ask about it:**
```bash
npm run ask -- "why did this break?"
```
or any natural question:
```bash
npm run ask -- "is this related to the change I made yesterday?"
```

**Anytime — see past diagnoses for this project:**
```bash
npm run history
```

**If auth errors look weird/inconsistent:**
```bash
termmind debug
```
Prints which `.env` file is loaded and a safe preview of the key (never the
full key) — use this before assuming the API itself is broken.

## About the free tier

Groq's free tier needs no credit card and is rate-limited rather than
credit-limited — roughly 30 requests/minute, ~1,000 requests/day depending
on the model. That's more than enough for solo dev use. If you ever hit a
`429` error, you've hit the rate limit — just wait a minute and retry.

> Note the `--` before your argument — that's npm's syntax for "pass this
> argument through to the underlying script" rather than to npm itself.

## Phase 2 — voice UI (new)

Instead of typing `termmind ask "..."`, you can now talk to it.

**From inside the project you're debugging:**
```bash
termmind serve
```
This opens `http://localhost:4756` in your browser automatically. Hold the
mic button, ask your question, let go. It transcribes your voice (Groq's
free hosted Whisper), diagnoses using the same pipeline as `ask`, and
**speaks the answer back** using your browser's built-in text-to-speech.

You still need `termmind record "npm run dev"` running in another tab first
— `serve` reads context from the same `.termmind/session.log`, it just adds
a voice front-end on top of the exact same diagnosis pipeline.

Nothing here needed a native module or an offline model download — mic
capture is the browser's `MediaRecorder` API, transcription is a hosted
Groq call, and speech output is the browser's `speechSynthesis` API. This
was a deliberate substitution for the `node-pty` + local `whisper.cpp` +
global-hotkey design in the original doc, specifically to avoid Windows
native-build pain (`node-gyp`/Visual Studio Build Tools) for a feature that
doesn't need to be offline to be useful.

## Where things live (updated)

| File | Purpose |
|---|---|
| `src/cli.ts` | Entry point — wires up `record`, `ask`, `history`, `debug`, `serve` |
| `src/contextAssembler.ts` | Reads log tail + computes git diffs (the "rolling context window" design) |
| `src/grokClient.ts` | Calls the Groq chat API, enforces structured JSON output |
| `src/whisperClient.ts` | Calls Groq's hosted Whisper endpoint for transcription |
| `src/server.ts` | Express server powering the voice UI (`termmind serve`) |
| `public/index.html` | Hold-to-talk mic UI — plain HTML/JS, no build step |
| `src/config.ts` | Loads `.env`, resolves `.termmind/` paths |
| `.termmind/session.log` | Rolling terminal output log (per-project, gitignored) |
| `.termmind/history.json` | Every question + diagnosis, from both `ask` and `serve` (per-project, gitignored) |

## Why the design is the way it is (for your interview notes)

- **Why not just wrap `node-pty` immediately?** `record` here uses plain
  `child_process.spawn` piping to both your terminal and a log file. It's
  functionally the same data (full stdout/stderr capture) with far less
  complexity. Swapping in a real PTY wrapper later only touches `record` —
  `ask`, `contextAssembler`, and `grokClient` don't change at all.
- **Why not send the whole log file to the LLM?** Cost, latency, and token
  limits. `contextAssembler.ts` only keeps the last `CONTEXT_LINES` (default
  200) — this is the "rolling buffer" tradeoff called out in the design doc.
  Phase 3 replaces "discard old lines" with "summarize/embed old lines."
- **Why force JSON output from the model?** So the CLI (and later, a
  dashboard) can reliably parse `relevantFile` / `relevantLine` instead of
  regex-scraping free text.

## Next steps (Phase 3+, not built yet)

- Embed `.termmind/history.json` entries into MongoDB Atlas Vector Search
  so repeated errors surface "you fixed this 2 weeks ago by doing X" —
  retrieve similar past fixes before diagnosing
- Swap `record`'s plain spawn for `node-pty` if you ever need to capture
  interactive prompts/colors more faithfully
- Optional: upgrade TTS from browser `speechSynthesis` to Piper (local,
  free, more natural-sounding) if voice quality matters for a demo
