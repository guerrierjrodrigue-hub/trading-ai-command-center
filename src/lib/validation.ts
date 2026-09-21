import { z } from "zod";

export const emailSchema = z.string().email().max(200);
export const passwordSchema = z.string().min(8).max(200);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(120).optional(),
  inviteCode: z.string().max(120).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const timeframeSchema = z.enum([
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1D",
  "1W",
]);
export type Timeframe = z.infer<typeof timeframeSchema>;

export const assetClassSchema = z.enum(["CRYPTO", "STOCK", "ETF", "FOREX"]);

export const watchlistAddSchema = z.object({
  symbol: z.string().min(1).max(20),
});

export const paperOrderSchema = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(["BUY", "SELL"]),
  // Either quantity OR a risk-based sizing (entry+stop+riskPct) must be provided.
  quantity: z.number().positive().optional(),
  entryPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  riskPct: z.number().positive().max(100).optional(),
  reason: z.string().max(500).optional(),
});
export type PaperOrderInput = z.infer<typeof paperOrderSchema>;

export const positionSizeSchema = z.object({
  capital: z.number().positive(),
  riskPct: z.number().positive().max(100),
  entry: z.number().positive(),
  stop: z.number().positive(),
});

export const journalCreateSchema = z.object({
  symbol: z.string().min(1).max(20),
  strategy: z.string().max(120).optional(),
  side: z.enum(["LONG", "SHORT"]).default("LONG"),
  entryPrice: z.number().optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  exitPrice: z.number().optional(),
  result: z.enum(["WIN", "LOSS", "BREAKEVEN", "OPEN"]).optional(),
  pnl: z.number().optional(),
  emotion: z.string().max(60).optional(),
  reason: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
  tradedAt: z.string().datetime().optional(),
});

export const alertCreateSchema = z.object({
  symbol: z.string().min(1).max(20),
  metric: z.enum(["PRICE", "RSI", "VOLUME", "AI_SCORE", "EMA_CROSS"]).default("PRICE"),
  operator: z.enum(["GT", "LT", "CROSS_ABOVE", "CROSS_BELOW"]).default("GT"),
  threshold: z.number(),
  channels: z.array(z.enum(["browser", "email", "telegram", "discord"])).default([]),
  note: z.string().max(300).optional(),
});

export const aiAnalyzeSchema = z.object({
  kind: z.enum(["ANALYZE", "COMPARE", "EXPLAIN", "JOURNAL", "BRIEF"]).default("ANALYZE"),
  symbol: z.string().max(20).optional(),
  symbols: z.array(z.string().max(20)).max(5).optional(),
  question: z.string().max(1000).optional(),
});

export const backtestRunSchema = z.object({
  symbol: z.string().min(1).max(20),
  timeframe: timeframeSchema.default("1D"),
  strategy: z.enum([
    "EMA_CROSS",
    "RSI",
    "MACD",
    "BREAKOUT",
    "TREND_FOLLOWING",
    "FIB_CONFLUENCE",
    "BIG_BOUNCE",
    "BREAK_HOOK_GO",
    "DIVERGENCE",
    "V2H4_GOLD",
  ]),
  startingCapital: z.number().positive().default(10000),
  limit: z.number().int().min(50).max(1000).default(300),
  // Strategy knobs (all optional).
  fast: z.number().int().positive().max(400).optional(),
  slow: z.number().int().positive().max(400).optional(),
  rsiPeriod: z.number().int().positive().max(100).optional(),
  oversold: z.number().min(1).max(99).optional(),
  overbought: z.number().min(1).max(99).optional(),
  lookback: z.number().int().positive().max(400).optional(),
  smaPeriod: z.number().int().positive().max(400).optional(),
});
export type BacktestRunInput = z.infer<typeof backtestRunSchema>;

export const settingsUpdateSchema = z.object({
  riskPerTradePct: z.number().positive().max(100).optional(),
  maxDailyLossPct: z.number().positive().max(100).optional(),
  maxOpenPositions: z.number().int().positive().max(100).optional(),
  maxPortfolioExposurePct: z.number().positive().max(100).optional(),
  feeBps: z.number().int().min(0).max(1000).optional(),
  startingCapital: z.number().positive().optional(),
});

export const brokerOrderSchema = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
});

export const botConfigSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["MANUAL", "AUTO"]).optional(),
  riskProfile: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]).optional(),
  strategy: z
    .enum([
      "EMA_CROSS",
      "RSI",
      "MACD",
      "BREAKOUT",
      "TREND_FOLLOWING",
      "FIB_CONFLUENCE",
      "BIG_BOUNCE",
      "BREAK_HOOK_GO",
      "DIVERGENCE",
      "V2H4_GOLD",
    ])
    .optional(),
  timeframe: timeframeSchema.optional(),
  symbols: z.array(z.string().min(1).max(20)).max(30).optional(),
  riskPerTradePct: z.number().positive().max(100).optional(),
  stopPct: z.number().positive().max(90).optional(),
  takeProfitRR: z.number().positive().max(20).optional(),
  maxOpenPositions: z.number().int().positive().max(50).optional(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
});

export const scannerQuerySchema = z.object({
  assetClass: assetClassSchema.optional(),
  minScore: z.coerce.number().min(0).max(100).default(0),
  direction: z.enum(["LONG", "SHORT", "ANY"]).default("ANY"),
});
