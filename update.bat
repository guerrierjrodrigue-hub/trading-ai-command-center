@echo off
REM ============================================================
REM  A UTILISER SUR L'ORDINATEUR 24/7 (celui qui fait tourner le robot).
REM  Recupere la derniere version depuis GitHub et relance le robot,
REM  en 1 double-clic.
REM ============================================================
cd /d "%~dp0"
echo === Recuperation de la derniere version depuis GitHub ===
git pull
echo.
echo === Reconstruction et redemarrage du robot ===
docker compose up -d --build
echo.
echo Robot a jour et relance. Tu peux fermer cette fenetre.
pause
