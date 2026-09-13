#!/usr/bin/env node
/**
 * `next dev` with one thing added: it refuses to start on a port that is
 * already taken rather than sliding to the next one.
 */
import { spawn, execFileSync } from "node:child_process";
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

// -p last so the probed port wins even if nothing was passed.
const child = spawn(
  process.execPath,
  [path.join(ROOT, "node_modules/next/dist/bin/next"), "dev", ...args, "-p", String(PORT)],
  { cwd: ROOT, stdio: "inherit" },
);

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => child.kill(sig));
}

child.on("exit", (code) => process.exit(code ?? 0));
