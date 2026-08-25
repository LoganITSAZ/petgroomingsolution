import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware runs on the Edge runtime, so it builds its own NextAuth instance
// from the edge-safe config rather than importing lib/auth (Prisma + bcrypt).
const { auth } = NextAuth(authConfig);

export default auth(function middleware(req: NextRequest & { auth: { user?: { userType?: string; roles?: string[]; role?: string } } | null }) {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // ── Moved routes ────────────────────────────────────────
  // Analytics left the admin panel and is now open to all staff. The redirect
  // lives here rather than in a stub page because a page under /admin renders
  // inside the admin layout, which would bounce a non-admin to /staff first.
  if (pathname === "/admin/analytics") {
    return NextResponse.redirect(new URL(`/staff/analytics${req.nextUrl.search}`, req.url));
  }

  // Feature flags folded into shop settings — enabling a feature is a shop
  // setting like any other.
  if (pathname === "/admin/features") {
    return NextResponse.redirect(new URL("/admin/settings", req.url));
  }

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
    // Staff only here; whether they are an admin is confirmed against the
    // database in the admin layout, which is the authority. Middleware runs on
    // the edge with no database access, so it cannot see a role granted after
    // the token was issued.
    if (session.user.userType !== "staff") {
      return NextResponse.redirect(new URL("/staff", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/portal/:path*", "/staff/:path*", "/admin/:path*"],
};
