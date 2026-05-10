import NextAuth from "next-auth";
import { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: Role;
      stripeAccountId?: string | null;
      stripeOnboardingComplete?: boolean;
    };
  }
  interface User {
    role: Role;
    stripeAccountId?: string | null;
    stripeOnboardingComplete?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    stripeAccountId?: string | null;
    stripeOnboardingComplete?: boolean;
  }
}
