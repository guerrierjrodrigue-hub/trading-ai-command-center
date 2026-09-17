import { clamp } from "@/lib/utils";
import { searchKnowledge, formatKnowledgeForPrompt } from "@/services/knowledge";
import {
  ANALYST_SYSTEM_PROMPT,
  JOURNAL_SYSTEM_PROMPT,
  analyzeUserPrompt,
  buildMarketSnapshot,
} from "./prompts";

/** Appends grounded book passages to a system prompt when any are relevant. */
function withKnowledge(system: string, query: string, k = 4): string {
  const block = formatKnowledgeForPrompt(searchKnowledge(query, k));
  return block ? `${system}\n\n${block}` : system;
}
import {
  AI_DISCLAIMER,
  type AIProvider,
  type AnalyzeInput,
  type AssetAnalysis,
  type ChatMessage,
  type JournalInsight,
} from "./types";

/** Extract the first JSON object from a possibly-noisy LLM string. */
function extractJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Shared implementation for any chat-completion LLM. Concrete providers only
 * implement `complete()`. This keeps OpenAI/Anthropic/Ollama thin and identical
 * in behaviour, and guarantees the scenario/disclaimer contract regardless of
 * what the model returns.
 */
export abstract class LLMProvider implements AIProvider {
  abstract readonly name: string;
  protected abstract complete(system: string, user: string): Promise<string>;

  async analyzeAsset(input: AnalyzeInput): Promise<AssetAnalysis> {
    const snapshot = buildMarketSnapshot(input);
    const system = withKnowledge(
      ANALYST_SYSTEM_PROMPT,
      `${input.symbol} analyse technique tendance support résistance RSI MACD Fibonacci divergence setup`,
    );
    const raw = await this.complete(system, analyzeUserPrompt(snapshot));
    const j = extractJson<Record<string, unknown>>(raw) ?? {};
    const entry = j.entryZone as unknown;
    const entryZone: [number, number] | null =
      Array.isArray(entry) && entry.length === 2
        ? [Number(entry[0]), Number(entry[1])]
        : null;

    return {
      type: "scenario",
      symbol: input.symbol,
      asOf: new Date().toISOString(),
      marketOverview: String(j.marketOverview ?? ""),
      trend: String(j.trend ?? ""),
      momentum: String(j.momentum ?? ""),
      support: num(j.support),
      resistance: num(j.resistance),
      volume: String(j.volume ?? ""),
      volatility: String(j.volatility ?? ""),
      possibleSetup: String(j.possibleSetup ?? ""),
      entryZone,
      stopLoss: num(j.stopLoss),
      takeProfit: num(j.takeProfit),
      riskReward: num(j.riskReward),
      confidenceScore: clamp(num(j.confidenceScore) ?? 50, 0, 100),
      risks: Array.isArray(j.risks) ? (j.risks as unknown[]).map(String) : [],
      invalidationScenario: String(j.invalidationScenario ?? ""),
      bullScenario: String(j.bullScenario ?? ""),
      bearScenario: String(j.bearScenario ?? ""),
      disclaimer: AI_DISCLAIMER,
    };
  }

  async chat(messages: ChatMessage[], context?: string): Promise<{ text: string }> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const base = `Tu es un co-pilote de trading discipliné. Tu raisonnes en scénarios probabilistes, jamais en certitudes, et tu ne donnes pas de conseil financier. ${context ? `Contexte:\n${context}` : ""}`;
    const system = withKnowledge(base, lastUser);
    const user = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const text = await this.complete(system, user);
    return { text: `${text}\n\n${AI_DISCLAIMER}` };
  }

  async analyzeJournal(entries: Array<Record<string, unknown>>): Promise<JournalInsight> {
    const system = withKnowledge(
      JOURNAL_SYSTEM_PROMPT,
      "psychologie discipline gestion du risque plan de trading erreurs money management",
    );
    const raw = await this.complete(
      system,
      `Journal (JSON):\n${JSON.stringify(entries).slice(0, 8000)}`,
    );
    const j = extractJson<Record<string, unknown>>(raw) ?? {};
    return {
      summary: String(j.summary ?? ""),
      patterns: Array.isArray(j.patterns) ? (j.patterns as unknown[]).map(String) : [],
      suggestions: Array.isArray(j.suggestions)
        ? (j.suggestions as unknown[]).map(String)
        : [],
      disclaimer: AI_DISCLAIMER,
    };
  }
}
