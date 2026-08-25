import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe slice of the NextAuth config.
 *
 * `middleware.ts` runs on the Edge runtime, where Prisma and bcrypt cannot
 * load. It builds its own NextAuth instance from this config, which carries
 * only session/JWT wiring — the Credentials provider (and its database
 * lookups) is added in `lib/auth.ts`, which is Node-only.
 */
/**
 * Roles out of a JWT. Tokens minted before staff could hold several roles
 * carry a single `role` string; they stay valid until they expire rather than
 * silently losing every permission.
 */
function readRoles(token: Record<string, unknown>): string[] {
  const roles = token.roles;
  if (Array.isArray(roles)) return roles as string[];
  const legacy = token.role;
  return typeof legacy === "string" && legacy ? [legacy] : [];
}

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [], // real providers are attached in lib/auth.ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = (user as { roles: string[] }).roles;
        token.userType = (user as { userType: string }).userType;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.roles = readRoles(token);
      session.user.userType = token.userType as "customer" | "staff";
      return session;
    },
  },
} satisfies NextAuthConfig;

// Extend next-auth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      /** Staff may hold several: ADMIN, GROOMER, BATHER. Customers hold CUSTOMER. */
      roles: string[];
      userType: "customer" | "staff";
    };
  }
}
