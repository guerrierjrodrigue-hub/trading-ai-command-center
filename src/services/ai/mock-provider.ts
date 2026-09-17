import { round } from "@/lib/utils";
import {
  detectTrend,
  ema,
  lastValid,
  macd,
  rsi,
  supportResistance,
} from "@/services/market/indicators";
import { scoreOpportunity } from "@/services/scanner/scanner";
import { riskReward } from "@/services/trading/pnl";
import {
  AI_DISCLAIMER,
  type AIProvider,
  type AnalyzeInput,
  type AssetAnalysis,
  type ChatMessage,
  type JournalInsight,
} from "./types";

/**
 * Grounded, deterministic AI provider that requires NO API key.
 * It narrates the real indicator readings (the same engine the scanner uses),
 * so the app is fully functional offline and the "AI" output is explainable.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async analyzeAsset(input: AnalyzeInput): Promise<AssetAnalysis> {
    const closes = input.candles.map((c) => c.close);
    const price = input.quote.price;
    const rsiVal = lastValid(rsi(closes, 14));
    const trend = detectTrend(closes);
    const e20 = lastValid(ema(closes, 20));
    const { histogram } = macd(closes);
    const hist = lastValid(histogram);
    const { support, resistance } = supportResistance(input.candles, 60);
    const scan = scoreOpportunity(input.candles, input.quote);

    const long = scan.direction !== "SHORT";
    // Risk anchored to nearest structural level.
    const risk = long
      ? Math.max(price - support, price * 0.02)
      : Math.max(resistance - price, price * 0.02);
    const stop = long ? round(price - risk, 6) : round(price + risk, 6);
    const takeProfit = long ? round(price + risk * 2, 6) : round(price - risk * 2, 6);
    const rr = riskReward(price, stop, takeProfit);

    const trendFr =
      trend === "UP" ? "haussière" : trend === "DOWN" ? "baissière" : "neutre";
    const momentumFr =
      hist === null
        ? "momentum indéterminé"
        : hist > 0
          ? "momentum positif (MACD au-dessus du signal)"
          : "momentum négatif (MACD sous le signal)";

    return {
      type: "scenario",
      symbol: input.symbol,
      asOf: new Date().toISOString(),
      marketOverview: `${input.symbol} cote à ${price} (${input.quote.changePct24h >= 0 ? "+" : ""}${input.quote.changePct24h}% sur 24h). Tendance ${trendFr}, score d'opportunité ${scan.score}/100 en biais ${scan.direction}.`,
      trend: `Tendance ${trendFr}. ${e20 !== null ? (price > e20 ? "Prix au-dessus de l'EMA20." : "Prix sous l'EMA20.") : ""}`.trim(),
      momentum: `${momentumFr}. RSI(14) = ${rsiVal?.toFixed(1) ?? "n/a"}.`,
      support: round(support, 6),
      resistance: round(resistance, 6),
      volume: `Volume 24h ≈ ${Math.round(input.quote.volume24h).toLocaleString("en-US")}.`,
      volatility: `Variation 24h de ${Math.abs(input.quote.changePct24h)}% → risque ${scan.risk}.`,
      possibleSetup: scan.setup,
      entryZone: long
        ? [round(price * 0.997, 6), round(price * 1.003, 6)]
        : [round(price * 0.997, 6), round(price * 1.003, 6)],
      stopLoss: stop,
      takeProfit,
      riskReward: rr,
      confidenceScore: Math.abs(scan.score - 50) < 10 ? 45 : scan.score,
      risks: [
        "Un retournement de tendance invaliderait le scénario.",
        `Volatilité ${scan.risk} : le stop peut être touché rapidement.`,
        "Les données proviennent d'une source " + input.quote.source + " (simulation en mode mock).",
      ],
      invalidationScenario: long
        ? `Clôture franche sous ${stop} invalide le scénario haussier.`
        : `Clôture franche au-dessus de ${stop} invalide le scénario baissier.`,
      bullScenario: `Cassure et maintien au-dessus de ${round(resistance, 6)} ouvrirait la voie à une extension haussière.`,
      bearScenario: `Perte du support ${round(support, 6)} exposerait à une accélération baissière.`,
      disclaimer: AI_DISCLAIMER,
    };
  }

  async chat(messages: ChatMessage[], context?: string): Promise<{ text: string }> {
    const last = messages[messages.length - 1]?.content ?? "";
    const text = [
      "Co-pilote (mode mock, hors-ligne) :",
      context ? `Contexte pris en compte :\n${context}` : "",
      "",
      `Concernant « ${last} » — je raisonne toujours en scénarios, jamais en certitudes. Pour une analyse structurée d'un actif, utilise « Analyse <SYMBOLE> » (ex. « Analyse BTC ») et je te renverrai tendance, momentum, supports/résistances, setup, zone d'entrée, stop, take-profit, R/R, score de confiance, risques et scénario d'invalidation.`,
      "",
      AI_DISCLAIMER,
    ]
      .filter(Boolean)
      .join("\n");
    return { text };
  }

  async analyzeJournal(entries: Array<Record<string, unknown>>): Promise<JournalInsight> {
    const n = entries.length;
    const wins = entries.filter((e) => (e.result as string) === "WIN").length;
    const losses = entries.filter((e) => (e.result as string) === "LOSS").length;
    const emotions = entries
      .map((e) => (e.emotion as string) || "")
      .filter(Boolean);
    const fomo = emotions.filter((e) => /fomo|greed|peur|fear/i.test(e)).length;

    const patterns: string[] = [];
    if (n > 0) patterns.push(`Sur ${n} trades : ${wins} gagnants, ${losses} perdants.`);
    if (fomo > 0)
      patterns.push(`${fomo} entrée(s) associée(s) à une émotion à risque (FOMO/peur/avidité).`);
    if (wins + losses > 0 && losses > wins)
      patterns.push("Plus de trades perdants que gagnants : revoir les critères d'entrée.");

    return {
      summary:
        n === 0
          ? "Journal vide : ajoute quelques trades pour obtenir une analyse."
          : `Analyse de ${n} entrées de journal (mode mock, déterministe).`,
      patterns,
      suggestions: [
        "Journaliser systématiquement la raison d'entrée et l'émotion.",
        "Fixer stop et take-profit AVANT l'entrée et respecter le R/R.",
        "Limiter le risque par trade selon les paramètres de gestion du risque.",
      ],
      disclaimer: AI_DISCLAIMER,
    };
  }
}
