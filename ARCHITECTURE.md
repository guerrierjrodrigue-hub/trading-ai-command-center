# ARCHITECTURE — Trading AI Command Center

## 1. Analyse de l'image de référence (inspiration, non copie)

La capture fournie (« GO OS — AI Trading Co-Pilot ») a servi **uniquement d'inspiration fonctionnelle et esthétique**. Aucun nom, logo, texte ou identité visuelle n'a été repris. Ce que j'en ai retenu :

| Élément observé | Lecture | Décision produit (originale) |
|---|---|---|
| **Style visuel** | Dark mode profond, dégradé violet, glow, halo lumineux central | Thème sombre premium, accent **violet/cyan** distinct, glow discret sur les surfaces actives |
| **Couleurs** | Violet dominant sur fond quasi noir | Palette neutre (`#0a0b0f` → `#141722`) + accent `#7c5cff`, vert/rouge cohérents pour P&L |
| **Typographie** | Sans-serif moderne, hiérarchie forte titre/sous-titre | Sans-serif système, échelle typographique nette, chiffres tabulaires pour les données |
| **Structure** | Landing marketing centrée (logo, claim, CTA) | Je transforme ce langage en **dashboard applicatif** (sidebar + cartes), pas une landing |
| **Positionnement** | « co-pilote de trading », « signaux temps réel », « portefeuilles » | Repris comme **concept fonctionnel** (co-pilote IA structuré), pas comme branding |
| **Éléments à améliorer** | Une landing ne montre ni données ni raisonnement ; promesses fortes (« signaux ») | Je privilégie la **transparence** : chaque sortie IA est un scénario avec score de confiance et disclaimer |

**Conclusion :** l'image est une page marketing ; je construis le **produit réel** derrière ce type de promesse — un cockpit sombre, dense en données, orienté discipline et gestion du risque.

## 2. Vue d'ensemble

```
                         ┌─────────────────────────────────────────┐
                         │            Next.js 14 (App Router)        │
   Navigateur  ◄────────►│  Server Components  +  Client Components   │
   (dark UI)             │                                           │
                         │  Route Handlers  /api/*  (backend)        │
                         └───────────────┬───────────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                 │
        ▼                                ▼                                 ▼
┌───────────────┐            ┌───────────────────────┐          ┌──────────────────┐
│ MarketData     │            │  Trading / Risk        │          │  AI Provider      │
│ Provider (IF)  │            │  engines (pure TS)     │          │ (IF)              │
│  ├ mock        │            │  ├ paper-engine        │          │  ├ mock (défaut)  │
│  └ coingecko   │            │  ├ pnl                 │          │  ├ openai         │
└───────────────┘            │  ├ portfolio           │          │  ├ anthropic      │
        │                     │  └ position-sizing     │          │  └ ollama         │
        │                     └───────────┬───────────┘          └────────┬─────────┘
        │                                 │                                │
        └─────────────────────────────────┼────────────────────────────────┘
                                          ▼
                              ┌───────────────────────┐
                              │  Prisma ORM            │
                              │  PostgreSQL            │
                              └───────────────────────┘
```

Le principe directeur : **la logique métier (P&L, risque, portefeuille) est du TypeScript pur, testable, découplé de Next, de la DB et des providers.** Les providers externes sont derrière des interfaces ; on peut changer de LLM ou de source de données sans toucher au reste.

## 3. Choix de stack et justifications

