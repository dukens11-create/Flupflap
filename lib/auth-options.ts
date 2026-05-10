import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import { verifyOtp } from './otp';
import { isSmsOtpEnabled, SELLER_OTP_FORCE_DISABLED } from './feature-flags';
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
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase() } });
        if (!user) return null;
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
      }
      // On session update re-fetch lightweight account fields from DB.
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
        session.user.id = token.id as string;
        session.user.role = token.role as any;
        session.user.stripeAccountId = token.stripeAccountId as any;
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
