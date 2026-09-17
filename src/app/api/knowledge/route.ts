import { authUserId, ok } from "@/lib/api";
import { searchKnowledge, knowledgeMeta } from "@/services/knowledge";

/** Search the personal trading-book knowledge base (grounds the AI co-pilot). */
export async function GET(req: Request) {
  const auth = await authUserId();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").slice(0, 300);
  const k = Math.min(8, Math.max(1, Number(url.searchParams.get("k")) || 5));
  const hits = q ? searchKnowledge(q, k, 0.3) : [];
  return ok({
    meta: knowledgeMeta(),
    query: q,
    hits: hits.map((h) => ({ id: h.id, page: h.page, section: h.section, title: h.title, text: h.text, score: h.score })),
  });
}
