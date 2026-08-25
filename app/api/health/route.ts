import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Unauthenticated on purpose: Docker's healthcheck calls it. It reveals only
// whether the process and its database are reachable and agree on the schema.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    // Not `SELECT 1`. A raw ping proves the socket is open and nothing else,
    // so an image built before a migration ran reports healthy while every
    // page 500s on P2022. Reading SystemConfig goes through the generated
    // client, which names every column it expects — the widest model in the
    // app and the one every page loads — so a schema the running code does
    // not match fails here first, where the orchestrator can see it.
    // No `select`: the point is to make Prisma name every column it was
    // generated with. Narrowing the projection would narrow the check to
    // exactly the columns that cannot drift.
    await prisma.systemConfig.findUnique({ where: { id: "global" } });
    return NextResponse.json({ ok: true, dbLatencyMs: Date.now() - started });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
