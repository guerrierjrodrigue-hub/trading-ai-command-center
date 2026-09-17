#!/usr/bin/env node
/**
 * General verification — runs the full static suite in order and prints a
 * clean ✓/✗ summary. Everything here works OFFLINE and needs NO running
 * server or database:
 *
 *   npm run verify
 *
 * Steps: TypeScript typecheck → unit tests (Vitest) → production build (Next).
 *
 * For the LIVE end-to-end check (every module's API against the running app),
 * start the app first (docker compose up -d) then run:  npm run healthcheck
 *
 * Options:
 *   SKIP_BUILD=1   skip the (slow) production build step
 */
import { spawnSync } from "node:child_process";

const G = "\x1b[32m", R = "\x1b[31m", C = "\x1b[36m", DIM = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

const steps = [
  { name: "Typecheck (tsc)", cmd: "npm", args: ["run", "--silent", "typecheck"] },
  { name: "Tests unitaires (vitest)", cmd: "npm", args: ["run", "--silent", "test"] },
];
if (process.env.SKIP_BUILD !== "1") {
  steps.push({ name: "Build de production (next)", cmd: "npm", args: ["run", "--silent", "build"] });
}

console.log(`\n${B}${C}Trading AI Command Center — vérification générale${X}\n`);

const results = [];
const t0 = Date.now();

for (const step of steps) {
  process.stdout.write(`${C}▶${X} ${step.name} ${DIM}…${X}\n`);
  const started = Date.now();
  const r = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    shell: process.platform === "win32", // npm is a .cmd on Windows
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const ok = r.status === 0;
  results.push({ name: step.name, ok, secs });
  console.log(ok ? `${G}✓ ${step.name}${X} ${DIM}(${secs}s)${X}\n` : `${R}✗ ${step.name} — code ${r.status}${X} ${DIM}(${secs}s)${X}\n`);
  if (!ok) break; // stop at the first failure — later steps depend on earlier ones
}

const total = ((Date.now() - t0) / 1000).toFixed(1);
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;

console.log(`${B}Résumé${X} ${DIM}(${total}s)${X}`);
for (const r of results) console.log(`  ${r.ok ? G + "✓" : R + "✗"}${X} ${r.name} ${DIM}${r.secs}s${X}`);
if (steps.length > results.length) console.log(`  ${DIM}· ${steps.length - results.length} étape(s) non exécutée(s) (arrêt sur échec)${X}`);

if (failed === 0) {
  console.log(`\n${G}${B}Tout est vert : ${passed}/${steps.length} étapes réussies.${X}`);
  console.log(`${DIM}Astuce : lance l'app (docker compose up -d) puis \`npm run healthcheck\` pour le test live des modules.${X}\n`);
  process.exit(0);
} else {
  console.log(`\n${R}${B}Échec : ${failed} étape(s) en erreur.${X} Corrige au-dessus puis relance \`npm run verify\`.\n`);
  process.exit(1);
}
