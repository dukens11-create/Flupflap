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
            console.warn('[auth] authorize user lookup failed');
            return null;
          }
          console.info('[auth] authorize user lookup succeeded');

          const ok = await safeComparePassword(
            credentials.password,
            user.password,
            'authorize',
          );
          if (!ok) {
            console.warn('[auth] authorize password verification failed');
            return null;
          }
          console.info('[auth] authorize password verification succeeded');

          // Seller OTP is no longer part of the active credentials sign-in flow.
          // Sellers (like buyers) authenticate with email + password.

          try {
            await recordLoginActivity(user.id, request);
          } catch (error) {
            console.error('[auth] failed to record login activity', error);
          }

          console.info('[auth] authorize success', { role: user.role });
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          } as any;
        } catch (error) {
          console.error('[auth] authorize unexpected error', { message: error instanceof Error ? error.message : String(error) });
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      console.info('[auth] jwt callback invoked', {
        hasUser: Boolean(user),
        hasTokenId: Boolean(token.id),
        trigger: trigger ?? 'signIn',
      });
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as any).role;
        console.info('[auth] jwt callback attached user', {
          hasUser: true,
          trigger: trigger ?? 'signIn',
        });
      }
      // On session update, refresh minimal display fields from DB.
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
      console.info('[auth] session callback invoked', {
        hasSessionUser: Boolean(session.user),
        hasTokenId: Boolean(token.id),
      });
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = typeof token.email === 'string' ? token.email : session.user.email;
        session.user.name = typeof token.name === 'string' ? token.name : session.user.name;
        session.user.role = token.role as any;
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
