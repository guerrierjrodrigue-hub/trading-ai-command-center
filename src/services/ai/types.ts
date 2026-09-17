import type { Candle, Quote } from "@/services/market/types";

/**
 * Structured, reproducible analysis contract. Every field the PRD asks for is
 * here. Crucially, `type` is always "scenario" and a disclaimer is mandatory —
 * the AI never presents output as a certainty or a profit guarantee.
 */
export interface AssetAnalysis {
  type: "scenario";
  symbol: string;
  asOf: string; // ISO timestamp
  marketOverview: string;
  trend: string;
  momentum: string;
  support: number | null;
  resistance: number | null;
  volume: string;
  volatility: string;
  possibleSetup: string;
  entryZone: [number, number] | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  confidenceScore: number; // 0..100 — confidence in the READ, not a profit odds
  risks: string[];
  invalidationScenario: string;
  bullScenario: string;
  bearScenario: string;
  disclaimer: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface JournalInsight {
  summary: string;
  patterns: string[];
  suggestions: string[];
  disclaimer: string;
}

export interface AnalyzeInput {
  symbol: string;
  quote: Quote;
  candles: Candle[];
}

export interface AIProvider {
  readonly name: string;
  analyzeAsset(input: AnalyzeInput): Promise<AssetAnalysis>;
  chat(messages: ChatMessage[], context?: string): Promise<{ text: string }>;
  analyzeJournal(
    entries: Array<Record<string, unknown>>,
  ): Promise<JournalInsight>;
}

export const AI_DISCLAIMER =
  "Ceci est un scénario d'analyse généré automatiquement, pas un conseil financier ni une garantie de profit. Les marchés comportent un risque de perte.";
