# Trading AI Command Center — Bilan global du projet

*Outil personnel d'aide au trading, en simulation (paper trading). Document de référence — mis à jour le 9 septembre 2026.*

---

## 1. Ce que c'est, en une phrase

Une application web privée, pour toi seul, qui réunit au même endroit des **vraies données de marché**, un **co-pilote IA** qui explique des scénarios (jamais des promesses de gain), un **carnet de trading en simulation**, un **scanner d'opportunités**, un **backtesting**, un **courtier en mode démo** (Binance testnet) et un **robot autonome** qui peut trader à ta place — le tout sans jamais risquer d'argent réel tant que tu ne l'actives pas explicitement.

La règle de sécurité qui traverse tout le projet : **simulation par défaut, argent réel jamais sans un interrupteur que tu actives volontairement.** Aujourd'hui cet interrupteur (`BROKER_TRADING_ENABLED`) est **fermé**.

---

## 2. Comment c'est construit (la pile technique)

| Couche | Choix | Pourquoi |
|---|---|---|
| Interface | Next.js 14 (App Router) + TypeScript strict + Tailwind | Un seul projet pour le site et l'API, typage sûr partout |
| Base de données | PostgreSQL + Prisma | Stockage fiable de ton portefeuille, tes trades, tes réglages |
| Authentification | JWT (cookies httpOnly) + middleware | Ton compte est protégé, la session ne fuit pas côté navigateur |
| Graphiques | lightweight-charts + recharts | Bougies façon pro + courbes de portefeuille |
| Déploiement | Docker + docker-compose | Tu lances tout avec une commande, ça marche pareil partout |
| Tests | Vitest | 36 tests qui protègent la logique de calcul |

**Le principe le plus important de l'architecture : les « fournisseurs branchables ».** Chaque source externe est derrière une prise standard, et on choisit laquelle brancher via le fichier `.env`, sans toucher au code :

- **Données de marché** : `mock` (simulation hors-ligne), `coingecko` (crypto réelle, gratuit), `twelvedata` (actions/ETF/forex réels), `live` (composite qui combine les deux).
- **IA** : `mock` (hors-ligne), `openai`, `anthropic`, ou `ollama` (IA locale sur ta machine, gratuite, sans clé).
- **Courtier** : `paper` (simulation interne), `alpaca`, `binance` (testnet).

C'est ce qui rend l'outil « puissant sans être fragile » : si une clé manque ou qu'un service tombe, l'app retombe automatiquement sur le mode simulation et continue de fonctionner.

---

## 3. Les modules (14 pages, 30 routes d'API)

**Tableau de bord** — vue d'ensemble : equity, P&L, exposition, allocation.
**Marchés** — cotations en direct et recherche d'actifs (crypto, actions, ETF, forex).
**Graphiques** — bougies interactives avec indicateurs (moyennes mobiles, RSI, MACD, ATR).
**Scanner** — parcourt l'univers d'actifs et classe les opportunités par « score IA » avec le type de configuration détecté (rebond, cassure, continuation…).
**Co-pilote** — analyse un actif, compare, explique, en présentant des **scénarios** avec un avertissement systématique. Devient réellement intelligent quand Ollama est branché.
**Paper trading** — passe des ordres simulés avec dimensionnement par le risque, stop-loss et take-profit.
**Portefeuille** — positions ouvertes, historique, courbe d'equity, statistiques (taux de réussite, drawdown).
**Backtesting** — teste une stratégie sur l'historique et mesure ce qu'elle aurait donné.
**Journal** — carnet de trades avec émotion, raison, résultat, pour apprendre de tes décisions.
**Alertes** — seuils de prix / RSI / score, livrables par navigateur et **Telegram**.
**Brief** — synthèse quotidienne du marché + ton portefeuille (aussi poussée sur Telegram).
**Courtier** — compte et positions du courtier démo (Binance testnet) en lecture, ordres démo.
**Réglages** — capital de départ, paramètres de risque, connexion Telegram, choix du courtier.
**Auto-Pilot (robot)** — voir section 5.

