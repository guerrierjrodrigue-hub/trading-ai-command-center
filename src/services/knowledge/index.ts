import corpusJson from "./corpus.json";

/**
 * Local, offline knowledge base built from the user's trading book.
 * Lexical retrieval (BM25) — no embeddings, no API, works fully offline.
 * The AI co-pilot uses it to ground its answers in the book's strategies.
 */

export interface KnowledgeChunk {
  id: string;
  page: number;
  section: string;
  title: string;
  text: string;
}
export interface KnowledgeHit extends KnowledgeChunk {
  score: number;
}
interface Corpus {
  meta: { source: string; pages: number; chunks: number; skippedBlankPages: number };
  chunks: KnowledgeChunk[];
}

const corpus = corpusJson as Corpus;

// Small French/English stopword set — enough to keep BM25 focused on content.
const STOP = new Set(
  ("au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me " +
    "meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta " +
    "te tes toi ton tu un une vos votre vous c d j l m n s t y est sont etre a the of to and " +
    "in is it for on your you are with as this that").split(/\s+/),
);

/** lowercase, strip accents, split to alphanumeric tokens, drop stopwords/short. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics (combining marks)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

interface Index {
  docs: { tf: Map<string, number>; len: number }[];
  idf: Map<string, number>;
  avgdl: number;
}

let cachedIndex: Index | null = null;

function buildIndex(): Index {
  const docs = corpus.chunks.map((c) => {
    const tokens = tokenize(`${c.title} ${c.title} ${c.text}`); // title weighted x2
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { tf, len: tokens.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const term of d.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [term, n] of df) idf.set(term, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, N);
  return { docs, idf, avgdl };
}

function getIndex(): Index {
  if (!cachedIndex) cachedIndex = buildIndex();
  return cachedIndex;
}

/** BM25 search. Returns up to `k` chunks scoring above `minScore`, best first. */
export function searchKnowledge(query: string, k = 4, minScore = 0.5): KnowledgeHit[] {
  const idx = getIndex();
  const qTerms = [...new Set(tokenize(query))];
  if (!qTerms.length) return [];
  const k1 = 1.5;
  const b = 0.75;

  const scored = idx.docs.map((d, i) => {
    let score = 0;
    for (const term of qTerms) {
      const f = d.tf.get(term);
      if (!f) continue;
      const idf = idx.idf.get(term) ?? 0;
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / idx.avgdl)));
    }
    return { chunk: corpus.chunks[i], score };
  });

  return scored
    .filter((s) => s.score > minScore)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k)
    .map((s) => ({ ...s.chunk, score: Math.round(s.score * 1000) / 1000 }));
}

/** Formats hits as a grounded-context block for an LLM prompt. */
export function formatKnowledgeForPrompt(hits: KnowledgeHit[]): string {
  if (!hits.length) return "";
  const body = hits
    .map((h) => `[${h.title} — p.${h.page}]\n${h.text}`)
    .join("\n\n---\n\n");
  return (
    "Base de connaissances (extraits du manuel de trading personnel de l'utilisateur). " +
    "Appuie-toi dessus quand c'est pertinent, cite les principes, mais reste factuel et prudent :\n\n" +
    body
  );
}

export function knowledgeMeta() {
  return corpus.meta;
}
