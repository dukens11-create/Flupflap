import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import { recordLoginActivity } from './login-security';
import { safeComparePassword } from './password';
import type { NextAuthOptions } from 'next-auth';

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
        const email = typeof credentials?.email === 'string'
          ? credentials.email.trim().toLowerCase()
          : '';
        if (!email || !credentials?.password) {
          console.warn('[auth] authorize missing credentials');
          return null;
        }

        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) {
            console.warn('[auth] authorize user not found');
            return null;
          }

          const ok = await safeComparePassword(
            credentials.password,
            user.password,
            'authorize',
          );
          if (!ok) {
            console.warn('[auth] authorize invalid password or hash mismatch');
            return null;
          }

          // Seller OTP is no longer part of the active credentials sign-in flow.
          // Sellers (like buyers) authenticate with email + password.

          try {
            await recordLoginActivity(user.id, request);
          } catch (error) {
            console.error('[auth] failed to record login activity', error);
          }

          console.info('[auth] authorize success', { role: user.role });
          return user as any;
        } catch (error) {
          console.error('[auth] authorize unexpected error', { message: error instanceof Error ? error.message : String(error) });
          return null;
        }
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
        delete (token as { image?: unknown }).image;
        delete (token as { picture?: unknown }).picture;
        console.info('[auth] jwt callback attached user', {
          hasUser: true,
          trigger: trigger ?? 'signIn',
        });
      }
      // On session update refresh only minimal user-identifying fields.
      if (trigger === 'update') {
        if (!token.id) {
          console.warn('[auth] jwt update skipped due to missing token id');
          return token;
        }
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { name: true },
          });
          if (dbUser) {
            token.name = dbUser.name;
            delete (token as { image?: unknown }).image;
            delete (token as { picture?: unknown }).picture;
            console.info('[auth] jwt callback refreshed token user fields');
          }
        } catch (error) {
          console.error('[auth] jwt callback update failed', {
            hasTokenId: Boolean(token.id),
            message: error instanceof Error ? error.message : String(error),
          });
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
        delete (session.user as { image?: unknown }).image;
      }
      console.info('[auth] session callback', {
        hasSessionUser: Boolean(session.user),
        hasTokenId: Boolean(token.id),
        tokenRole: token.role ?? null,
      });
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
