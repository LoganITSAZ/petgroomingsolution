#!/usr/bin/env node
/**
 * Supervisor for `next dev`: restarts it when it stops, so an edit never
 * leaves the shop at a shell prompt. Raw server: `npm run dev:raw`.
 *
 * The one crash with a mechanical fix is a torn `.next` — usually `next build`
 * writing over the directory this server was serving — so that case clears the
 * cache before restarting. Everything else just restarts; the output above the
 * message is the evidence.
 */
import { spawn, execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The port is the port.
 *
 * `next dev` slides to the next free one when 3000 is taken and says so in a
 * line that scrolls away, so a second server started by accident answers on
 * 3001 — and the tab that is still pointed at 3000 quietly reads a different
 * server. Sessions, the theme class, an SSE stream: all of it looks broken for
 * a reason nobody can see. Better to refuse and name what is holding it.
 */
const args = process.argv.slice(2);
const flag = args.findIndex((arg) => arg === "-p" || arg === "--port");
const PORT = Number(
  flag >= 0 ? args[flag + 1] : (args.find((a) => a.startsWith("--port="))?.split("=")[1] ?? process.env.PORT ?? 3000)
);

function whoHas(port) {
  // lsof is on every mac and most Linux boxes; without it, say less.
  try {
    return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

async function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
      .listen(port, "0.0.0.0");
  });
}

if (!(await portIsFree(PORT))) {
  const holder = whoHas(PORT);
  process.stderr.write(
    `\n[dev] port ${PORT} is already in use, and this server will not move to another one.\n` +
      (holder ? `\n${holder}\n\n` : "\n") +
      `[dev] stop what is on it, or start this one somewhere else with \`npm run dev -- -p ${PORT + 1}\`.\n`
  );
  process.exit(1);
}
const TORN_NEXT = /Cannot find module '\.[\\/].*\.js'|ENOENT.*\.next[\\/]|missing required error components|Failed to read source code from .*\.next/i;
const CRASH_LOOP_LIMIT = 5;
const CRASH_WINDOW_MS = 60_000;

let tail = "";
let stopping = false;
let child = null;
const crashes = [];

// Registered once: a handler per restart would leak listeners.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => { stopping = true; child ? child.kill(sig) : process.exit(0); });
}

function run() {
  tail = "";
  child = spawn(
    process.execPath,
    // -p last so the probed port wins even if nothing was passed.
    [path.join(ROOT, "node_modules/next/dist/bin/next"), "dev", ...args, "-p", String(PORT)],
    { cwd: ROOT, stdio: ["inherit", "pipe", "pipe"] },
  );
  for (const [src, dest] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    src.on("data", (chunk) => {
      dest.write(chunk);
      tail = (tail + chunk).slice(-8192); // enough for a stack trace, not a log file
    });
  }
  return new Promise((resolve) => child.on("exit", resolve).on("error", () => resolve(1)));
}

for (;;) {
  const code = await run();
  if (stopping) process.exit(0);
  process.stderr.write(`\n[dev] the dev server stopped (exit ${code}). Restarting.\n`);

  if (TORN_NEXT.test(tail)) {
    const dir = path.join(ROOT, process.env.NEXT_DIST_DIR ?? ".next");
    process.stderr.write(`[dev] the build cache looks torn — clearing ${path.relative(ROOT, dir)}.\n`);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  const now = Date.now();
  crashes.push(now);
  while (crashes.length && now - crashes[0] > CRASH_WINDOW_MS) crashes.shift();
  if (crashes.length >= CRASH_LOOP_LIMIT) {
    process.stderr.write("[dev] stopped restarting: 5 crashes in a minute. Fix what the output reports.\n");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}
