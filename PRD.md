# PRD — Trading AI Command Center

> **Statut :** MVP en développement · **Version du document :** 1.0 · **Auteur :** Rody
> **Nature du produit :** application web privée, usage personnel, **mode simulation / paper trading uniquement.**

---

## ⚠️ Avertissement produit (non négociable)

Cette application est un **outil d'aide à la décision et de simulation**. Elle n'exécute **aucun ordre réel** sur un broker. Toute analyse produite par l'IA est présentée comme un **scénario probabiliste**, jamais comme une garantie de profit. Aucune intégration broker réelle n'est activée sans une action d'activation explicite ajoutée ultérieurement (voir *Non-Goals* et *Roadmap*). Ceci n'est pas un conseil financier.

---

## 1. Product Overview

Trading AI Command Center est un **cockpit personnel de trading** qui centralise, dans une seule interface sombre et premium, l'observation des marchés, l'analyse d'actifs assistée par IA, un scanner d'opportunités, un moteur de **paper trading**, le suivi d'un portefeuille virtuel, un journal de trading et un module de gestion du risque.

L'objectif est de ressembler à un **vrai produit SaaS professionnel**, pas à un projet étudiant : architecture propre, données réelles/simulées/IA clairement distinguées, sécurité de base, et une base extensible vers un futur SaaS multi-utilisateurs.

## 2. Vision

Devenir le **poste de commande unique** d'un trader retail sérieux : au lieu de jongler entre TradingView, un tableur, un carnet de notes et ChatGPT, tout vit au même endroit — le marché, le raisonnement, la simulation, l'historique et l'auto-analyse. L'IA n'est pas un gadget : c'est un **co-pilote structuré** qui force une réflexion disciplinée (setup, entrée, stop, risque, invalidation) avant chaque décision.

## 3. Problem Statement

Les traders retail :

- dispersent leurs informations sur plusieurs outils non connectés ;
- prennent des décisions émotionnelles, sans cadre de risque explicite ;
- ne journalisent pas leurs trades et répètent donc les mêmes erreurs ;
- utilisent l'IA de façon non structurée, obtenant des réponses vagues ou surconfiantes ;
- confondent conviction et probabilité, et sous-estiment le risque de ruine.

## 4. Target User

**Utilisateur primaire (MVP) :** Rody — un trader/investisseur retail francophone qui veut s'entraîner sans risquer de capital, comprendre *pourquoi* une opportunité est intéressante, et bâtir une discipline mesurable.

**Utilisateur futur (SaaS) :** traders retail intermédiaires cherchant un cockpit + co-pilote IA, en particulier un public francophone.

## 5. Goals

- G1 — Un tableau de bord unique donnant l'état du portefeuille, du marché et des opportunités en < 5 s.
- G2 — Un co-pilote IA qui rend une analyse **structurée et reproductible** pour n'importe quel actif.
- G3 — Un moteur de paper trading dont les calculs (P&L, taille de position, R/R) sont **exacts et testés**.
- G4 — Un module de risque qui empêche mécaniquement le sur-risque (risque par trade, perte quotidienne max, exposition max).
- G5 — Un journal exploitable par l'IA pour révéler des patterns de comportement.
- G6 — Fonctionner **sans aucune clé d'API externe** (providers mock) dès le premier `docker compose up`.
- G7 — Une architecture prête à accueillir : brokers réels, LLM alternatifs, multi-utilisateurs, notifications.

## 6. Non-Goals (MVP)

- ❌ Exécution d'ordres réels sur un broker.
- ❌ Conseil financier réglementé / gestion de fonds de tiers.
- ❌ Flux de données de marché temps réel tick-par-tick de qualité institutionnelle.
- ❌ Backtesting avancé multi-stratégies (version simple prévue en phase 2).
- ❌ Livraison de notifications externes (email/Telegram/Discord) — l'architecture est prête, l'envoi vient plus tard.
- ❌ Application mobile native (le web est responsive).

