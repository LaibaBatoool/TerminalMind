import { AssembledContext, Diagnosis } from "./types";
import { SimilarMatch } from "./similarity";

// Groq (console.groq.com) — NOT the same company as xAI's "Grok". Groq runs
// open-source models (Llama, etc.) on custom hardware and has a genuinely
// free tier: no credit card, gated only by rate limits (30 req/min).
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are a terminal debugging assistant. You will be given:
1. Recent terminal output (may include errors, stack traces, command output)
2. The current unstaged git diff
3. The diff from the last commit
4. A list of changed files
5. Optionally, similar errors this developer resolved before, with what fixed them
6. A question from the developer

Diagnose the most likely root cause of any error present, and suggest a concrete fix.
Ground your answer in the ACTUAL code/diff shown to you — do not give generic advice
if specific context is available. If a similar past fix is given and it plausibly
applies here, say so explicitly and reference it — that's more valuable to the
developer than a generic diagnosis.

Respond with ONLY a raw JSON object (no markdown fences, no preamble) matching this shape:
{
  "cause": string,
  "confidence": "low" | "medium" | "high",
  "suggestedFix": string,
  "relevantFile": string | null,
  "relevantLine": number | null,
  "referencedPastFix": boolean
}`;

function buildUserPrompt(
  question: string,
  ctx: AssembledContext,
  similarPast: SimilarMatch[]
): string {
  const pastFixesBlock =
    similarPast.length > 0
      ? similarPast
        .map(
          (m, i) =>
            `${i + 1}. (similarity ${(m.score * 100).toFixed(0)}%) Past question: "${m.record.question}"\n   Past cause: ${m.record.diagnosis.cause}\n   Past fix: ${m.record.diagnosis.suggestedFix}`
        )
        .join("\n\n")
      : "(no similar past errors found)";

  return `QUESTION: ${question}

--- RECENT TERMINAL OUTPUT ---
${ctx.recentTerminalOutput}

--- UNSTAGED GIT DIFF ---
${ctx.gitDiffUnstaged}

--- LAST COMMIT DIFF ---
${ctx.gitDiffLastCommit}

--- CHANGED FILES ---
${ctx.changedFiles.join(", ") || "(none)"}

--- SIMILAR PAST RESOLVED ERRORS ---
${pastFixesBlock}`;
}

function stripCodeFences(text: string): string {
  // Models sometimes wrap JSON in ```json fences despite instructions.
  return text.replace(/```json\s*|```\s*/g, "").trim();
}

export async function diagnose(
  question: string,
  ctx: AssembledContext,
  apiKey: string,
  model: string,
  similarPast: SimilarMatch[] = []
): Promise<Diagnosis> {
  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(question, ctx, similarPast) },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText) {
    throw new Error("Groq API returned an empty response.");
  }

  try {
    return JSON.parse(stripCodeFences(rawText)) as Diagnosis;
  } catch {
    // Fallback: if the model didn't return clean JSON, surface the raw text
    // rather than crashing — still useful to the developer.
    return {
      cause: rawText,
      confidence: "low",
      suggestedFix: "(model did not return structured JSON — see cause field)",
      relevantFile: null,
      relevantLine: null,
      referencedPastFix: false,
    };
  }
}