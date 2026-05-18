import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import { recordLoginActivity } from './login-security';
import { safeComparePassword } from './password';
import type { NextAuthOptions } from 'next-auth';
import type { Role } from '@prisma/client';
import { getSiteUrl } from './seo';
import { verifyFirebasePhoneIdToken } from './firebase/server';
import { normalizePhone } from './phone';

type AuthSessionUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
};

function isAuthSessionUser(user: unknown): user is AuthSessionUser {
  if (!user || typeof user !== 'object') return false;
  const candidate = user as Partial<AuthSessionUser>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.role === 'string'
  );
}

/** Remove image fields that can bloat JWT/session payloads. */
function stripImageFields(target: unknown) {
  if (!target || typeof target !== 'object') return;
  Reflect.deleteProperty(target, 'image');
  Reflect.deleteProperty(target, 'picture');
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email:           { label: 'Email',              type: 'email' },
        password:        { label: 'Password',           type: 'password' },
        phone:           { label: 'Phone number',       type: 'text' },
        firebaseIdToken: { label: 'Firebase ID token',  type: 'text' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
            stripeAccountId: true,
            stripeOnboardingComplete: true,
            deletedAt: true,
            phone: true,
            phoneVerified: true,
          },
        });
        if (!user) return null;
        // Reject soft-deleted accounts before touching the password.
        if (user.deletedAt) return null;
        const ok = await safeComparePassword(credentials.password, user.password, 'authorize');
        if (!ok) return null;

        // Sellers must supply a Firebase phone-auth token that matches their phone.
        if (user.role === 'SELLER') {
          if (!credentials.firebaseIdToken) return null;
          try {
            const firebasePhone = await verifyFirebasePhoneIdToken(credentials.firebaseIdToken);
            const verifiedPhone = normalizePhone(firebasePhone?.phoneNumber ?? '');
            const submittedPhone = normalizePhone(credentials.phone ?? '');
            const expectedPhone = normalizePhone(user.phone ?? '') || submittedPhone;

            if (!verifiedPhone || !expectedPhone || verifiedPhone !== expectedPhone) {
              return null;
            }

            if (!user.phoneVerified || !user.phone || normalizePhone(user.phone) !== verifiedPhone) {
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  phone: verifiedPhone,
                  phoneVerified: true,
                  phoneVerifiedAt: new Date(),
                },
              }).catch(() => null);
            }
          } catch (error) {
            console.error('[auth] failed to verify firebase phone token', {
              userId: user.id,
              error,
            });
            return null;
          }
        }

        try {
          await recordLoginActivity(user.id, request);
        } catch (error) {
          console.error('[auth] failed to record login activity', error);
        }

        const sessionUser: AuthSessionUser = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          stripeAccountId: user.stripeAccountId,
          stripeOnboardingComplete: user.stripeOnboardingComplete,
        };
        return sessionUser;
      }
    })
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;

      try {
        const baseOrigin = new URL(baseUrl).origin;
        const siteOrigin = getSiteUrl().origin;
        const redirectUrl = new URL(url);
        if (redirectUrl.origin === baseOrigin || redirectUrl.origin === siteOrigin) {
          return redirectUrl.toString();
        }
      } catch {
        return baseUrl;
      }

      return baseUrl;
    },
    async jwt({ token, user, trigger }) {
      stripImageFields(token);
      if (user && isAuthSessionUser(user)) {
        stripImageFields(user);
        token.id = user.id;
        token.role = user.role;
        token.stripeAccountId = user.stripeAccountId;
        token.stripeOnboardingComplete = user.stripeOnboardingComplete;
      }
      if (typeof token.id !== 'string' && typeof token.sub === 'string') {
        token.id = token.sub;
      }
      // On session update refetch lightweight account fields from DB.
      if (trigger === 'update') {
        const tokenUserId = typeof token.id === 'string' ? token.id : (typeof token.sub === 'string' ? token.sub : null);
        if (!tokenUserId) return token;
        const dbUser = await prisma.user.findUnique({
          where: { id: tokenUserId },
          select: { name: true },
        });
        if (dbUser) {
          token.name = dbUser.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        stripImageFields(session.user);
        session.user.id = typeof token.id === 'string' ? token.id : (typeof token.sub === 'string' ? token.sub : '');
        session.user.role = token.role as Role;
        session.user.stripeAccountId = typeof token.stripeAccountId === 'string' ? token.stripeAccountId : null;
        session.user.stripeOnboardingComplete = Boolean(token.stripeOnboardingComplete);
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