## 7. User Stories

1. En tant qu'utilisateur, je me connecte de façon sécurisée pour accéder à mon cockpit privé.
2. Je vois immédiatement la valeur de mon portefeuille, mon P&L du jour et total, mon capital disponible.
3. Je demande au co-pilote « Analyse BTC » et reçois une analyse structurée (tendance, momentum, supports, R/R, scénario d'invalidation…).
4. Je lance le scanner et j'obtiens une liste d'actifs classés par *AI Opportunity Score* avec explication.
5. J'ajoute/retire des actifs de ma watchlist et je vois prix, variation, tendance et score.
6. Je place un ordre simulé BUY/SELL avec stop et take-profit ; le système calcule taille, risque, R/R.
7. Je consulte mon portefeuille : positions ouvertes, allocation, equity curve, P&L par actif.
8. Je journalise un trade (raison d'entrée, émotion, résultat) puis demande à l'IA mes erreurs récurrentes.
9. Je configure mes paramètres de risque et l'app calcule ma taille de position automatiquement.
10. Je crée une alerte (« BTC > 100000 », « RSI < 30 ») qui s'affiche quand la condition est vraie.

## 8. Functional Requirements (MVP)

| # | Module | Exigence |
|---|--------|----------|
| FR-1 | Auth | Register/login/logout, mots de passe hachés (bcrypt), sessions JWT httpOnly, routes protégées via middleware. |
| FR-2 | Dashboard | Cartes portefeuille (valeur, P&L jour/total, rendement %, capital dispo), positions ouvertes, watchlist, opportunités, résumé IA, sentiment. |
| FR-3 | Market data | Couche `MarketDataProvider` abstraite ; provider **mock** par défaut (quotes + bougies déterministes). |
| FR-4 | Charts | Chandeliers + volume + EMA/SMA + RSI, multi-timeframes (1m→1W). |
| FR-5 | Watchlist | CRUD, réordonnancement, prix/variation/tendance/score IA par ligne. |
| FR-6 | Scanner | Filtres par classe d'actif et indicateurs (RSI/MACD/EMA/tendance/volume), *AI Opportunity Score* 0–100 configurable et **expliqué**. |
| FR-7 | AI Copilot | Analyse structurée d'un actif, comparaison, explication d'indicateur, scénarios bull/bear. Provider IA abstrait ; **mock** par défaut. |
| FR-8 | Paper Trading | Capital initial configurable, ordres BUY/SELL market, stop/TP/frais simulés, calcul auto taille/risque/R/R, clôture de position, P&L réalisé/latent. |
| FR-9 | Portfolio | Capital, positions, allocation, P&L, rendement, drawdown, equity curve, historique. |
| FR-10 | Journal | Enregistrement complet d'un trade + analyse agrégée par l'IA. |
| FR-11 | Risk Mgmt | Paramètres (risque/trade, perte quotidienne max, positions max, exposition max) + calcul de taille de position affiché en détail. |
| FR-12 | Alerts | Création/liste d'alertes basées sur règles ; évaluation côté serveur ; statut *triggered*. |
| FR-13 | Settings | Profil, capital de départ, provider IA/marché (lecture), paramètres de risque. |

## 9. Non-Functional Requirements

- **Sécurité :** aucun secret côté client ; validation Zod de toute entrée ; middleware d'auth ; cookies `httpOnly`/`SameSite`. (Voir §15.)
- **Performance :** dashboard interactif < 1 s sur données mock ; rendu SSR + composants clients ciblés.
- **Fiabilité :** l'app démarre et fonctionne **sans clé externe**.
- **Maintenabilité :** TypeScript strict, code modulaire, providers découplés, pas de secrets hardcodés.
- **Portabilité :** entièrement dockerisée (`docker compose up -d`).
- **Accessibilité :** thème sombre lisible, contrastes suffisants, responsive desktop + mobile.
- **Testabilité :** logique critique (P&L, taille de position, risque) couverte par tests unitaires.

## 10. UX Requirements

- Thème **sombre par défaut**, premium, minimaliste, très lisible.
- Navigation latérale : Dashboard · Markets · Scanner · AI Copilot · Portfolio · Paper Trading · Journal · Charts · Alerts · Settings.
- Top bar : recherche d'actif, résumé rapide, menu profil.
- Command palette légère (⌘K) : `/analyze`, `/scan`, `/portfolio`, `/journal`, `/alert` (version simple au MVP).
- Composants : cards, badges, tableaux, mini-charts, indicateurs colorés (vert/rouge cohérents).
- Distinction visuelle claire : **données marché** (neutre) · **simulation** (badge « PAPER ») · **sortie IA** (badge « AI · scénario »).

## 11. Technical Architecture

Voir **ARCHITECTURE.md** pour le détail et la justification des choix. Résumé :

- **Frontend + Backend :** Next.js 14 (App Router) + TypeScript — full-stack unifié (Server Components + Route Handlers).
- **UI :** Tailwind CSS, composants maison, `lucide-react` (icônes).
- **Charts :** `lightweight-charts` (TradingView OSS) pour les chandeliers ; `recharts` pour equity/allocation.
- **DB :** PostgreSQL + **Prisma** (ORM, migrations typées).
- **Auth :** JWT signés (`jose`) + `bcryptjs`, cookies httpOnly, middleware Next.
- **Validation :** Zod.
- **Abstractions :** `MarketDataProvider` et `AIProvider` (pattern factory, sélection par env).
- **Infra :** Docker multi-stage + docker-compose (app + postgres).

## 12. Database Architecture

Tables principales : `User`, `Asset`, `Watchlist`, `WatchlistItem`, `Portfolio`, `Position`, `Trade`, `Order`, `JournalEntry`, `Alert`, `Strategy`, `Backtest`, `AiAnalysis`, `Setting`. Relations et énumérations détaillées dans `prisma/schema.prisma`. Migrations via Prisma Migrate.

## 13. API Architecture

Route Handlers Next sous `/api/*`, tous protégés (sauf auth), entrées validées par Zod, réponses JSON typées :

- `POST /api/auth/register|login`, `POST /api/auth/logout`
- `GET /api/market/quote`, `GET /api/market/candles`
- `GET /api/scanner`
- `GET|POST /api/watchlist`, `PATCH|DELETE /api/watchlist/:id`
- `GET|POST /api/paper/orders`, `POST /api/paper/positions/:id/close`
- `GET /api/portfolio`
- `GET|POST /api/journal`
- `POST /api/ai/analyze`
- `POST /api/risk/position-size`
- `GET|POST /api/alerts`

## 14. AI Architecture

Interface `AIProvider` avec méthodes `analyzeAsset`, `chat`, `analyzeJournal`. Implémentations : `mock` (défaut, hors-ligne, déterministe), `openai`, `anthropic`, `ollama` — sélectionnées via `AI_PROVIDER`. Aucune clé n'est jamais hardcodée ni exposée au client (appels côté serveur uniquement). Toute sortie inclut un `confidenceScore` et un `disclaimer` ; le champ `type` marque explicitement qu'il s'agit d'un scénario, pas d'une certitude.

## 15. Security

- Secrets uniquement en variables d'environnement (`.env`, jamais commité ; `.env.example` fourni).
- Clés API IA/marché utilisées **exclusivement côté serveur**.
- Mots de passe : `bcrypt` (coût 12). Sessions : JWT `jose` signé, cookie `httpOnly` + `SameSite=Lax` + `Secure` en prod.
- Middleware protégeant toutes les routes applicatives et API (hors auth).
- Validation/sanitisation Zod de toutes les entrées ; Prisma (requêtes paramétrées) → pas de SQL arbitraire.
- Rate limiting applicatif basique sur les endpoints sensibles (auth, IA).

## 16. Risk Management

Paramètres par utilisateur : `riskPerTradePct`, `maxDailyLossPct`, `maxOpenPositions`, `maxPortfolioExposurePct`. Calcul de taille :

```
Risk $      = capital × riskPerTradePct
Risk/unit   = |entry − stop|
Position    = Risk $ / Risk/unit
```

Exemple : capital 10 000 $, risque 1 %, entrée 100 $, stop 95 $ → risque 100 $, risque/unité 5 $ → **20 unités**. Le calcul est affiché en détail et bloque l'ordre si une limite de risque est violée.

## 17. Testing Strategy

- **Unitaire (Vitest) :** taille de position, P&L réalisé/latent, R/R, contrôles de risque, scoring scanner.
- **Intégration :** handlers d'API critiques (auth, ordres) — ajout progressif.
- **E2E (Playwright) :** flux login → placer un ordre paper → voir la position (phase ultérieure).

## 18. Deployment

`docker compose up -d` lance Postgres + l'app. Les migrations et le seed s'exécutent au démarrage (`db:setup`). Image Next.js `standalone` multi-stage pour un conteneur léger.

## 19. Environment Variables

Voir `.env.example` (source de vérité). Clés : `DATABASE_URL`, `AUTH_SECRET`, `AI_PROVIDER/AI_MODEL/AI_API_KEY/AI_BASE_URL`, `MARKET_PROVIDER/MARKET_API_KEY/MARKET_BASE_URL`, `PAPER_STARTING_CAPITAL`, `PAPER_FEE_BPS`.

## 20. Roadmap

- **Phase 1 (MVP — ce livrable) :** Auth, Dashboard, Market mock, Charts, Watchlist, Scanner, AI Copilot (mock), Paper Trading, Portfolio, Journal, Risk, Alerts (règles), Docker, tests.
- **Phase 2 :** Backtesting simple, Command Center avancé, AI Market Brief + cron, provider marché réel, livraison notifications.
- **Phase 3 :** Intégrations broker (lecture seule → exécution derrière activation explicite), TradingView, bot Telegram, multi-utilisateurs + abonnements.

## 21. MVP Definition

Le MVP est atteint quand : l'app démarre via Docker, l'auth fonctionne, le dashboard affiche des données (mock), on peut placer un ordre paper qui met à jour le portefeuille, le journal enregistre, le co-pilote répond (mock), le risque calcule une taille de position, et les tests critiques passent.

## 22. Acceptance Criteria (par module)

- **Auth :** un utilisateur peut s'inscrire, se déconnecter, se reconnecter ; une route protégée redirige vers /login sans session valide.
- **Dashboard :** affiche valeur portefeuille, P&L jour/total, rendement %, capital dispo, ≥1 position et watchlist non vides après seed.
- **Market data :** `/api/market/quote?symbol=BTC` renvoie un prix ; `/api/market/candles` renvoie ≥ 100 bougies OHLCV pour un timeframe donné.
- **Charts :** rendu chandeliers + volume + au moins une moyenne mobile et le RSI.
- **Watchlist :** ajout puis suppression d'un actif persistent en base.
- **Scanner :** renvoie une liste triée par score 0–100, chaque ligne ayant une explication.
- **AI Copilot :** « Analyse BTC » renvoie tous les champs structurés + disclaimer + confidence.
- **Paper Trading :** un BUY crée une position ; sa clôture calcule un P&L réalisé correct (validé par test).
- **Portfolio :** equity curve + allocation + P&L par actif cohérents avec les positions.
- **Journal :** création d'une entrée persistée ; l'IA renvoie une synthèse sur ≥ 3 entrées.
- **Risk :** pour capital 10 000 $, risque 1 %, entrée 100 $, stop 95 $ → 20 unités (validé par test).
- **Alerts :** une alerte « prix > X » passe à *triggered* quand la quote la dépasse.
- **Qualité :** `npm run typecheck` et `npm run test` passent ; aucun secret hardcodé ; `.env.example`, `README.md`, `PRD.md` présents.
