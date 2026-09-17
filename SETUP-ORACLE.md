# Faire tourner le robot 24/7 dans le cloud, GRATUIT (Oracle Cloud)

But : l'app tourne sur un serveur en ligne **toujours allumé**. Tu peux
l'ouvrir depuis ton **téléphone** ou n'importe quel appareil, même ton
ordinateur éteint. Oracle Cloud offre un serveur **gratuit à vie**
(« Always Free »).

C'est plus technique que les autres options — suis chaque étape dans
l'ordre, tranquillement. Compte ~45 min la première fois.

> **Prérequis** : ton code doit déjà être sur GitHub (voir
> `SETUP-GITHUB.md`, parties A à C). Le serveur récupère le code depuis
> GitHub. Il te faudra aussi un **token GitHub** (PAT) pour cloner un
> dépôt privé — l'étape 7 explique comment le créer.

---

## 1. Créer un compte Oracle Cloud (gratuit)

1. Va sur https://www.oracle.com/cloud/free/ → **Start for free**.
2. Remplis les infos. Une **carte bancaire** est demandée pour vérifier
   l'identité — **rien n'est débité** tant que tu restes sur les
   ressources « Always Free » (ne fais pas d'« upgrade »).
3. Choisis une région proche (ex. *Canada Southeast (Montreal)* ou
   *Canada Central (Toronto)*). ⚠️ La région ne peut pas changer ensuite.
4. Valide. Le compte est prêt en quelques minutes.

## 2. Créer le serveur (VM « Always Free »)

1. Menu (☰) → **Compute** → **Instances** → **Create instance**.
2. **Name** : `trading-robot`.
3. **Image and shape** → **Edit** :
   - **Image** : *Canonical Ubuntu 22.04*.
   - **Shape** : clique *Change shape* → série **Ampere** →
     `VM.Standard.A1.Flex` → mets **1 OCPU** et **6 GB** de mémoire
     (c'est gratuit et largement suffisant).
   - *Si Oracle affiche « out of capacity » pour Ampere* : réessaie plus
     tard, ou prends `VM.Standard.E2.1.Micro` (AMD) — ça marche aussi
     mais c'est plus lent (l'étape 6 « swap » devient alors obligatoire).
4. **Networking** : laisse créer un nouveau VCN (réseau) par défaut.
   Vérifie que **Assign a public IPv4 address** est **coché**.
5. **Add SSH keys** : choisis **Generate a key pair for me** et clique
   **Save private key** (et *Save public key*). Garde bien le fichier de
   clé privée (`.key`) — c'est ton mot de passe pour te connecter.
6. Clique **Create**. Attends que l'état passe à **Running**, puis note
   l'**adresse IP publique** affichée (ex. `140.238.x.x`).

## 3. Ouvrir le port 3000 (pare-feu réseau Oracle)

1. Sur la page de l'instance → section **Primary VNIC** → clique sur le
   nom du **Subnet**.
2. Clique sur la **Security List** par défaut → **Add Ingress Rules**.
3. Remplis :
   - **Source CIDR** : `0.0.0.0/0`
   - **IP Protocol** : `TCP`
   - **Destination Port Range** : `3000`
   - **Add Ingress Rules**.

## 4. Se connecter au serveur (SSH)

Sur **Windows** (PowerShell), place-toi où tu as enregistré la clé et tape
(remplace le nom de la clé et l'IP) :

```
ssh -i .\ta-cle.key ubuntu@TON-IP-PUBLIQUE
```

- Si Windows refuse la clé (« permissions too open »), tape d'abord :
  `icacls ta-cle.key /inheritance:r /grant:r "%USERNAME%:R"`
- Réponds `yes` à la première connexion. Tu es maintenant **sur le
  serveur** (l'invite devient `ubuntu@trading-robot`).

## 5. Installer Docker et Git (sur le serveur)

Copie-colle ces lignes une par une :

```
sudo apt update && sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Puis **déconnecte-toi et reconnecte-toi** (`exit`, puis relance le `ssh`
de l'étape 4) pour que Docker marche sans `sudo`. Vérifie :

```
docker --version
docker compose version
```

## 6. Ajouter de la mémoire d'échange « swap » (recommandé)

Aide à la compilation, surtout sur la petite VM AMD :

```
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 7. Ouvrir le port 3000 dans le pare-feu du système

Les images Ubuntu d'Oracle bloquent tout sauf le SSH. Ouvre le port 3000 :

```
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

## 8. Récupérer le code depuis GitHub

Il te faut un **token** pour cloner un dépôt privé :
1. Sur GitHub : ton avatar → **Settings** → **Developer settings** →
   **Personal access tokens** → **Tokens (classic)** → **Generate new
   token (classic)**. Coche la case **repo**. Génère-le et **copie** le
   token (il commence par `ghp_…`).
2. Sur le serveur :

```
git config --global credential.helper store
git clone https://github.com/TON-PSEUDO/trading-ai-command-center.git
cd trading-ai-command-center
```

Au clone, entre ton **pseudo GitHub** puis, comme mot de passe, **colle le
token** (`ghp_…`). Il sera mémorisé pour les prochaines mises à jour.

## 9. Créer le fichier `.env` (tes clés)

```
nano .env
```

Colle ceci en remplaçant les valeurs, puis `Ctrl+O`, `Entrée`, `Ctrl+X` :

```
# Securite (invente un mot de passe long et une longue chaine aleatoire)
POSTGRES_PASSWORD=change_moi_mot_de_passe_long
AUTH_SECRET=colle_ici_une_longue_chaine_aleatoire_de_40_caracteres

# Donnees de marche
MARKET_PROVIDER=live
MARKET_API_KEY=
STOCKS_API_KEY=ta_cle_twelvedata_si_tu_en_as

# Forex + or (OANDA demo)
OANDA_API_TOKEN=ton_token_oanda
OANDA_ACCOUNT_ID=101-xxx-xxxxxxx-001
OANDA_ENV=practice

# Notifications
TELEGRAM_BOT_TOKEN=ton_token_telegram

# Adresse publique + securite
APP_URL=http://TON-IP-PUBLIQUE:3000
ALLOW_REGISTRATION=true
```

## 10. Lancer le robot 🚀

```
docker compose up -d --build
```

La première fois, la construction prend quelques minutes. Ensuite l'app
crée sa base de données et démarre toute seule.

Ouvre sur ton **téléphone** ou ton ordi : `http://TON-IP-PUBLIQUE:3000`

Crée ton compte (le **premier** compte devient administrateur). **Ensuite,
ferme les inscriptions** pour que personne d'autre ne puisse s'inscrire :
mets `ALLOW_REGISTRATION=false` dans le `.env`, puis relance
`docker compose up -d --build`.

---

## Mettre à jour quand je pousse des changements

Quand je te dis « j'ai poussé des changements », connecte-toi au serveur
(étape 4) et tape :

```
cd ~/trading-ai-command-center && sh update.sh
```

Ça récupère la dernière version et relance le robot. C'est tout.

### (Optionnel) Mise à jour automatique chaque heure

```
(crontab -l 2>/dev/null; echo "0 * * * * cd ~/trading-ai-command-center && sh update.sh >> ~/update.log 2>&1") | crontab -
```

---

## Sécurité — à savoir

- **`ALLOW_REGISTRATION=false`** après avoir créé ton compte (fait à
  l'étape 10) : sinon n'importe qui pourrait créer un compte sur ton URL.
- Choisis un **`AUTH_SECRET`** long et un **`POSTGRES_PASSWORD`** solide.
- L'accès se fait en **HTTP** (pas HTTPS) : pour ton usage perso de paper
  trading c'est acceptable, mais si tu veux le **cadenas HTTPS** (adresse
  `https://`), dis-le-moi — je te montrerai comment ajouter un nom de
  domaine gratuit + HTTPS automatique (Caddy) en ~15 min.
- Ça reste du **paper trading** : aucun argent réel, aucun ordre réel.
