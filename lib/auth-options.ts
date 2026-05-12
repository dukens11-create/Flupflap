import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import { verifyOtp } from './otp';
import { isSmsOtpEnabled, SELLER_OTP_FORCE_DISABLED } from './feature-flags';
import { recordLoginActivity } from './login-security';
import { safeComparePassword } from './password';
import type { NextAuthOptions } from 'next-auth';
import type { Role } from '@prisma/client';
import { getSiteUrl } from './seo';

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
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
        otp:      { label: 'Code',     type: 'text' },
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

        // Sellers must supply a valid one-time code (when SMS OTP is enabled).
        if (user.role === 'SELLER') {
          if (SELLER_OTP_FORCE_DISABLED || !isSmsOtpEnabled()) {
            console.warn('[auth] Seller OTP forcibly bypassed: pending Twilio A2P 10DLC approval', {
              userId: user.id,
              role: user.role,
              reason: SELLER_OTP_FORCE_DISABLED
                ? 'SELLER_OTP_FORCE_DISABLED=true (pending Twilio A2P 10DLC approval)'
                : 'feature flag ENABLE_SMS_OTP=false',
            });
          } else {
            if (!credentials.otp) return null;
            const result = await verifyOtp(user.id, credentials.otp);
            if (!result.ok) return null;
            // Mark phone as verified on first successful OTP sign-in.
            if (user.phone && !user.phoneVerified) {
              await prisma.user.update({
                where: { id: user.id },
                data: { phoneVerified: true, phoneVerifiedAt: new Date() },
              }).catch(() => null);
            }
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
      // On session update refetch lightweight account fields from DB.
      if (trigger === 'update') {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
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
        session.user.id = token.id as string;
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
