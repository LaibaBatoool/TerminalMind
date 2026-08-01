import { ResolvedErrorRecord } from "./types";

// A real embedding model (e.g. via a local ONNX runtime) would be more
// semantically precise, but it pulls in a heavy dependency chain — see the
// project history for why that was rejected. For a personal history file
// that stays in the hundreds of entries, not millions, TF-IDF cosine
// similarity recomputed on the fly is simpler, has zero dependencies, and
// is accurate enough: error messages and stack traces are keyword-dense,
// which is exactly what TF-IDF is good at matching.

const STOPWORDS = new Set([
    "the", "is", "are", "was", "were", "be", "been", "being", "and", "or",
    "but", "if", "then", "else", "for", "to", "of", "in", "on", "at", "by",
    "with", "from", "this", "that", "these", "those", "it", "its", "why",
    "does", "did", "do", "has", "have", "had", "again", "not", "no", "yes",
    "you", "your", "will", "would", "should", "could", "can", "may", "might",
    "what", "when", "where", "who", "how", "just", "still", "now",
]);

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function recordToDocument(record: ResolvedErrorRecord): string {
    return `${record.question} ${record.diagnosis.cause} ${record.diagnosis.suggestedFix}`;
}

function termFrequency(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return tf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [term, freqA] of a) {
        normA += freqA * freqA;
        const freqB = b.get(term);
        if (freqB) dot += freqA * freqB;
    }
    for (const freqB of b.values()) normB += freqB * freqB;
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SimilarMatch {
    record: ResolvedErrorRecord;
    score: number;
}

// Returns up to `topK` past records similar to the new question, above a
// minimum relevance threshold (tuned for TF-IDF's typically-lower absolute
// scores compared to real embeddings — 0.15 filters noise without being
// so strict it never matches).
export function findSimilar(
    question: string,
    history: ResolvedErrorRecord[],
    topK = 2,
    minScore = 0.15
): SimilarMatch[] {
    if (history.length === 0) return [];

    const queryTf = termFrequency(tokenize(question));
    const scored: SimilarMatch[] = history.map((record) => ({
        record,
        score: cosineSimilarity(queryTf, termFrequency(tokenize(recordToDocument(record)))),
    }));

    return scored
        .filter((m) => m.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}