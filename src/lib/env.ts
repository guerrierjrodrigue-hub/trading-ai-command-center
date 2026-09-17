/**
 * Centralised, typed access to environment variables.
 * Secrets are read here (server-side only) and never shipped to the client.
 */

function str(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  isProd: str("NODE_ENV") === "production",
  appUrl: str("APP_URL", "http://localhost:3000"),

  databaseUrl: str("DATABASE_URL"),

  authSecret: str("AUTH_SECRET", "dev-insecure-secret-change-me-please-32chars"),
  sessionMaxAge: num("SESSION_MAX_AGE", 60 * 60 * 24 * 7),
  // Multi-user controls. Registration is open by default (personal use);
  // set ALLOW_REGISTRATION=false to close it, or SIGNUP_INVITE_CODE to gate it.
  allowRegistration: bool("ALLOW_REGISTRATION", true),
  signupInviteCode: str("SIGNUP_INVITE_CODE"),

  ai: {
    provider: str("AI_PROVIDER", "mock").toLowerCase(),
    model: str("AI_MODEL"),
    apiKey: str("AI_API_KEY"),
    baseUrl: str("AI_BASE_URL"),
    // Hard timeout for a single LLM call. On timeout the app falls back to the
    // deterministic mock analysis so the user always gets a response.
    timeoutMs: num("AI_TIMEOUT_MS", 45000),
    // How long (seconds) a successful asset analysis is cached and reused.
    cacheTtlSeconds: num("AI_CACHE_TTL_SECONDS", 300),
  },

  market: {
    provider: str("MARKET_PROVIDER", "mock").toLowerCase(),
    apiKey: str("MARKET_API_KEY"),
    baseUrl: str("MARKET_BASE_URL"),
    // Separate key for the stocks/ETF source (Twelve Data), so it never
    // collides with the crypto (CoinGecko) key.
    stocksApiKey: str("STOCKS_API_KEY"),
  },

  // OANDA v20 — free forex + gold (XAU/USD) market DATA from a practice (demo)
  // account. Data only; real order execution stays gated by the broker layer.
  oanda: {
    apiToken: str("OANDA_API_TOKEN"),
    accountId: str("OANDA_ACCOUNT_ID"),
    // "practice" (demo, default) -> api-fxpractice; "live" -> api-fxtrade.
    environment: str("OANDA_ENV", "practice").toLowerCase(),
  },

  paper: {
    startingCapital: num("PAPER_STARTING_CAPITAL", 10000),
    feeBps: num("PAPER_FEE_BPS", 10),
  },

  telegram: {
    // Bot token from @BotFather. Secret — server-side only, never sent to the client.
    botToken: str("TELEGRAM_BOT_TOKEN"),
  },

  bot: {
    // How often (seconds) the autonomous scheduler wakes to check for due bots.
    tickSeconds: num("BOT_TICK_SECONDS", 60),
  },

  broker: {
    // Which brokerage the read-only connector talks to. Default: paper.
    provider: str("BROKER_PROVIDER", "paper").toLowerCase(),
    // Master switch for REAL order execution. Off by default; the MVP never
    // flips it. Real trading also requires a non-paper provider.
    tradingEnabled: bool("BROKER_TRADING_ENABLED", false),
    apiKey: str("BROKER_API_KEY"),
    apiSecret: str("BROKER_API_SECRET"),
    baseUrl: str("BROKER_BASE_URL"),
  },
} as const;

export type Env = typeof env;
