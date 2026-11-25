/**
 * Standalone bot worker — Chemin B.
 *
 * The autonomous trading bot runs here, in its OWN process, separate from the
 * web server. The web app (dashboard) and this worker share the same database;
 * the worker is the ONLY process that runs trading cycles (the web server's
 * embedded scheduler is off unless RUN_EMBEDDED_BOT=true). A cross-process
 * lease lock in runBotCycle makes even a manual "run now" from the dashboard
 * safe. PAPER only.
 *
 * Launched by the `worker` service in docker-compose:  npx tsx src/worker.ts
 */
import { startBotScheduler } from "@/services/bot/scheduler";

process.on("uncaughtException", (e) => {
  // eslint-disable-next-line no-console
  console.error("[worker] uncaughtException:", e);
});
process.on("unhandledRejection", (e) => {
  // eslint-disable-next-line no-console
  console.error("[worker] unhandledRejection:", e);
});
process.on("SIGTERM", () => {
  // eslint-disable-next-line no-console
  console.log("[worker] SIGTERM reçu — arrêt du worker.");
  process.exit(0);
});

// eslint-disable-next-line no-console
console.log("[worker] Démarrage du worker bot (processus séparé). PAPER only.");
startBotScheduler();
// startBotScheduler installs a setInterval, which keeps this process alive.
