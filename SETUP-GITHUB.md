# Faire tourner le robot 24/7 sur un autre ordinateur (via GitHub privé)

Ce guide remplace la clé USB. Une fois en place, tes changements se
propagent tout seuls : tu publies depuis ton ordi actuel, et l'ordi 24/7
récupère la dernière version en 1 double-clic.

Tu ne fais la partie A/B/C/D qu'**UNE SEULE FOIS**. Ensuite, seul le
flux quotidien (partie E) compte.

---

## A. Créer le dépôt privé sur GitHub (une fois, 3 min)

1. Va sur https://github.com et crée un compte gratuit (si tu n'en as pas).
2. En haut à droite : **+** → **New repository**.
3. Nom : `trading-ai-command-center`. Coche **Private**. Ne coche rien
   d'autre (pas de README, pas de .gitignore). Clique **Create repository**.
4. Sur la page qui s'affiche, copie l'adresse **HTTPS** du dépôt, du genre :
   `https://github.com/TON-PSEUDO/trading-ai-command-center.git`

## B. Installer Git sur les DEUX ordinateurs (une fois)

- Télécharge **Git pour Windows** : https://git-scm.com/download/win
- Installe-le en laissant **toutes les options par défaut**.
  (Ça installe le « Credential Manager » : tu te connecteras à GitHub via
  une fenêtre de navigateur, **sans mot de passe à taper**.)

## C. Premier envoi depuis ton ORDINATEUR ACTUEL (une fois)

1. Ouvre le dossier `trading-ai-command-center`.
2. Clique dans la barre d'adresse de l'explorateur, tape `cmd` puis Entrée
   (un terminal s'ouvre **dans ce dossier**).
3. Tape ces lignes une par une (remplace l'URL par la tienne de l'étape A4) :

   ```
   git init
   git branch -M main
   git add -A
   git commit -m "Version initiale"
   git remote add origin https://github.com/TON-PSEUDO/trading-ai-command-center.git
   git push -u origin main
   ```

   Au `git push`, une fenêtre s'ouvre → connecte-toi à GitHub **une seule
   fois**. Ton code est maintenant sur GitHub (en privé).

## D. Installer sur l'ORDINATEUR 24/7 (une fois)

1. Installe **Git** (partie B) **et Docker Desktop** :
   https://www.docker.com/products/docker-desktop/
2. Ouvre un dossier (ex. le Bureau), tape `cmd` dans la barre d'adresse, puis :

   ```
   git clone https://github.com/TON-PSEUDO/trading-ai-command-center.git
   cd trading-ai-command-center
   ```

3. **Copie ton fichier `.env`** (celui qui contient tes clés OANDA,
   Telegram, etc.) dans ce dossier. ⚠️ Le `.env` n'est **pas** sur GitHub
   (tes secrets restent privés), donc tu le copies à la main **une fois**
   (une clé USB juste pour ce petit fichier, c'est parfait).
4. Lance le robot :

   ```
   docker compose up -d --build
   ```

5. Dans **Docker Desktop → Settings → General**, coche
   **« Start Docker Desktop when you sign in »**. Ainsi, après un
   redémarrage, le robot repart tout seul (le `restart: unless-stopped`
   est déjà configuré).

L'app est accessible sur cet ordinateur à `http://localhost:3000`, et
depuis un autre appareil du même réseau à `http://IP-DE-CET-ORDI:3000`.

---

## E. Le flux de tous les jours (ce qui règle ton problème)

Quand je te dis **« j'ai poussé des changements »** (je les dépose sur ton
ordi actuel) :

1. Sur ton **ordi actuel** : double-clic sur **`publish.bat`**
   → envoie sur GitHub.
2. Sur l'**ordi 24/7** : double-clic sur **`update.bat`**
   → récupère la dernière version et relance le robot à jour.

Fini la clé USB. Les changements s'appliquent partout. ✅

### (Optionnel) Mise à jour automatique toutes les heures

Sur l'ordi 24/7, tu peux programmer `update.bat` dans le **Planificateur
de tâches Windows** (déclencheur : toutes les heures) pour qu'il se mette
à jour tout seul.

---

## Notes importantes

- **Un seul robot à la fois.** Fais tourner le robot sur l'ordi 24/7. Chaque
  ordinateur a sa **propre** base de données (portefeuille papier séparé) :
  si les deux robots tournent en même temps, tu auras deux portefeuilles
  indépendants. Sur ton ordi actuel, sers-toi de l'app surtout pour éditer
  et regarder — ou arrête ses conteneurs (`docker compose down`).
- **Le `.env` ne va jamais sur GitHub** (c'est voulu). Si tu changes une clé,
  mets à jour le `.env` sur l'ordi 24/7 à la main.
