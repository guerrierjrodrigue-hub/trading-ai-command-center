/**
 * Next.js instrumentation hook — runs once when the web server process starts.
 *
 * The autonomous bot normally runs in its OWN process (see src/worker.ts),
 * launched by the `worker` service in docker-compose. So by default the web
 * server does NOT start the scheduler — this keeps web + worker from ever
 * running a cycle at the same time. Set RUN_EMBEDDED_BOT=true to also run the
 * bot inside the web server (single-process fallback, the old behaviour).
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.RUN_EMBEDDED_BOT === "true"
  ) {
    const { startBotScheduler } = await import("@/services/bot/scheduler");
    startBotScheduler();
  }
}
