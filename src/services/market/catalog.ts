import type { AssetClass } from "@prisma/client";

export interface CatalogAsset {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange?: string;
  quoteCurrency: string;
  basePrice: number; // used by the mock provider as the anchor price
  annualVol: number; // rough annualised volatility for the random walk
}

/**
 * The universe of assets the app knows about. Used both to seed the DB and to
 * anchor the deterministic mock market-data provider. Extend freely.
 */
export const CATALOG: CatalogAsset[] = [
  // Crypto (live via CoinGecko — free, 24/7)
  { symbol: "BTC", name: "Bitcoin", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 96000, annualVol: 0.65 },
  { symbol: "ETH", name: "Ethereum", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 3400, annualVol: 0.75 },
  { symbol: "SOL", name: "Solana", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 190, annualVol: 0.95 },
  { symbol: "BNB", name: "BNB", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 620, annualVol: 0.7 },
  { symbol: "XRP", name: "XRP", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 2.3, annualVol: 0.9 },
  { symbol: "ADA", name: "Cardano", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 0.95, annualVol: 0.9 },
  { symbol: "DOGE", name: "Dogecoin", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 0.16, annualVol: 1.1 },
  { symbol: "AVAX", name: "Avalanche", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 28, annualVol: 1.0 },
  { symbol: "DOT", name: "Polkadot", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 5, annualVol: 0.95 },
  { symbol: "LINK", name: "Chainlink", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 14, annualVol: 0.95 },
  { symbol: "LTC", name: "Litecoin", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 90, annualVol: 0.8 },
  { symbol: "BCH", name: "Bitcoin Cash", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 380, annualVol: 0.85 },
  { symbol: "TRX", name: "TRON", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 0.22, annualVol: 0.8 },
  { symbol: "MATIC", name: "Polygon", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 0.5, annualVol: 1.0 },
  { symbol: "ATOM", name: "Cosmos", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 5.5, annualVol: 0.95 },
  { symbol: "UNI", name: "Uniswap", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 9, annualVol: 1.0 },
  { symbol: "XLM", name: "Stellar", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 0.28, annualVol: 0.95 },
  { symbol: "NEAR", name: "NEAR Protocol", assetClass: "CRYPTO", quoteCurrency: "USD", basePrice: 5, annualVol: 1.05 },

  // Stocks
  { symbol: "AAPL", name: "Apple Inc.", assetClass: "STOCK", exchange: "NASDAQ", quoteCurrency: "USD", basePrice: 232, annualVol: 0.28 },
  { symbol: "MSFT", name: "Microsoft Corp.", assetClass: "STOCK", exchange: "NASDAQ", quoteCurrency: "USD", basePrice: 428, annualVol: 0.27 },
  { symbol: "NVDA", name: "NVIDIA Corp.", assetClass: "STOCK", exchange: "NASDAQ", quoteCurrency: "USD", basePrice: 138, annualVol: 0.5 },
  { symbol: "TSLA", name: "Tesla Inc.", assetClass: "STOCK", exchange: "NASDAQ", quoteCurrency: "USD", basePrice: 345, annualVol: 0.55 },
  { symbol: "AMZN", name: "Amazon.com Inc.", assetClass: "STOCK", exchange: "NASDAQ", quoteCurrency: "USD", basePrice: 205, annualVol: 0.32 },
  { symbol: "SHOP", name: "Shopify Inc.", assetClass: "STOCK", exchange: "TSX", quoteCurrency: "USD", basePrice: 110, annualVol: 0.45 },

  // ETFs
  { symbol: "SPY", name: "SPDR S&P 500 ETF", assetClass: "ETF", exchange: "NYSE", quoteCurrency: "USD", basePrice: 595, annualVol: 0.16 },
  { symbol: "QQQ", name: "Invesco QQQ Trust", assetClass: "ETF", exchange: "NASDAQ", quoteCurrency: "USD", basePrice: 512, annualVol: 0.2 },
  { symbol: "XEQT", name: "iShares All-Equity ETF", assetClass: "ETF", exchange: "TSX", quoteCurrency: "CAD", basePrice: 34, annualVol: 0.15 },

  // Forex + metals — live via OANDA (practice account, free). Metals (gold,
  // silver) are classified FOREX so no Prisma AssetClass migration is needed.
  // OANDA covers any FOREX-class symbol here automatically (EUR/USD -> EUR_USD).
  // basePrice/annualVol are only anchors for the mock; live data overrides them.

  // Majors
  { symbol: "EUR/USD", name: "Euro / US Dollar", assetClass: "FOREX", quoteCurrency: "USD", basePrice: 1.08, annualVol: 0.08 },
  { symbol: "USD/JPY", name: "US Dollar / Japanese Yen", assetClass: "FOREX", quoteCurrency: "JPY", basePrice: 150, annualVol: 0.09 },
  { symbol: "GBP/USD", name: "British Pound / US Dollar", assetClass: "FOREX", quoteCurrency: "USD", basePrice: 1.27, annualVol: 0.08 },
  { symbol: "USD/CHF", name: "US Dollar / Swiss Franc", assetClass: "FOREX", quoteCurrency: "CHF", basePrice: 0.88, annualVol: 0.08 },
  { symbol: "USD/CAD", name: "US Dollar / Canadian Dollar", assetClass: "FOREX", quoteCurrency: "CAD", basePrice: 1.36, annualVol: 0.07 },
  { symbol: "AUD/USD", name: "Australian Dollar / US Dollar", assetClass: "FOREX", quoteCurrency: "USD", basePrice: 0.66, annualVol: 0.09 },
  { symbol: "NZD/USD", name: "New Zealand Dollar / US Dollar", assetClass: "FOREX", quoteCurrency: "USD", basePrice: 0.60, annualVol: 0.09 },

  // EUR crosses
  { symbol: "EUR/GBP", name: "Euro / British Pound", assetClass: "FOREX", quoteCurrency: "GBP", basePrice: 0.85, annualVol: 0.07 },
  { symbol: "EUR/JPY", name: "Euro / Japanese Yen", assetClass: "FOREX", quoteCurrency: "JPY", basePrice: 162, annualVol: 0.09 },
  { symbol: "EUR/CHF", name: "Euro / Swiss Franc", assetClass: "FOREX", quoteCurrency: "CHF", basePrice: 0.95, annualVol: 0.06 },
  { symbol: "EUR/CAD", name: "Euro / Canadian Dollar", assetClass: "FOREX", quoteCurrency: "CAD", basePrice: 1.47, annualVol: 0.08 },
  { symbol: "EUR/AUD", name: "Euro / Australian Dollar", assetClass: "FOREX", quoteCurrency: "AUD", basePrice: 1.63, annualVol: 0.08 },
  { symbol: "EUR/NZD", name: "Euro / New Zealand Dollar", assetClass: "FOREX", quoteCurrency: "NZD", basePrice: 1.78, annualVol: 0.09 },

  // GBP crosses
  { symbol: "GBP/JPY", name: "British Pound / Japanese Yen", assetClass: "FOREX", quoteCurrency: "JPY", basePrice: 191, annualVol: 0.10 },
  { symbol: "GBP/CHF", name: "British Pound / Swiss Franc", assetClass: "FOREX", quoteCurrency: "CHF", basePrice: 1.12, annualVol: 0.08 },
  { symbol: "GBP/CAD", name: "British Pound / Canadian Dollar", assetClass: "FOREX", quoteCurrency: "CAD", basePrice: 1.73, annualVol: 0.09 },
  { symbol: "GBP/AUD", name: "British Pound / Australian Dollar", assetClass: "FOREX", quoteCurrency: "AUD", basePrice: 1.92, annualVol: 0.09 },
  { symbol: "GBP/NZD", name: "British Pound / New Zealand Dollar", assetClass: "FOREX", quoteCurrency: "NZD", basePrice: 2.10, annualVol: 0.10 },

  // JPY crosses
  { symbol: "AUD/JPY", name: "Australian Dollar / Japanese Yen", assetClass: "FOREX", quoteCurrency: "JPY", basePrice: 99, annualVol: 0.10 },
  { symbol: "CAD/JPY", name: "Canadian Dollar / Japanese Yen", assetClass: "FOREX", quoteCurrency: "JPY", basePrice: 110, annualVol: 0.10 },
  { symbol: "CHF/JPY", name: "Swiss Franc / Japanese Yen", assetClass: "FOREX", quoteCurrency: "JPY", basePrice: 170, annualVol: 0.09 },
  { symbol: "NZD/JPY", name: "New Zealand Dollar / Japanese Yen", assetClass: "FOREX", quoteCurrency: "JPY", basePrice: 90, annualVol: 0.10 },

  // Minor crosses
  { symbol: "AUD/CAD", name: "Australian Dollar / Canadian Dollar", assetClass: "FOREX", quoteCurrency: "CAD", basePrice: 0.90, annualVol: 0.07 },
  { symbol: "AUD/CHF", name: "Australian Dollar / Swiss Franc", assetClass: "FOREX", quoteCurrency: "CHF", basePrice: 0.58, annualVol: 0.08 },
  { symbol: "AUD/NZD", name: "Australian Dollar / New Zealand Dollar", assetClass: "FOREX", quoteCurrency: "NZD", basePrice: 1.09, annualVol: 0.06 },
  { symbol: "CAD/CHF", name: "Canadian Dollar / Swiss Franc", assetClass: "FOREX", quoteCurrency: "CHF", basePrice: 0.65, annualVol: 0.07 },
  { symbol: "NZD/CAD", name: "New Zealand Dollar / Canadian Dollar", assetClass: "FOREX", quoteCurrency: "CAD", basePrice: 0.82, annualVol: 0.07 },
  { symbol: "NZD/CHF", name: "New Zealand Dollar / Swiss Franc", assetClass: "FOREX", quoteCurrency: "CHF", basePrice: 0.53, annualVol: 0.08 },

  // USD exotics
  { symbol: "USD/SGD", name: "US Dollar / Singapore Dollar", assetClass: "FOREX", quoteCurrency: "SGD", basePrice: 1.35, annualVol: 0.06 },
  { symbol: "USD/HKD", name: "US Dollar / Hong Kong Dollar", assetClass: "FOREX", quoteCurrency: "HKD", basePrice: 7.8, annualVol: 0.03 },
  { symbol: "USD/MXN", name: "US Dollar / Mexican Peso", assetClass: "FOREX", quoteCurrency: "MXN", basePrice: 18, annualVol: 0.14 },
  { symbol: "USD/ZAR", name: "US Dollar / South African Rand", assetClass: "FOREX", quoteCurrency: "ZAR", basePrice: 18, annualVol: 0.16 },
  { symbol: "USD/NOK", name: "US Dollar / Norwegian Krone", assetClass: "FOREX", quoteCurrency: "NOK", basePrice: 10.7, annualVol: 0.11 },
  { symbol: "USD/SEK", name: "US Dollar / Swedish Krona", assetClass: "FOREX", quoteCurrency: "SEK", basePrice: 10.5, annualVol: 0.11 },
  { symbol: "USD/TRY", name: "US Dollar / Turkish Lira", assetClass: "FOREX", quoteCurrency: "TRY", basePrice: 34, annualVol: 0.25 },

  // Metals (spot vs USD)
  { symbol: "XAU/USD", name: "Gold (Spot) / US Dollar", assetClass: "FOREX", quoteCurrency: "USD", basePrice: 2600, annualVol: 0.15 },
  { symbol: "XAG/USD", name: "Silver (Spot) / US Dollar", assetClass: "FOREX", quoteCurrency: "USD", basePrice: 30, annualVol: 0.30 },
];

export const CATALOG_BY_SYMBOL = new Map(CATALOG.map((a) => [a.symbol, a]));

export function getCatalogAsset(symbol: string): CatalogAsset | undefined {
  return CATALOG_BY_SYMBOL.get(symbol.toUpperCase()) ?? CATALOG_BY_SYMBOL.get(symbol);
}
