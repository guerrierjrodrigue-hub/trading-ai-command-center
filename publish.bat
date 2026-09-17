@echo off
REM ============================================================
REM  A UTILISER SUR TON ORDINATEUR ACTUEL (celui ou tu edites).
REM  Envoie les derniers changements vers GitHub en 1 double-clic.
REM ============================================================
cd /d "%~dp0"
echo === Envoi des changements vers GitHub ===
git add -A
git commit -m "Mise a jour %date% %time%" || echo (Rien de nouveau a envoyer)
git push
echo.
echo Termine. Sur l'ordinateur 24/7, double-clique sur update.bat
pause
