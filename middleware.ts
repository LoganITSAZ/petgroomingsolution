import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildCsp, SECURITY_HEADERS } from "@/lib/csp";

// Middleware runs on the Edge runtime, so it builds its own NextAuth instance
// from the edge-safe config rather than importing lib/auth (Prisma + bcrypt).
const { auth } = NextAuth(authConfig);

export default auth(function middleware(req: NextRequest & { auth: { user?: { userType?: string; roles?: string[]; role?: string } } | null }) {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // A fresh nonce per request, forwarded two ways: on the request headers so
  // Next can read it (`headers()`) to nonce our own inline scripts and
  // auto-nonce its own injected bundle scripts, and on the response so the
  // browser enforces it.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // x-forwarded-proto when behind Nginx, the URL's own scheme otherwise.
  const secure =
    (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
  const csp = buildCsp(nonce, secure);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  function withSecurityHeaders(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", csp);
    for (const [name, value] of SECURITY_HEADERS) response.headers.set(name, value);
    return response;
  }

  // ── Moved routes ────────────────────────────────────────
  // Analytics left the admin panel and is now open to all staff. The redirect
  // lives here rather than in a stub page because a page under /admin renders
  // inside the admin layout, which would bounce a non-admin to /staff first.
  if (pathname === "/admin/analytics") {
    return withSecurityHeaders(
      NextResponse.redirect(new URL(`/staff/analytics${req.nextUrl.search}`, req.url))
    );
  }

  // Feature flags folded into shop settings — enabling a feature is a shop
  // setting like any other.
  if (pathname === "/admin/features") {
    return withSecurityHeaders(NextResponse.redirect(new URL("/admin/settings", req.url)));
  }

  // ── Portal: customers only ──────────────────────────────
  if (pathname.startsWith("/portal")) {
    if (!session?.user) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/login?type=customer", req.url)));
    }
    if (session.user.userType !== "customer") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/staff", req.url)));
    }
  }

  // ── Staff dashboard: staff only ─────────────────────────
  if (pathname.startsWith("/staff")) {
    if (!session?.user) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/login?type=staff", req.url)));
    }
    if (session.user.userType !== "staff") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/portal", req.url)));
    }
  }

  // ── Admin panel: ADMIN role only ────────────────────────
  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/login?type=staff", req.url)));
    }
    // Staff only here; whether they are an admin is confirmed against the
    // database in the admin layout, which is the authority. Middleware runs on
    // the edge with no database access, so it cannot see a role granted after
    // the token was issued.
    if (session.user.userType !== "staff") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/staff", req.url)));
    }
  }

  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
});

export const config = {
  // Broadened from the auth-only routes so every page (public site, kiosk
  // included) gets the CSP/security headers. The pathname checks above still
  // gate only /portal, /staff and /admin — this does not add a login
  // requirement to /station or the public site.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
