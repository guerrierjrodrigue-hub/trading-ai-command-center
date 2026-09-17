/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * We use it to launch the autonomous trading-bot scheduler (Node runtime only).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBotScheduler } = await import("@/services/bot/scheduler");
    startBotScheduler();
  }
}
