import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import { recordLoginActivity } from './login-security';
import { safeComparePassword } from './password';
import type { NextAuthOptions } from 'next-auth';

function toSessionImage(image: string | null | undefined, cacheBuster?: number) {
  if (!image) return null;
  if (image.startsWith('data:image/')) {
    const v = cacheBuster ?? Date.now();
    return `/api/account/avatar?v=${v}`;
  }
  return image;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
        otp:      { label: 'Code',     type: 'text' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase() } });
        if (!user) return null;
        const ok = await safeComparePassword(
          credentials.password,
          user.password,
          'authorize',
        );
        if (!ok) return null;

        // Seller OTP is no longer part of the active credentials sign-in flow.
        // Sellers (like buyers) authenticate with email + password.

        try {
          await recordLoginActivity(user.id, request);
        } catch (error) {
          console.error('[auth] failed to record login activity', error);
        }

        return user as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.stripeAccountId = (user as any).stripeAccountId;
        token.stripeOnboardingComplete = (user as any).stripeOnboardingComplete;
        token.image = toSessionImage((user as any).image);
      }
      // On session update (e.g. after avatar upload) re-fetch image from DB.
      if (trigger === 'update') {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { image: true, name: true },
        });
        if (dbUser) {
          token.image = toSessionImage(dbUser.image, Date.now());
          token.name = dbUser.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as any;
        session.user.stripeAccountId = token.stripeAccountId as any;
        session.user.stripeOnboardingComplete = Boolean(token.stripeOnboardingComplete);
        session.user.image = (token.image as string | null) ?? null;
      }
      return session;
    }
  }
};

export async function requireRole(email:string|undefined|null, roles:string[]) {
  if (!email) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !roles.includes(user.role)) return null;
  return user;
}
