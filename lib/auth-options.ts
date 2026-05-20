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
import { normalizeUserRoles, hasUserRole } from './user-roles';

type AuthSessionUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  roles: Role[];
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

function getTokenUserId(token: { id?: unknown; sub?: unknown }) {
  if (typeof token.id === 'string' && token.id.length > 0) return token.id;
  if (typeof token.sub === 'string' && token.sub.length > 0) return token.sub;
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
            roles: true,
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

        // Normalize roles early so the OTP gate applies to any SELLER-role user.
        const normalizedRoles = normalizeUserRoles(user.roles, user.role);

        // Sellers must supply a Firebase phone-auth token that matches their phone.
        if (normalizedRoles.includes('SELLER')) {
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
          roles: normalizedRoles,
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
        token.roles = user.roles;
        token.stripeAccountId = user.stripeAccountId;
        token.stripeOnboardingComplete = user.stripeOnboardingComplete;
      }
      const normalizedTokenUserId = getTokenUserId(token);
      if (normalizedTokenUserId) {
        token.id = normalizedTokenUserId;
      }
      // On session update refetch lightweight account fields from DB.
      if (trigger === 'update') {
        const tokenUserId = getTokenUserId(token);
        if (!tokenUserId) {
          console.warn('[auth] missing token user id during jwt update callback', {
            trigger,
            hasId: typeof token.id === 'string',
            hasSub: typeof token.sub === 'string',
          });
          return token;
        }
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
        const tokenUserId = getTokenUserId(token);
        if (!tokenUserId) {
          console.warn('[auth] missing token user id during session callback', {
            hasId: typeof token.id === 'string',
            hasSub: typeof token.sub === 'string',
          });
          return session;
        }
        stripImageFields(session.user);
        session.user.id = tokenUserId;
        session.user.role = token.role as Role;
        // Derive roles from the JWT array; fall back to [role] for legacy tokens
        // that pre-date the multi-role feature.
        session.user.roles = Array.isArray(token.roles) && token.roles.length > 0
          ? token.roles as Role[]
          : normalizeUserRoles(null, token.role as Role);
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
  if (!user) return null;
  // Check both the multi-role array and the legacy single-role field.
  if (!roles.some(r => hasUserRole(user.roles, user.role, r as Role))) return null;
  return user;
}
