import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Unauthenticated on purpose: Docker's healthcheck calls it. It reveals only
// whether the process and its database are reachable.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, dbLatencyMs: Date.now() - started });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
