import NextAuth from "next-auth";
import { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      /** Legacy single-role field – kept for backward compatibility. */
      role: Role;
      /** Multi-role array. Always populated; falls back to [role] for legacy tokens. */
      roles: Role[];
      stripeAccountId?: string | null;
      stripeOnboardingComplete?: boolean;
    };
  }
  interface User {
    role: Role;
    /** Multi-role array populated at sign-in time. */
    roles?: Role[] | null;
    stripeAccountId?: string | null;
    stripeOnboardingComplete?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    /** Multi-role array carried in the JWT. Optional for backward compat with legacy tokens. */
    roles?: Role[] | null;
    stripeAccountId?: string | null;
    stripeOnboardingComplete?: boolean;
  }
}
