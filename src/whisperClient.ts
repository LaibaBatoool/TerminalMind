const GROQ_TRANSCRIBE_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

// Groq hosts Whisper (OpenAI's open speech model) on the same free-tier
// account as the chat models — no separate signup, no local whisper.cpp
// build. -turbo is faster and cheaper on Groq's paid tier; if it's ever
// deprecated, swap to "whisper-large-v3" via GROQ_WHISPER_MODEL in .env.
const DEFAULT_WHISPER_MODEL = "whisper-large-v3-turbo";

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  model?: string
): Promise<string> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  form.append("file", blob, "audio.webm");
  form.append("model", model || DEFAULT_WHISPER_MODEL);

  const response = await fetch(GROQ_TRANSCRIBE_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq transcription error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.text;
  if (!text) throw new Error("Groq transcription returned no text — try speaking more clearly or closer to the mic.");
  return text.trim();
}
