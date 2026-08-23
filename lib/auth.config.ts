import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe slice of the NextAuth config.
 *
 * `middleware.ts` runs on the Edge runtime, where Prisma and bcrypt cannot
 * load. It builds its own NextAuth instance from this config, which carries
 * only session/JWT wiring — the Credentials provider (and its database
 * lookups) is added in `lib/auth.ts`, which is Node-only.
 */
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
        token.role = (user as { role: string }).role;
        token.userType = (user as { userType: string }).userType;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
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
      role: string;
      userType: "customer" | "staff";
    };
  }
}
