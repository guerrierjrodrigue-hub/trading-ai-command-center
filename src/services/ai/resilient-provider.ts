import { env } from "@/lib/env";
import { MockAIProvider } from "./mock-provider";
import {
  AI_DISCLAIMER,
  type AIProvider,
  type AnalyzeInput,
  type AssetAnalysis,
  type ChatMessage,
  type JournalInsight,
} from "./types";

/**
 * Wraps the configured AI provider with reliability guarantees:
 *  - TIMEOUT/FAILURE FALLBACK: if the real provider throws or times out, we
 *    serve the deterministic mock instead, tagged so the user knows it's a
 *    fallback. The app never hangs or shows a hard error for AI.
 *  - CACHE: successful asset analyses are cached briefly and reused, so a
 *    repeated "Analyse BTC" is instant instead of re-running a slow local LLM.
 */

interface CacheEntry {
  at: number;
  value: AssetAnalysis;
}
const analysisCache = new Map<string, CacheEntry>();
const FALLBACK_NOTE =
  "⚠️ Analyse de secours : l'IA n'a pas répondu à temps (ou a échoué). Voici une lecture technique automatique en attendant.";

export class ResilientAIProvider implements AIProvider {
  readonly name: string;
  constructor(private inner: AIProvider, private mock = new MockAIProvider()) {
    this.name = inner.name;
  }

  async analyzeAsset(input: AnalyzeInput): Promise<AssetAnalysis> {
    const last = input.candles[input.candles.length - 1]?.time ?? 0;
    const key = `analyze:${input.symbol}:${input.candles.length}:${last}`;
    const hit = analysisCache.get(key);
    if (hit && Date.now() - hit.at < env.ai.cacheTtlSeconds * 1000) return hit.value;

    try {
      const value = await this.inner.analyzeAsset(input);
      analysisCache.set(key, { at: Date.now(), value });
      return value;
    } catch {
      const fb = await this.mock.analyzeAsset(input);
      return { ...fb, marketOverview: `${FALLBACK_NOTE} ${fb.marketOverview}`.trim() };
    }
  }

  async chat(messages: ChatMessage[], context?: string): Promise<{ text: string }> {
    try {
      return await this.inner.chat(messages, context);
    } catch {
      const fb = await this.mock.chat(messages, context);
      return { text: `${FALLBACK_NOTE}\n\n${fb.text}\n\n${AI_DISCLAIMER}` };
    }
  }

  async analyzeJournal(entries: Array<Record<string, unknown>>): Promise<JournalInsight> {
    try {
      return await this.inner.analyzeJournal(entries);
    } catch {
      return this.mock.analyzeJournal(entries);
    }
  }
}
