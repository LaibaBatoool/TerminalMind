import express, { Express } from "express";
import multer from "multer";
import * as path from "path";
import { getConfig, ensureTermmindDir } from "./config";
import { assembleContext } from "./contextAssembler";
import { diagnose } from "./grokClient";
import { transcribeAudio } from "./whisperClient";
import { findSimilar } from "./similarity";
import { loadHistory, appendHistory } from "./historyStore";

// Audio arrives as a small in-memory blob (a few seconds of speech) — no
// need to write it to disk first, so memoryStorage keeps this simple.
const upload = multer({ storage: multer.memoryStorage() });

export function createServer(): Express {
  const app = express();

  // The frontend (public/index.html) is plain HTML/JS — no build step,
  // no framework — so it stays fast to iterate on and easy to read.
  app.use(express.static(path.join(__dirname, "..", "public")));
  // The React dashboard is a separate Vite project — built separately
  // (`npm run build` inside dashboard/), served here as static files under
  // /dashboard so both UIs can run off this one Express server/port.
  app.use("/dashboard", express.static(path.join(__dirname, "..", "dashboard", "dist")));

  app.get("/api/history", (_req, res) => {
    try {
      const history = loadHistory();
      // Newest first — most relevant to a "recent activity" dashboard view.
      res.json({ history: [...history].reverse() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/ask-voice", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio received." });
      }

      const config = getConfig();
      ensureTermmindDir();

      const question = await transcribeAudio(
        req.file.buffer,
        req.file.mimetype,
        config.apiKey,
        config.whisperModel
      );

      const ctx = await assembleContext(config.contextLines);
      const history = loadHistory();
      const similarPast = findSimilar(question, history);
      const result = await diagnose(question, ctx, config.apiKey, config.model, similarPast);

      appendHistory({
        timestamp: new Date().toISOString(),
        question,
        diagnosis: result,
      });

      res.json({ question, diagnosis: result, similarPastCount: similarPast.length });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}