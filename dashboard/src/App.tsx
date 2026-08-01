import { useEffect, useMemo, useState } from "react";

// Mirrors the backend's types (src/types.ts) — duplicated here rather than
// shared, since the dashboard is a separate Vite project with its own
// build/dependency graph. Small enough surface that keeping them in sync
// by hand is not a real maintenance burden.
interface Diagnosis {
  cause: string;
  confidence: "low" | "medium" | "high";
  suggestedFix: string;
  relevantFile: string | null;
  relevantLine: number | null;
  referencedPastFix: boolean;
}
interface ResolvedErrorRecord {
  timestamp: string;
  question: string;
  diagnosis: Diagnosis;
}

const CONFIDENCE_STYLES: Record<Diagnosis["confidence"], string> = {
  high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryCard({ record }: { record: ResolvedErrorRecord }) {
  const { diagnosis } = record;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-slate-200 font-medium leading-snug">{record.question}</p>
        <span className="text-xs text-slate-500 whitespace-nowrap pt-0.5">
          {formatTimestamp(record.timestamp)}
        </span>
      </div>

      <p className="text-slate-400 text-sm leading-relaxed mb-3">{diagnosis.cause}</p>

      <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 px-3 py-2 mb-3">
        <p className="text-xs uppercase tracking-wide text-emerald-500/80 font-semibold mb-1">
          Fix
        </p>
        <p className="text-slate-300 text-sm leading-relaxed">{diagnosis.suggestedFix}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CONFIDENCE_STYLES[diagnosis.confidence]}`}
        >
          {diagnosis.confidence} confidence
        </span>
        {diagnosis.relevantFile && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800/60 text-slate-400 font-mono">
            {diagnosis.relevantFile}
            {diagnosis.relevantLine ? `:${diagnosis.relevantLine}` : ""}
          </span>
        )}
        {diagnosis.referencedPastFix && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-sky-500/30 bg-sky-500/15 text-sky-400 font-medium">
            used past fix
          </span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [history, setHistory] = useState<ResolvedErrorRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/history")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => setHistory(data.history))
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    if (!history) return [];
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (r) =>
        r.question.toLowerCase().includes(q) ||
        r.diagnosis.cause.toLowerCase().includes(q) ||
        r.diagnosis.suggestedFix.toLowerCase().includes(q) ||
        (r.diagnosis.relevantFile || "").toLowerCase().includes(q)
    );
  }, [history, search]);

  const stats = useMemo(() => {
    if (!history) return null;
    return {
      total: history.length,
      pastFixUses: history.filter((r) => r.diagnosis.referencedPastFix).length,
      highConfidence: history.filter((r) => r.diagnosis.confidence === "high").length,
    };
  }, [history]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-sky-400">TerminalMind</h1>
          <p className="text-slate-500 text-sm mt-1">Session history &amp; resolved errors</p>
        </header>

        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <p className="text-2xl font-bold text-slate-100">{stats.total}</p>
              <p className="text-xs text-slate-500 mt-0.5">errors diagnosed</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <p className="text-2xl font-bold text-emerald-400">{stats.highConfidence}</p>
              <p className="text-xs text-slate-500 mt-0.5">high confidence</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <p className="text-2xl font-bold text-sky-400">{stats.pastFixUses}</p>
              <p className="text-xs text-slate-500 mt-0.5">reused a past fix</p>
            </div>
          </div>
        )}

        {history && history.length > 0 && (
          <input
            type="text"
            placeholder="Search past errors, fixes, or files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full mb-6 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-600/60"
          />
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-sm px-4 py-3">
            Couldn't load history: {error}. Make sure <code>termmind serve</code> is running.
          </div>
        )}

        {history === null && !error && (
          <p className="text-slate-500 text-sm">Loading session history...</p>
        )}

        {history && history.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-8 text-center">
            <p className="text-slate-400 text-sm">
              No errors diagnosed yet in this project.
            </p>
            <p className="text-slate-600 text-xs mt-1">
              Run <code>termmind ask "..."</code> or use the voice UI to get started.
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((record, i) => (
              <HistoryCard key={record.timestamp + i} record={record} />
            ))}
          </div>
        )}

        {history && history.length > 0 && filtered.length === 0 && (
          <p className="text-slate-600 text-sm text-center py-8">
            No results match "{search}".
          </p>
        )}
      </div>
    </div>
  );
}