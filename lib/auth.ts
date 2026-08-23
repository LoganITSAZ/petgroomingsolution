import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["customer", "staff"]),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
            role: staff.role,       // "ADMIN" | "GROOMER"
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
          role: "CUSTOMER",
          userType: "customer" as const,
        };
      },
    }),
  ],
});
