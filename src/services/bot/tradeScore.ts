import { ema, lastValid, macd, rsi, supportResistance } from "@/services/market/indicators";
import { clamp, round } from "@/lib/utils";
import type { Candle } from "@/services/market/types";
import type { Side } from "./strategies/types";

/**
 * Unified Trade Score (0–100). No single indicator can trigger a trade; instead
 * every factor contributes points and the bot only enters when the TOTAL clears
 * the profile's threshold. Mirrors the user's scoring table, adapted to the data
 * actually available (free daily candles: no reliable volume / order book).
 *
 *   Trend aligned with the regime .......... 22
 *   Structure (near support/resistance) .... 18
 *   Momentum (RSI + MACD) .................. 15
 *   Higher-timeframe agreement ............. 15
 *   Risk/Reward (>= 2 is full marks) ....... 15
 *   Book-strategy quality .................. 15
 *                                    total = 100
 */
export interface TradeScorePart {
  label: string;
  points: number;
  max: number;
}
export interface TradeScoreResult {
  score: number;
  parts: TradeScorePart[];
}

export function tradeScore(inp: {
  candles: Candle[];
  side: Side;
  rr: number;
  strategyQuality: number;
  htfAgree: boolean;
  regimeAligned: boolean;
}): TradeScoreResult {
  const { candles, side, rr, strategyQuality, htfAgree, regimeAligned } = inp;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? 0;
  const long = side === "LONG";
  const parts: TradeScorePart[] = [];

  // 1) Trend aligned with the market regime.
  parts.push({ label: "Tendance alignée", points: regimeAligned ? 22 : 0, max: 22 });

  // 2) Structure: long wants to sit near support, short near resistance.
  const { support, resistance } = supportResistance(candles, 60);
  const range = resistance - support || 1;
  let structure = 0;
  if (long) {
    const distToSupport = (price - support) / range; // 0 = on support
    structure = distToSupport <= 0.15 ? 18 : distToSupport <= 0.33 ? 11 : distToSupport <= 0.5 ? 5 : 0;
  } else {
    const distToResistance = (resistance - price) / range; // 0 = on resistance
    structure = distToResistance <= 0.15 ? 18 : distToResistance <= 0.33 ? 11 : distToResistance <= 0.5 ? 5 : 0;
  }
  parts.push({ label: "Structure (support/résistance)", points: structure, max: 18 });

  // 3) Momentum: RSI half + MACD histogram, in the trade's direction.
  const rsiVal = lastValid(rsi(closes, 14));
  const hist = lastValid(macd(closes).histogram);
  let momentum = 0;
  if (rsiVal != null) {
    if (long && rsiVal >= 50) momentum += 8;
    else if (!long && rsiVal <= 50) momentum += 8;
    else momentum += 3;
  }
  if (hist != null) {
    if (long && hist > 0) momentum += 7;
    else if (!long && hist < 0) momentum += 7;
  }
  parts.push({ label: "Momentum (RSI/MACD)", points: momentum, max: 15 });

  // 4) Higher-timeframe agreement.
  parts.push({ label: "Multi-timeframe", points: htfAgree ? 15 : 0, max: 15 });

  // 5) Risk/Reward — full marks at >= 2.
  const rrPoints = rr >= 2 ? 15 : rr >= 1.5 ? 10 : rr >= 1 ? 5 : 0;
  parts.push({ label: "Risk/Reward", points: rrPoints, max: 15 });

  // 6) Book-strategy quality (0..100 -> 0..15).
  const qPoints = round((clamp(strategyQuality, 0, 100) / 100) * 15, 0);
  parts.push({ label: "Qualité de la stratégie", points: qPoints, max: 15 });

  const score = clamp(
    parts.reduce((s, p) => s + p.points, 0),
    0,
    100,
  );
  return { score: round(score, 0), parts };
}