---

## 4. Les données sont réelles

Tu as branché les vraies sources :

- **Crypto** via CoinGecko (cotations + bougies réelles).
- **Actions / ETF / forex** via Twelve Data (ta clé est en place).
- **Courtier démo** : Binance testnet connecté (clés en place, en `.env` sur ta machine uniquement).
- **Telegram** actif — tu reçois alertes, notifications du robot et brief quotidien.

Aucune clé n'est jamais écrite dans le code ni dans le dépôt : tout vit dans `.env` sur ta machine.

---

## 5. Le robot autonome (Auto-Pilot)

C'est le cœur « puissant » de l'outil. Deux modes :

- **Manuel** : tu choisis la stratégie, les actifs, le stop et l'objectif.
- **Autonome** : tu ne choisis qu'un **niveau de risque** (Prudent / Équilibré / Agressif) et le robot décide *tout* — quels actifs (via le scanner), quand entrer et sortir (score + tendance), la distance du stop (calculée sur la volatilité réelle, l'ATR), la taille de position, le nombre de positions et l'exposition maximale.

À chaque cycle, le robot applique un stop-loss et un take-profit sur chaque position, journalise chaque décision en langage clair, et — nouveauté — t'envoie une notification Telegram à chaque achat/vente.

Un **planificateur interne** réveille le robot tout seul à l'intervalle choisi, même quand tu n'es pas devant l'écran.

---

## 6. Les garde-fous de sécurité (couche la plus récente)

Parce qu'un robot autonome doit pouvoir être arrêté net :

- **Bouton « Arrêt d'urgence »** : ferme *toutes* les positions ouvertes au marché et coupe le robot, avec confirmation.
- **Coupe-circuit drawdown** : si la perte depuis le sommet dépasse la limite du profil (Prudent 10 % · Équilibré 18 % · Agressif 28 %), le robot liquide tout, s'arrête seul, et te prévient sur Telegram.
- **Limite de perte quotidienne** et **limites d'exposition / de positions** vérifiées avant chaque entrée.
- **Interrupteur maître du trading réel fermé** : aucun ordre réel ne part, quoi qu'il arrive, tant que tu ne l'ouvres pas.

---

## 7. État de santé actuel

- **Typecheck** : ✓ (TypeScript strict, zéro erreur)
- **Tests unitaires** : ✓ 36/36
- **Build de production** : ✓ (47 pages/routes générées)
- **Modèle de données** : 16 tables Prisma
- **Sécurité** : trading réel désactivé, secrets hors du code

---

## 8. Comment lancer et vérifier

**Lancer l'app :**
```
docker compose up -d --build
```

**Vérification générale (hors-ligne, sans serveur)** — enchaîne typecheck + tests + build avec un résumé ✓/✗ :
```
npm run verify
```

**Vérification live (app démarrée)** — teste chaque module contre l'app qui tourne :
```
npm run healthcheck
```

**Activer l'IA locale (Ollama)** — dans `.env` :
```
AI_PROVIDER=ollama
AI_MODEL=llama3.1
AI_BASE_URL=http://host.docker.internal:11434
```

---

## 9. Pistes pour la suite

1. **Analytics de performance approfondis** — expectancy par stratégie et par actif, courbe de drawdown dans le temps, comparaison « robot vs acheter-et-garder ».
2. **Trailing stop** (stop suiveur) pour laisser courir les gains.
3. **Rapport hebdomadaire** automatique sur Telegram (bilan de la semaine du robot).
4. **Multi-actifs élargi** dans le scanner du robot (plus d'actions/ETF, pas seulement crypto).
5. **Sauvegarde/export** de ton journal et de ton historique.

---

*Rappel : cet outil produit des scénarios à but d'analyse et d'apprentissage, pas des conseils financiers. Tout se passe en simulation tant que le trading réel n'est pas explicitement activé.*
