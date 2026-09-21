import { ema, lastValid, macd, rsi, sma } from "@/services/market/indicators";
import type { Candle } from "@/services/market/types";
import { analyzeFib } from "./strategies/fibonacci";
import { evaluate as evalBigBounce } from "./strategies/bigBounce";
import { evaluate as evalBreakHookGo } from "./strategies/breakHookGo";
import { evaluate as evalDivergence } from "./strategies/divergence";
import { evaluate as evalV2H4Gold } from "./strategies/v2h4-gold";
import type { StrategyName } from "./strategies/types";

export type BotStrategy = StrategyName;

export interface BotSignal {
  long: boolean; // should the bot want to be long right now?
  reason: string; // human-readable explanation for the log
  // Optional strategy-supplied levels (e.g. Fibonacci). When present, the bot
  // uses them instead of the fixed % stop/TP.
  stop?: number;
  takeProfit?: number;
}

/**
 * Stateless "should I be long now?" signal per strategy, evaluated on the last
 * bar. Transparent — the reason string is what the bot writes to its journal.
 * Long-only in v1 (matches the backtest engine).
 */
export function longSignal(candles: Candle[], strategy: BotStrategy): BotSignal {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];

  switch (strategy) {
    case "EMA_CROSS": {
      const f = lastValid(ema(closes, 12));
      const s = lastValid(ema(closes, 26));
      if (f === null || s === null) return { long: false, reason: "données insuffisantes" };
      return { long: f > s, reason: `EMA12 ${f.toFixed(2)} ${f > s ? ">" : "≤"} EMA26 ${s.toFixed(2)}` };
    }
    case "MACD": {
      const h = lastValid(macd(closes).histogram);
      if (h === null) return { long: false, reason: "données insuffisantes" };
      return { long: h > 0, reason: `MACD histogramme ${h > 0 ? "positif" : "négatif"} (${h.toFixed(3)})` };
    }
    case "RSI": {
      const r = lastValid(rsi(closes, 14));
      if (r === null) return { long: false, reason: "données insuffisantes" };
      return { long: r > 50, reason: `RSI ${r.toFixed(0)} ${r > 50 ? "> 50 (momentum haussier)" : "≤ 50"}` };
    }
    case "TREND_FOLLOWING": {
      const period = Math.min(200, Math.max(20, closes.length - 1));
      const s = lastValid(sma(closes, period));
      if (s === null) return { long: false, reason: "données insuffisantes" };
      return { long: price > s, reason: `Prix ${price.toFixed(2)} ${price > s ? ">" : "≤"} SMA${period} ${s.toFixed(2)}` };
    }
    case "BREAKOUT": {
      const lb = 20;
      if (candles.length <= lb + 1) return { long: false, reason: "données insuffisantes" };
      const window = candles.slice(-lb - 1, -1);
      const hi = Math.max(...window.map((c) => c.high));
      return { long: price > hi, reason: `${price > hi ? "Cassure au-dessus" : "Sous"} du plus haut ${lb} périodes (${hi.toFixed(2)})` };
    }
    case "FIB_CONFLUENCE": {
      const f = analyzeFib(candles);
      return { long: f.long, reason: f.reason, stop: f.stop, takeProfit: f.takeProfit };
    }
    case "BIG_BOUNCE": {
      const e = evalBigBounce(candles);
      return { long: e.long, reason: e.reason, stop: e.stop, takeProfit: e.takeProfit };
    }
    case "BREAK_HOOK_GO": {
      const e = evalBreakHookGo(candles);
      return { long: e.long, reason: e.reason, stop: e.stop, takeProfit: e.takeProfit };
    }
    case "DIVERGENCE": {
      const e = evalDivergence(candles);
      return { long: e.long, reason: e.reason, stop: e.stop, takeProfit: e.takeProfit };
    }
    case "V2H4_GOLD": {
      const e = evalV2H4Gold(candles);
      return { long: e.long, reason: e.reason, stop: e.stop, takeProfit: e.takeProfit };
    }
    default:
      return { long: false, reason: "stratégie inconnue" };
  }
}
