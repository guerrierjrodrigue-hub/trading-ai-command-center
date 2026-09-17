import type { AnalyzeInput } from "./types";
import {
  detectTrend,
  ema,
  lastValid,
  macd,
  rsi,
  supportResistance,
} from "@/services/market/indicators";

/** Builds a compact, factual market snapshot string for LLM providers. */
export function buildMarketSnapshot(input: AnalyzeInput): string {
  const closes = input.candles.map((c) => c.close);
  const r = lastValid(rsi(closes, 14));
  const e20 = lastValid(ema(closes, 20));
  const e50 = lastValid(ema(closes, 50));
  const { histogram } = macd(closes);
  const hist = lastValid(histogram);
  const { support, resistance } = supportResistance(input.candles, 60);
  const trend = detectTrend(closes);

  return [
    `Symbol: ${input.symbol}`,
    `Price: ${input.quote.price}`,
    `24h change: ${input.quote.changePct24h}%`,
    `24h high/low: ${input.quote.high24h} / ${input.quote.low24h}`,
    `Trend: ${trend}`,
    `RSI(14): ${r?.toFixed(1) ?? "n/a"}`,
    `EMA20: ${e20?.toFixed(4) ?? "n/a"}, EMA50: ${e50?.toFixed(4) ?? "n/a"}`,
    `MACD histogram: ${hist?.toFixed(4) ?? "n/a"}`,
    `Recent support/resistance: ${support.toFixed(4)} / ${resistance.toFixed(4)}`,
    `Data source: ${input.quote.source}`,
  ].join("\n");
}

export const ANALYST_SYSTEM_PROMPT = `You are a disciplined trading analyst inside a personal paper-trading tool.
Rules:
- Output STRICT JSON only, matching the requested schema. No prose outside JSON.
- Present everything as a SCENARIO with probabilities, never as certainty or a profit guarantee.
- Ground every statement in the provided market snapshot. Do not invent data.
- Always include concrete risks and an invalidation scenario.
- confidenceScore (0-100) is your confidence in the technical READ, not the odds of profit.
Respond in French for narrative text fields.`;

export function analyzeUserPrompt(snapshot: string): string {
  return `Analyse the following asset from this snapshot and return JSON with keys:
marketOverview, trend, momentum, support (number), resistance (number),
volume, volatility, possibleSetup, entryZone ([low, high]), stopLoss (number),
takeProfit (number), riskReward (number), confidenceScore (0-100),
risks (string[]), invalidationScenario, bullScenario, bearScenario.

Market snapshot:
${snapshot}`;
}

export const JOURNAL_SYSTEM_PROMPT = `You are a trading coach analysing a trader's journal.
Return STRICT JSON: { "summary": string, "patterns": string[], "suggestions": string[] }.
Be specific, reference the data, focus on repeated mistakes, risk discipline and best strategies.
Respond in French. This is educational feedback, not financial advice.`;
