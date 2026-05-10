import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import { recordLoginActivity } from './login-security';
import { safeComparePassword } from './password';
import type { NextAuthOptions } from 'next-auth';

const SESSION_IMAGE_MAX_LENGTH = 2048;
const AVATAR_ROUTE = '/api/account/avatar';

function toSessionImage(image: string | null | undefined, cacheBuster?: number) {
  if (typeof image !== 'string') return null;

  const value = image.trim();
  if (!value) return null;
  const lowerValue = value.toLowerCase();

  if (value.length > SESSION_IMAGE_MAX_LENGTH) {
    console.warn('[auth] blocked unsafe session image value', { reason: 'oversized' });
    return null;
  }

  if (lowerValue.startsWith('data:image/')) {
    const v = cacheBuster ?? Date.now();
    return `${AVATAR_ROUTE}?v=${v}`;
  }

  if (value.startsWith(AVATAR_ROUTE)) {
    if (cacheBuster == null) return value;
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}v=${cacheBuster}`;
  }

  if (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/..') &&
    !value.includes('/../') &&
    !value.includes('\\') &&
    !lowerValue.includes('%2e%2e') &&
    !lowerValue.includes('%2f') &&
    !lowerValue.includes('%5c')
  ) {
    return value;
  }

  if (lowerValue.startsWith('http://') || lowerValue.startsWith('https://')) {
    try {
      new URL(value);
      return value;
    } catch {
      console.warn('[auth] blocked unsafe session image value', { reason: 'malformed-url' });
      return null;
    }
  }

  const scheme = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1]?.toLowerCase() ?? null;
  console.warn('[auth] blocked unsafe session image value', { reason: scheme ? `protocol:${scheme}` : 'unsupported' });
  return null;
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
        token.image = toSessionImage((user as any).image);
        console.info('[auth] jwt callback attached user', {
          hasUser: true,
          trigger: trigger ?? 'signIn',
        });
      }
      // On session update (e.g. after avatar upload) re-fetch image from DB.
      if (trigger === 'update') {
        if (!token.id) {
          console.warn('[auth] jwt update skipped due to missing token id');
          return token;
        }
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { image: true, name: true },
          });
          if (dbUser) {
            token.image = toSessionImage(dbUser.image, Date.now());
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
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as any;
        session.user.stripeAccountId = token.stripeAccountId as any;
        session.user.stripeOnboardingComplete = Boolean(token.stripeOnboardingComplete);
        session.user.image = (token.image as string | null) ?? null;
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