### Next.js 14 (App Router) + TypeScript — *retenu*
Un seul framework couvre le frontend (React Server/Client Components) **et** le backend (Route Handlers), ce qui réduit la surface à maintenir pour un projet solo, tout en restant prêt pour le SaaS. TypeScript strict partout pour la sûreté (calculs financiers = zéro tolérance à l'erreur de type). *Alternative écartée :* backend séparé (NestJS + SPA) — surdimensionné pour un MVP mono-utilisateur.

### Tailwind CSS — *retenu*
Itération UI rapide, thème sombre cohérent via tokens, aucun runtime CSS. *Alternative écartée :* librairie de composants lourde (MUI) — impose son identité visuelle, à l'opposé du look premium sur-mesure voulu.

### PostgreSQL + Prisma — *retenu*
Postgres : relationnel robuste, parfait pour des données transactionnelles (ordres, positions, trades) où l'intégrité prime. Prisma : schéma unique typé, migrations versionnées, client type-safe → aligné TypeScript. *Alternative écartée :* MongoDB — le domaine est fortement relationnel (portefeuille ↔ positions ↔ trades), le SQL est le bon choix.

### Auth : `jose` (JWT) + `bcryptjs` + middleware — *retenu*
Contrôle total, aucune dépendance lourde, cookies httpOnly, facile à faire évoluer vers du multi-tenant. *Alternative écartée :* NextAuth v5 (beta) — pratique mais moins transparent pour un flux credentials simple et encore mouvant.

### Charts : `lightweight-charts` + `recharts` — *retenu*
`lightweight-charts` (TradingView, open-source) est **la** référence pour les chandeliers financiers : léger, performant, fait pour l'OHLCV. `recharts` (déclaratif React) couvre equity curve / allocation. *Alternative écartée :* Chart.js — moins adapté aux chandeliers et à l'axe temps financier.

### Validation : `zod` — *retenu*
Schémas partagés client/serveur, inférence de types, sanitisation des entrées d'API.

### Docker + docker-compose — *retenu*
Démarrage reproductible en une commande, isole Postgres, prêt à ajouter des services (worker cron, reverse proxy) plus tard.

## 4. Découplage des providers (extensibilité)

```ts
// Sélection par variable d'environnement, jamais de couplage en dur.
getMarketDataProvider()  // -> Mock | CoinGecko | (Binance, AlphaVantage… plus tard)
getAIProvider()          // -> Mock | OpenAI | Anthropic | Ollama | (local…)
```

Ajouter un fournisseur = implémenter l'interface + l'ajouter à la factory. **Aucune** partie de l'app n'importe un provider concret directement.

## 5. Distinction données réelles / simulation / IA

- **Données de marché** : rendues en neutre ; champ `source` (`mock`/`live`) exposé.
- **Simulation** : toute entité issue du paper trading porte un badge `PAPER`; aucun ordre réel n'existe dans le MVP.
- **Sorties IA** : type `scenario`, avec `confidenceScore` et `disclaimer` obligatoires ; jamais formulées comme certitudes.

## 6. Sécurité (résumé, détail dans PRD §15)

Secrets en env only · clés IA/marché côté serveur uniquement · bcrypt(12) · JWT httpOnly/SameSite · middleware sur toutes les routes protégées · validation Zod · requêtes Prisma paramétrées · rate limiting basique.

## 7. Structure du projet

```
trading-ai-command-center/
├── prisma/
│   ├── schema.prisma          # modèle de données + enums + relations
│   └── seed.ts                # utilisateur démo + actifs + portefeuille + données
├── src/
│   ├── middleware.ts          # protection des routes
│   ├── app/
│   │   ├── (auth)/            # login, register
│   │   ├── (app)/             # dashboard, markets, scanner, copilot, portfolio,
│   │   │                      # paper-trading, journal, charts, alerts, settings
│   │   └── api/               # route handlers (backend)
│   ├── lib/                   # prisma, auth, env, validation, utils
│   ├── services/
│   │   ├── market/            # MarketDataProvider (mock + coingecko)
│   │   ├── ai/                # AIProvider (mock/openai/anthropic/ollama) + prompts
│   │   ├── trading/           # paper-engine, pnl, portfolio  (TS pur, testé)
│   │   ├── risk/              # position-sizing, contrôles de risque (TS pur, testé)
│   │   └── scanner/           # indicateurs + scoring
│   ├── components/            # ui/, layout/, dashboard/, charts/, copilot/, markets/
│   └── tests/                 # vitest: pnl, position-sizing, risk, scanner
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── PRD.md
├── ARCHITECTURE.md
└── README.md
```

## 8. Flux clé — placer un ordre paper

1. UI (Paper Trading) → `POST /api/paper/orders` `{symbol, side, entry, stop, takeProfit, riskPct}` (validé Zod).
2. Handler : charge le portefeuille + settings de risque de l'utilisateur.
3. `risk/position-sizing` calcule la taille ; les contrôles de risque valident (ou rejettent).
4. `trading/paper-engine` crée l'`Order` (rempli au prix courant du provider marché), la `Position`, débite le capital des frais simulés.
5. Réponse : position créée + détail du calcul de risque. Le dashboard/portfolio reflètent l'état.

## 9. Ce qui est prêt pour l'avenir (sans être implémenté au MVP)

Interfaces broker (`OrderRouter`) non câblées ; `Strategy`/`Backtest` déjà en base ; hooks de notification (`Alert.channels`) ; `AiAnalysis` persistée pour un futur *Market Brief* en cron ; schéma multi-utilisateur natif (tout est déjà scoping par `userId`).
