import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["customer", "staff"]),
});

/**
 * Whether the account behind a token may still be signed in. Cached per
 * request, like `getStaffRoles()`, so the shell, the page and its guards share
 * one query.
 */
const accountIsActive = cache(async function accountIsActive(
  userType: unknown,
  id: unknown
): Promise<boolean> {
  if (typeof id !== "string") return false;
  const query = { where: { id }, select: { isActive: true } };
  const account =
    userType === "staff"
      ? await prisma.staff.findUnique(query)
      : await prisma.customer.findUnique(query);
  return account?.isActive === true;
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // The token is a snapshot from sign-in, and every visit re-signs it, so a
    // deactivated or deleted account would otherwise stay signed in for as
    // long as it kept using the app. Every page, action and API route resolves
    // its session through this `auth()`; returning null ends it there. The
    // edge proxy cannot query, so it may still let the request through to a
    // page — which then finds no session and sends it to sign in.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (params.user) return token; // authorize() checked isActive just now
      return (await accountIsActive(token.userType, token.id)) ? token : null;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        role: { label: "Role", type: "text" }, // "customer" | "staff"
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password, role } = parsed.data;

        if (role === "staff") {
          const staff = await prisma.staff.findUnique({ where: { email } });
          if (!staff || !staff.isActive) return null;
          const valid = await bcrypt.compare(password, staff.passwordHash);
          if (!valid) return null;
          return {
            id: staff.id,
            email: staff.email,
            name: staff.name,
            roles: staff.roles, // e.g. ["ADMIN", "GROOMER"]
            userType: "staff" as const,
          };
        }

        // customer
        const customer = await prisma.customer.findUnique({ where: { email } });
        if (!customer || !customer.isActive) return null;
        const valid = await bcrypt.compare(password, customer.passwordHash);
        if (!valid) return null;
        return {
          id: customer.id,
          email: customer.email,
          name: `${customer.firstName} ${customer.lastName}`,
          roles: ["CUSTOMER"],
          userType: "customer" as const,
        };
      },
    }),
  ],
});
