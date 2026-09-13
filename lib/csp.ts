/**
 * Content-Security-Policy and companion security headers.
 *
 * Pure string-builders with no `next/server` import, so they're unit
 * testable without a request/response — `middleware.ts` is the only caller.
 */

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // `next dev` (Turbopack) compiles and hot-reloads modules through `eval`,
  // so a dev page with no 'unsafe-eval' loads its HTML and then dies with
  // "eval() is not supported in this environment". Production never gets it.
  `script-src 'self' 'nonce-__NONCE__' 'strict-dynamic'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  }`,
  // Inline `style=""` attributes are used throughout the app (progress bars,
  // theme tokens in lib/themes.ts), and a nonce only covers <style> elements,
  // not the attribute — so this stays 'unsafe-inline' rather than breaking layout.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "object-src 'none'",
  // The address map is a keyless OpenStreetMap iframe embed (lib/map-urls.ts).
  "frame-src 'self' https://www.openstreetmap.org",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

// Only meaningful when the page itself arrived over TLS. On a plain-http
// origin it rewrites every subresource to https — so a shop terminal or a
// phone hitting the LAN IP asks for a stylesheet on a port serving no TLS,
// the request is reset, and the page renders unstyled. Added per request.
const UPGRADE_INSECURE = "upgrade-insecure-requests";

/**
 * Builds the CSP header value for one request's nonce.
 *
 * `secure` is whether the request arrived over https; only then is
 * `upgrade-insecure-requests` emitted.
 */
export function buildCsp(nonce: string, secure = false): string {
  const directives = secure ? [...CSP_DIRECTIVES, UPGRADE_INSECURE] : CSP_DIRECTIVES;
  return directives.join("; ").replace("__NONCE__", nonce) + ";";
}

/** Headers with no per-request value — set alongside the CSP header. */
export const SECURITY_HEADERS: [string, string][] = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
];
