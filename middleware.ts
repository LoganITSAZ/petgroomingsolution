import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware runs on the Edge runtime, so it builds its own NextAuth instance
// from the edge-safe config rather than importing lib/auth (Prisma + bcrypt).
const { auth } = NextAuth(authConfig);

export default auth(function middleware(req: NextRequest & { auth: { user?: { userType?: string; role?: string } } | null }) {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // ── Portal: customers only ──────────────────────────────
  if (pathname.startsWith("/portal")) {
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login?type=customer", req.url));
    }
    if (session.user.userType !== "customer") {
      return NextResponse.redirect(new URL("/staff", req.url));
    }
  }

  // ── Staff dashboard: staff only ─────────────────────────
  if (pathname.startsWith("/staff")) {
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login?type=staff", req.url));
    }
    if (session.user.userType !== "staff") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  // ── Admin panel: ADMIN role only ────────────────────────
  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login?type=staff", req.url));
    }
    if (session.user.userType !== "staff" || session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/staff", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/portal/:path*", "/staff/:path*", "/admin/:path*"],
};
