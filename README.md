# Trading AI Command Center

Cockpit personnel de trading avec co-pilote IA, scanner d'opportunités, **paper trading**,
portefeuille virtuel, journal et gestion du risque — dans une interface web sombre et premium.

> ⚠️ **Mode simulation uniquement.** Aucun ordre réel n'est envoyé à un broker. Toute analyse
> de l'IA est un **scénario**, jamais une garantie de profit. Ce n'est pas un conseil financier.

Voir **[PRD.md](./PRD.md)** (spécifications produit) et **[ARCHITECTURE.md](./ARCHITECTURE.md)**
(choix techniques, analyse de l'inspiration, structure).

---

## 1. Ce que fait le projet

| Module | Description |
|---|---|
| **Dashboard** | Valeur du portefeuille, P&L jour/total, rendement, capital dispo, positions, watchlist, opportunités, sentiment. |
| **Markets** | Watchlist personnalisable + tous les marchés (crypto, actions, ETF, forex). |
| **Scanner** | *AI Opportunity Score* (0–100) par actif, expliqué (tendance, RSI, MACD, S/R). |
| **AI Copilot** | Analyse structurée d'un actif (« Analyse BTC »), chat, analyse du journal. |
| **Portfolio** | Equity curve, allocation, positions, historique, drawdown, win rate. |
| **Paper Trading** | Ordres BUY/SELL simulés, sizing par risque, stop/TP, frais, P&L. |
| **Charts** | Chandeliers + EMA20/50 + volume + RSI, multi-timeframes. |
| **Journal** | Enregistrement des trades + analyse IA des patterns. |
| **Alerts** | Règles prix/RSI/volume évaluées côté serveur. |
| **Settings** | Paramètres de gestion du risque, providers actifs. |

## 2. Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma ·
`lightweight-charts` + `recharts` · Auth JWT maison (`jose` + `bcryptjs`) · Zod · Docker.

Providers **découplés** et sélectionnables par variable d'environnement :
- **Données de marché** : `mock` (défaut, hors-ligne) · `coingecko`
- **IA** : `mock` (défaut, hors-ligne) · `openai` · `anthropic` · `ollama`

L'application fonctionne **entièrement sans aucune clé d'API** grâce aux providers `mock`.

## 3. Prérequis

- **Option A (recommandée) :** Docker + Docker Compose.
- **Option B (local) :** Node.js ≥ 20 et un PostgreSQL accessible.

## 4. Démarrage rapide avec Docker

```bash
# 1. Copier la configuration
cp .env.example .env

# 2. (Recommandé) générer un secret d'auth et le coller dans AUTH_SECRET du .env
openssl rand -base64 48

# 3. Lancer
docker compose up -d --build
```

L'application applique le schéma, insère les données de démo, puis démarre sur
**http://localhost:3000**.

**Compte de démo :** `demo@trading.ai` / `demo1234`

```bash
docker compose logs -f app   # suivre les logs
docker compose down          # arrêter
docker compose down -v       # arrêter + supprimer la base
```

## 5. Démarrage en local (sans Docker)

```bash
cp .env.example .env
# Dans .env, pointe DATABASE_URL vers ton Postgres local, par ex :
#   DATABASE_URL=postgresql://trading:trading@localhost:5432/trading_ai?schema=public

npm install
npx prisma generate
npx prisma db push        # crée les tables depuis le schéma
npm run db:seed           # données de démo (optionnel)
npm run dev               # http://localhost:3000
```

## 6. Variables d'environnement

`.env.example` est la source de vérité. Principales :

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL | — |
| `AUTH_SECRET` | Secret de signature des sessions JWT (≥ 32 car.) | à générer |
| `AI_PROVIDER` | `mock` \| `openai` \| `anthropic` \| `ollama` | `mock` |
| `AI_MODEL` / `AI_API_KEY` / `AI_BASE_URL` | Config du LLM (clé côté serveur seulement) | vide |
| `MARKET_PROVIDER` | `mock` \| `coingecko` | `mock` |
| `PAPER_STARTING_CAPITAL` | Capital initial simulé | `10000` |
| `PAPER_FEE_BPS` | Frais simulés (points de base) | `10` |

**Sécurité :** les clés d'API ne sont lues que côté serveur (voir `src/lib/env.ts`) et ne
sont jamais envoyées au navigateur. Ne jamais committer `.env`.

## 7. Configuration de l'IA

Par défaut `AI_PROVIDER=mock` : analyses **déterministes et explicables** calculées à partir
des indicateurs réels, sans clé. Pour brancher un vrai LLM :

```env
# OpenAI
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-...

# Anthropic
AI_PROVIDER=anthropic
AI_MODEL=claude-3-5-sonnet-latest
AI_API_KEY=sk-ant-...

# Ollama (local, sans clé)
AI_PROVIDER=ollama
AI_MODEL=llama3.1
AI_BASE_URL=http://localhost:11434
```

Ajouter un provider = implémenter l'interface `AIProvider` (`src/services/ai/`) et l'inscrire
dans la factory.

## 8. Données de marché

`MARKET_PROVIDER=mock` génère une marche aléatoire **reproductible** (aucun réseau).
`coingecko` est fourni comme exemple de source réelle (crypto). Nouveau fournisseur =
implémenter `MarketDataProvider` (`src/services/market/`).

## 9. Base de données

Schéma dans `prisma/schema.prisma`. Commandes utiles :

```bash
npm run prisma:generate     # génère le client
npx prisma db push          # applique le schéma (dev rapide)
npm run prisma:migrate:dev  # crée une migration versionnée
npm run db:seed             # (ré)insère les données de démo
npx prisma studio           # explorateur de données
```

> Le conteneur utilise `prisma db push` au démarrage pour une mise en route sans friction.
> Pour un historique de migrations versionné, utilise `prisma migrate dev` en local.

## 10. Tests

```bash
npm run test        # Vitest — logique critique
npm run typecheck   # TypeScript strict
```

Couvre : taille de position, P&L réalisé/latent, R/R, contrôles de risque, moteur paper,
métriques de portefeuille, indicateurs (RSI/EMA/SMA).

## 11. Structure

```
src/
  app/            # pages (App Router) + api/ (route handlers)
  lib/            # env, prisma, auth, validation, api helpers, utils
  services/
    market/       # MarketDataProvider (mock + coingecko) + indicateurs
    ai/           # AIProvider (mock/openai/anthropic/ollama) + prompts
    trading/      # paper-engine, pnl, portfolio, state  (TS pur, testé)
    risk/         # position-sizing + contrôles de risque (TS pur, testé)
    scanner/      # scoring d'opportunités
  components/     # ui, layout, charts, copilot
  middleware.ts   # protection des routes
prisma/           # schema + seed
```

## 12. Sécurité

Secrets en env only · clés IA/marché côté serveur uniquement · `bcrypt` (coût 12) ·
sessions JWT `httpOnly`/`SameSite` · middleware d'auth sur toutes les routes protégées ·
validation Zod de toutes les entrées · requêtes Prisma paramétrées · rate limiting basique
sur l'auth et l'IA.

## 13. Feuille de route

- **Phase 1 (MVP — ce dépôt) :** modules ci-dessus, providers mock, Docker, tests.
- **Phase 2 :** backtesting simple, Command Center avancé, *AI Market Brief* + cron,
  provider marché réel, livraison des alertes (browser/email/Telegram/Discord).
- **Phase 3 :** intégrations broker (lecture puis exécution derrière activation explicite),
  TradingView, bot Telegram, multi-utilisateurs + abonnements.

## 14. Dépannage

| Problème | Piste |
|---|---|
| L'app ne joint pas la DB | Vérifier `DATABASE_URL` ; en compose l'hôte est `db`. Attendre le healthcheck. |
| Page blanche / 401 en boucle | `AUTH_SECRET` manquant/instable — définis-en un fixe. |
| L'IA renvoie une erreur | Provider réel mal configuré → repasse `AI_PROVIDER=mock`. |
| Graphique vide | Vérifier que `/api/market/candles` répond (provider mock actif par défaut). |
| Port 3000 occupé | Change le mapping de port dans `docker-compose.yml`. |

---

Fait pour un usage personnel. Reste discipliné : définis stop et take-profit **avant**
d'entrer, et respecte tes limites de risque. 📉📈
