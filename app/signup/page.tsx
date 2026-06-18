"use client";
import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { resolveRoleLoginDestination } from '@/lib/role-experience';
import * as Sentry from '@sentry/nextjs';
import type { ConfirmationResult } from 'firebase/auth';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { getFirebaseClientAuth } from '@/lib/firebase/client';
import { normalizePhone } from '@/lib/phone';
import { trackConversionEvent } from '@/lib/conversion-tracking';

export default function SignupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const [error, setError] = useState('');
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [role, setRole] = useState('CUSTOMER');
  const [hidePassword, setHidePassword] = useState(true);
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState('');
  const [phoneVerifiedNumber, setPhoneVerifiedNumber] = useState('');
  const [phoneVerificationToken, setPhoneVerificationToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, []);

  function mapFirebasePhoneAuthError(code?: string) {
    if (code === 'auth/missing-phone-number') {
      return 'Please enter your phone number before requesting a code.';
    }
    if (code === 'auth/invalid-verification-code') {
      return 'Invalid OTP code. Please check the code and try again.';
    }
    if (code === 'auth/code-expired') {
      return 'This OTP has expired. Please request a new code.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many attempts. Please wait a moment before trying again.';
    }
    if (code === 'auth/invalid-phone-number') {
      return 'Invalid phone number. Please include your country code (e.g. +1).';
    }
    if (code === 'auth/quota-exceeded') {
      return 'SMS quota exceeded right now. Please try again later.';
    }
    if (code === 'auth/captcha-check-failed' || code === 'auth/invalid-app-credential') {
      return 'Security check failed. Please refresh and try again.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Phone sign-in is not enabled for this app. Please contact support.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not authorized for phone sign-in. Please contact support.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network error. Please check your connection and try again.';
    }
    return 'Phone verification failed. Please try again.';
  }

  async function sendSellerOtp() {
    if (phoneOtpLoading) return;
    setPhoneOtpError('');
    setPhoneOtpLoading(true);
    try {
      const normalizedPhoneForFirebase = normalizePhone(phone);
      if (!normalizedPhoneForFirebase) {
        setPhoneOtpError('Invalid phone number. Please include your country code (e.g. +1 for US/Canada).');
        setPhoneOtpLoading(false);
        return;
      }
      const auth = getFirebaseClientAuth();
      if (!recaptchaRef.current) {
        // Recreate verifier when absent (initial load or after a previous auth error clear).
        recaptchaRef.current = new RecaptchaVerifier(auth, 'seller-signup-recaptcha', {
          size: 'invisible',
          badge: 'bottomleft',
        });
      }
      const confirmation = await signInWithPhoneNumber(auth, normalizedPhoneForFirebase, recaptchaRef.current);
      confirmationResultRef.current = confirmation;
      setOtpSent(true);
    } catch (err: any) {
      if (!err?.code) {
        setPhoneOtpError('Phone verification is unavailable right now. Please check your connection and try again.');
      } else {
        setPhoneOtpError(mapFirebasePhoneAuthError(err?.code));
      }
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setPhoneOtpLoading(false);
    }
  }

  async function verifySellerOtp() {
    if (phoneOtpLoading) return;
    if (!confirmationResultRef.current) {
      setPhoneOtpError('Please request an OTP first.');
      return;
    }
    setPhoneOtpError('');
    setPhoneOtpLoading(true);
    try {
      const confirmation = await confirmationResultRef.current.confirm(otpCode.trim());
      const idToken = await confirmation.user.getIdToken(true);
      const verifiedPhone = confirmation.user.phoneNumber ?? '';
      if (!verifiedPhone) {
        setPhoneOtpError('Unable to verify phone number. Please try again.');
        setPhoneOtpLoading(false);
        return;
      }
      setPhoneVerifiedNumber(verifiedPhone);
      setPhoneVerificationToken(idToken);
      setOtpSent(false);
      setOtpCode('');
      await getFirebaseClientAuth().signOut().catch((signOutError) => {
        Sentry.captureException(signOutError, {
          tags: { area: 'auth', action: 'firebase_signout_after_phone_verify' },
          extra: {
            message: signOutError?.message ?? null,
            code: signOutError?.code ?? null,
          },
        });
      });
    } catch (err: any) {
      setPhoneOtpError(mapFirebasePhoneAuthError(err?.code));
    } finally {
      setPhoneOtpLoading(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setRequiresSignIn(false);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      role: String(form.get('role') ?? 'CUSTOMER'),
      phone: role === 'SELLER' ? phoneVerifiedNumber : undefined,
      firebaseIdToken: role === 'SELLER' ? phoneVerificationToken : undefined,
    };

    if (payload.role === 'SELLER' && (!payload.phone || !payload.firebaseIdToken)) {
      setError('Please verify your phone number before creating a seller account.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errorData: { error?: string; requiresSignIn?: boolean } = {};
        try {
          errorData = await res.json();
        } catch (parseErr) {
          console.warn('[signup] Unable to parse signup error response', parseErr);
          Sentry.captureException(parseErr, {
            tags: { area: 'auth', action: 'signup_error_response_parse' },
            extra: { status: res.status, role: payload.role },
          });
        }
        setRequiresSignIn(Boolean(errorData.requiresSignIn));
        setError(errorData.error || t('signup.signupFailed'));
        setLoading(false);
        return;
      }

      const signInResult = await signIn('credentials', {
        email: payload.email,
        password: payload.password,
        ...(payload.role === 'SELLER'
          ? {
            phone: payload.phone,
            firebaseIdToken: payload.firebaseIdToken,
          }
          : {}),
        redirect: false,
      });

      if (signInResult?.error) {
        if (payload.role === 'SELLER') {
          setRequiresSignIn(true);
          setError(t('signup.sellerSignInRequired'));
        } else {
          setError(t('login.invalidCredentials'));
        }
        setLoading(false);
        return;
      }

      trackConversionEvent('signup_complete', { role: payload.role.toLowerCase() });
      if (payload.role === 'SELLER') {
        trackConversionEvent('seller_registration_complete', { role: 'seller' });
      }

      setRedirecting(true);
      router.push(resolveRoleLoginDestination(payload.role, callbackUrl));
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error && err.message.trim()
        ? err.message
        : t('signup.signupFailed');
      setError(message);
      setLoading(false);
    }
  }

  if (redirecting) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-3xl font-black">{t('signup.title')}</h1>
        <div className="card p-6 mt-6">
          <div className="flex items-center gap-3 text-slate-700">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            <p className="text-sm font-medium">{t('signup.creatingAccount')}</p>
          </div>
        </div>
      </main>
    );
  }

  const loginHref = callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login';

  return (
    <main className="mx-auto max-w-md px-4 py-10 pb-28 sm:pb-10">
      <h1 className="text-3xl font-black">{t('signup.title')}</h1>
      <form onSubmit={submit} className="card p-6 mt-6 space-y-4">
        <div>
          <label className="label">{t('signup.fullName')}</label>
          <input name="name" className="input" placeholder="Jane Smith" required />
        </div>
        <div>
          <label className="label">{t('login.email')}</label>
          <input name="email" type="email" className="input" placeholder="you@example.com" required />
        </div>
        <div>
          <label className="label">{t('signup.password')}</label>
          <input
            name="password"
            type={hidePassword ? 'password' : 'text'}
            className="input"
            placeholder={t('signup.passwordPlaceholder')}
            required
            minLength={8}
          />
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={hidePassword}
              onChange={(e) => setHidePassword(e.target.checked)}
              aria-label="Hide password"
            />
            Hide password
          </label>
        </div>
        <div>
          <label className="label">{t('signup.accountType')}</label>
          <select name="role" className="input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="CUSTOMER">{t('signup.customerOption')}</option>
            <option value="SELLER">{t('signup.sellerOption')}</option>
          </select>
        </div>
        {role === 'SELLER' && (
          <div className="space-y-3">
            <label className="label">{t('signup.mobilePhone')}</label>
            <input
              type="text"
              inputMode="tel"
              autoComplete="tel"
              className="input"
              placeholder="+1 555 000 1234"
              required
              value={phone}
              onChange={(e) => {
                const nextPhone = e.target.value;
                setPhone(nextPhone);
                if (phoneVerifiedNumber && nextPhone !== phoneVerifiedNumber) {
                  setPhoneVerifiedNumber('');
                  setPhoneVerificationToken('');
                }
              }}
              disabled={!!phoneVerifiedNumber}
            />
            <div id="seller-signup-recaptcha" role="presentation" aria-label="reCAPTCHA" />
            {phoneVerifiedNumber ? (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                Phone verified: {phoneVerifiedNumber}
              </p>
            ) : (
              <div className="space-y-2">
                {otpSent && (
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="input"
                    placeholder="Enter 6-digit OTP"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    maxLength={6}
                  />
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="btn-outline text-sm"
                    disabled={phoneOtpLoading || !phone.trim()}
                    onClick={sendSellerOtp}
                  >
                    {phoneOtpLoading ? 'Sending...' : otpSent ? 'Resend Code' : 'Send Code'}
                  </button>
                  {otpSent && (
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={phoneOtpLoading || otpCode.trim().length !== 6}
                      onClick={verifySellerOtp}
                    >
                      {phoneOtpLoading ? 'Verifying...' : 'Verify Code'}
                    </button>
                  )}
                </div>
              </div>
            )}
            {phoneOtpError && <p className="text-xs text-red-600">{phoneOtpError}</p>}
            <p className="text-xs text-slate-500 mt-1">
              {t('signup.phoneHelp')}
            </p>
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {requiresSignIn && (
          <p className="text-xs text-slate-600">
            Use your existing account on the{' '}
            <Link href={loginHref} className="text-blue-600 hover:underline">
              sign-in page
            </Link>
            .
          </p>
        )}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? t('signup.creatingAccount') : t('signup.createAccount')}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-4">
        {t('signup.alreadyHave')}{' '}
        <Link href={loginHref} className="text-blue-600 hover:underline">{t('signup.signIn')}</Link>
      </p>
    </main>
  );
}
