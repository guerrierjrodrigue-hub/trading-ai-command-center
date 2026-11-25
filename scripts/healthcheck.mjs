#!/usr/bin/env node
/**
 * Health check — logs into the running app and exercises every module's API,
 * printing a ✓/✗ checklist. Run the app first (docker compose up -d), then:
 *
 *   node scripts/healthcheck.mjs           (or: npm run healthcheck)
 *
 * Options via env:
 *   HEALTHCHECK_URL   base URL       (default http://localhost:3000)
 *   HC_EMAIL          login email    (default demo@trading.ai)
 *   HC_PASSWORD       login password (default demo1234)
 */

const BASE = process.env.HEALTHCHECK_URL || "http://localhost:3000";
const EMAIL = process.env.HC_EMAIL || "";
const PASSWORD = process.env.HC_PASSWORD || "";
if (!EMAIL || !PASSWORD) {
  console.error("Définis HC_EMAIL et HC_PASSWORD (ton compte admin) avant de lancer le healthcheck.");
  process.exit(1);
}

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", DIM = "\x1b[2m", X = "\x1b[0m";
let cookie = "";
let pass = 0, fail = 0, warn = 0;

function ok(name, detail = "") { pass++; console.log(`${G}✓${X} ${name}${detail ? `  ${DIM}${detail}${X}` : ""}`); }
function ko(name, detail = "") { fail++; console.log(`${R}✗${X} ${name}${detail ? `  ${R}${detail}${X}` : ""}`); }
function wn(name, detail = "") { warn++; console.log(`${Y}!${X} ${name}${detail ? `  ${Y}${detail}${X}` : ""}`); }

async function req(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { res, json };
}

/** Runs a check: passes when res.ok, json.ok, and check(data) is truthy. */
async function check(name, path, opts = {}, verify = () => true, describe = () => "") {
  try {
    const { res, json } = await req(path, opts);
    if (!res.ok || !json || json.ok !== true) {
      ko(name, `HTTP ${res.status}${json?.error ? ` — ${json.error}` : ""}`);
      return null;
    }
    if (!verify(json.data)) { ko(name, "réponse inattendue"); return null; }
    ok(name, describe(json.data));
    return json.data;
  } catch (e) {
    ko(name, e.message);
    return null;
  }
}

async function login() {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const c = setCookies.map((s) => s.split(";")[0]).find((s) => s.startsWith("tacc_session="));
  if (c) cookie = c;
  const json = await res.json().catch(() => null);
  return res.ok && json?.ok === true && !!cookie;
}

async function main() {
  console.log(`\n${DIM}Health check → ${BASE}${X}\n`);

  // Reachability
  try {
    await fetch(BASE + "/login");
  } catch {
    console.log(`${R}✗ L'application est injoignable sur ${BASE}.${X}`);
    console.log(`  Lance-la d'abord : ${DIM}docker compose up -d${X}\n`);
    process.exit(1);
  }

  // Auth
  console.log("Authentification");
  const authed = await login();
  authed ? ok("login (demo) + cookie de session") : ko("login", "identifiants ou session invalides");
  if (!authed) { summary(); process.exit(1); }
  await check("auth/me (rôle)", "/api/auth/me", {}, (d) => !!d.email, (d) => `${d.email} · ${d.role}`);

  console.log("\nDonnées de marché");
  const q = await check("market/quote BTC", "/api/market/quote?symbol=BTC", {}, (d) => typeof d.price === "number", (d) => `${d.price} (source: ${d.source})`);
  if (q) q_source = q.source;
  await check("market/candles BTC 1D", "/api/market/candles?symbol=BTC&timeframe=1D", {}, (d) => Array.isArray(d.candles) && d.candles.length > 50, (d) => `${d.candles.length} bougies`);

  console.log("\nAnalyse & scanner");
  await check("scanner", "/api/scanner?minScore=0", {}, (d) => Array.isArray(d.results) && d.results.length > 0, (d) => `${d.results.length} actifs`);
  await check("AI copilot (analyze BTC)", "/api/ai/analyze", { method: "POST", body: { kind: "ANALYZE", symbol: "BTC" } }, (d) => d.type === "scenario", (d) => `confiance ${d.confidenceScore}/100`);
  await check("AI chat", "/api/ai/chat", { method: "POST", body: { message: "Analyse ETH" } }, (d) => d.type === "analysis" || d.type === "text");

  console.log("\nRisque & backtesting");
  await check("risk/position-size (10k,1%,100,95→20)", "/api/risk/position-size", { method: "POST", body: { capital: 10000, riskPct: 1, entry: 100, stop: 95 } }, (d) => d.quantity === 20, (d) => `qty=${d.quantity}`);
  await check("backtest EMA_CROSS BTC", "/api/backtest", { method: "POST", body: { symbol: "BTC", timeframe: "1D", strategy: "EMA_CROSS" } }, (d) => d.metrics && Number.isFinite(d.metrics.finalEquity), (d) => `rendement ${d.metrics.totalReturnPct}%`);

  console.log("\nPortefeuille & données perso");
  await check("portfolio", "/api/portfolio", {}, (d) => d.metrics && typeof d.metrics.equity === "number", (d) => `equity ${d.metrics.equity}`);
  await check("analytics (performance)", "/api/analytics", {}, (d) => d.overall && typeof d.overall.expectancy === "number", (d) => `${d.overall.trades} trade(s) · espérance ${d.overall.expectancy}`);
  await check("knowledge (base de connaissances)", "/api/knowledge?q=fibonacci", {}, (d) => d.meta && Array.isArray(d.hits) && d.hits.length > 0, (d) => `${d.meta.chunks} passages · ${d.hits.length} résultats`);
  await check("paper/orders (liste)", "/api/paper/orders", {}, (d) => Array.isArray(d.orders));
  await check("watchlist", "/api/watchlist", {}, (d) => Array.isArray(d.items), (d) => `${d.items.length} actifs`);
  await check("journal", "/api/journal", {}, (d) => Array.isArray(d.entries), (d) => `${d.entries.length} entrées`);
  await check("market brief", "/api/brief", {}, (d) => !!d.sentiment, (d) => `sentiment ${d.sentiment}`);
  await check("alerts", "/api/alerts", {}, (d) => Array.isArray(d.alerts), (d) => `${d.alerts.length} alertes`);

  console.log("\nPhase 3");
  await check("settings + providers", "/api/settings", {}, (d) => !!d.providers, (d) => `IA ${d.providers.ai} · marché ${d.providers.market}`);
  await check("broker/account (lecture seule)", "/api/broker/account", {}, (d) => !!d.account, (d) => `${d.account.provider} · trading réel ${d.realTradingEnabled ? "ON" : "OFF"}`);
  const tg = await check("telegram/status", "/api/telegram/status", {}, () => true, (d) => `configuré=${d.configured} · connecté=${d.connected}`);
  if (tg && !tg.configured) wn("Telegram", "jeton absent dans le conteneur → rebuild après avoir mis TELEGRAM_BOT_TOKEN dans .env");
  else if (tg && !tg.connected) wn("Telegram", "configuré mais pas connecté → envoie /start au bot puis clique « Connecter » dans Settings");

  summary();
  process.exit(fail > 0 ? 1 : 0);
}

function summary() {
  console.log(`\n${DIM}────────────────────────${X}`);
  console.log(`${G}${pass} OK${X}  ${fail ? R : DIM}${fail} échec(s)${X}  ${warn ? Y : DIM}${warn} avertissement(s)${X}`);
  if (q_source) console.log(`${DIM}Source des données de marché : ${q_source}${X}`);
  console.log("");
}

let q_source = null;
main().catch((e) => { console.error(`${R}Erreur inattendue:${X}`, e.message); process.exit(1); });
