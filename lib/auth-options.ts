import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { verifyOtp } from './otp';
import { isSmsOtpEnabled } from './feature-flags';
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase() } });
        if (!user) return null;
        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return null;

        // Sellers must supply a valid one-time code (when SMS OTP is enabled).
        if (user.role === 'SELLER') {
          if (!isSmsOtpEnabled()) {
            console.warn('[auth] Seller OTP bypassed: feature flag disabled', {
              userId: user.id,
              role: user.role,
              enableSmsOtp: process.env.ENABLE_SMS_OTP ?? '(unset)',
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

        return user as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.stripeAccountId = (user as any).stripeAccountId;
        token.stripeOnboardingComplete = (user as any).stripeOnboardingComplete;
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
