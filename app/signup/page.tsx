"use client";
import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { resolveRoleLoginDestination } from '@/lib/role-experience';
import * as Sentry from '@sentry/nextjs';
import { ConfirmationResult, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/client';
import { normalizePhone } from '@/lib/phone';

const OTP_CODE_LENGTH = 6;
const OTP_CODE_PATTERN = new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`);
const MASKED_PHONE_PLACEHOLDER = '********';

function maskPhone(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '');
  const lastTwo = digits.slice(-2);
  return lastTwo ? `${MASKED_PHONE_PLACEHOLDER}${lastTwo}` : MASKED_PHONE_PLACEHOLDER;
}

function mapFirebasePhoneError(code?: string) {
  if (code === 'auth/invalid-verification-code') return 'Invalid code. Please try again.';
  if (code === 'auth/code-expired') return 'Code expired. Please request a new code.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait and try again.';
  if (code === 'auth/invalid-phone-number') return 'Please enter a valid phone number with country code.';
  return 'Unable to verify phone number right now. Please try again.';
}

export default function SignupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [role, setRole] = useState('CUSTOMER');
  const [showPassword, setShowPassword] = useState(false);
  const [sellerPhone, setSellerPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpStep, setOtpStep] = useState<'idle' | 'otp_sent' | 'verified'>('idle');
  const [phoneVerificationError, setPhoneVerificationError] = useState('');
  const [phoneVerificationSuccess, setPhoneVerificationSuccess] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [phoneVerificationIdToken, setPhoneVerificationIdToken] = useState('');
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => () => {
    recaptchaRef.current?.clear();
    recaptchaRef.current = null;
    signOut(firebaseAuth).catch(() => void 0);
  }, []);

  function resetSellerPhoneVerificationState() {
    setOtpStep('idle');
    setOtpCode('');
    setMaskedPhone('');
    setPhoneVerificationIdToken('');
    setPhoneVerificationError('');
    setPhoneVerificationSuccess('');
    confirmationRef.current = null;
  }

  function ensureRecaptcha() {
    if (typeof window === 'undefined') return null;
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, 'seller-signup-recaptcha', {
        size: 'invisible',
      });
    }
    return recaptchaRef.current;
  }

  async function sendSellerPhoneOtp() {
    if (otpLoading) return;
    setPhoneVerificationError('');
    setPhoneVerificationSuccess('');
    const normalized = normalizePhone(sellerPhone.trim());
    if (!normalized) {
      setPhoneVerificationError('Please enter a valid phone number with country code (for example, +1).');
      return;
    }

    const recaptcha = ensureRecaptcha();
    if (!recaptcha) {
      setPhoneVerificationError('Phone verification is unavailable in this browser session.');
      return;
    }

    setOtpLoading(true);
    try {
      const result = await signInWithPhoneNumber(firebaseAuth, normalized, recaptcha);
      confirmationRef.current = result;
      setSellerPhone(normalized);
      setMaskedPhone(maskPhone(normalized));
      setOtpStep('otp_sent');
      setPhoneVerificationSuccess('Verification code sent. Enter the 6-digit code to continue.');
    } catch (err: any) {
      setPhoneVerificationError(`Failed to send verification code. ${mapFirebasePhoneError(err?.code)}`);
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setOtpLoading(false);
    }
  }

  async function verifySellerPhoneOtp() {
    if (otpLoading) return;
    setPhoneVerificationError('');
    setPhoneVerificationSuccess('');
    if (!confirmationRef.current) {
      setPhoneVerificationError('Please request a new verification code.');
      return;
    }
    const code = otpCode.trim();
    if (!OTP_CODE_PATTERN.test(code)) {
      setPhoneVerificationError('Enter the 6-digit code sent to your phone.');
      return;
    }

    setOtpLoading(true);
    try {
      const credential = await confirmationRef.current.confirm(code);
      const idToken = await credential.user.getIdToken(true);
      const verifiedPhone = credential.user.phoneNumber;
      if (!verifiedPhone) {
        setPhoneVerificationError('Phone verification failed. Please try again.');
        return;
      }
      setSellerPhone(verifiedPhone);
      setPhoneVerificationIdToken(idToken);
      setOtpStep('verified');
      setPhoneVerificationSuccess(`Phone verified (${maskPhone(verifiedPhone)}).`);
      await signOut(firebaseAuth).catch(() => null);
    } catch (err: any) {
      setPhoneVerificationError(mapFirebasePhoneError(err?.code));
    } finally {
      setOtpLoading(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (role === 'SELLER' && !phoneVerificationIdToken) {
      setError('Please verify your phone number before creating a seller account.');
      return;
    }
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      role: String(form.get('role') ?? 'CUSTOMER'),
      phone: role === 'SELLER' ? sellerPhone : undefined,
      phoneVerificationIdToken: role === 'SELLER' ? phoneVerificationIdToken : undefined,
    };

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errorData: { error?: string } = {};
        try {
          errorData = await res.json();
        } catch (parseErr) {
          console.warn('[signup] Unable to parse signup error response', parseErr);
          Sentry.captureException(parseErr, {
            tags: { area: 'auth', action: 'signup_error_response_parse' },
            extra: { status: res.status, role: payload.role },
          });
        }
        setError(errorData.error || t('signup.signupFailed'));
        setLoading(false);
        return;
      }

      const signInResult = await signIn('credentials', {
        email: payload.email,
        password: payload.password,
        redirect: false,
      });

      if (signInResult?.error) {
        setError(t('login.invalidCredentials'));
        setLoading(false);
        return;
      }

      setRedirecting(true);
      router.push(resolveRoleLoginDestination(payload.role, callbackUrl));
      router.refresh();
    } catch {
      setError(t('signup.signupFailed'));
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
    <main className="mx-auto max-w-md px-4 py-10">
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
            type={showPassword ? 'text' : 'password'}
            className="input"
            placeholder={t('signup.passwordPlaceholder')}
            required
            minLength={8}
          />
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            />
            {showPassword ? 'Hide password' : 'Show password'}
          </label>
        </div>
        <div>
          <label className="label">{t('signup.accountType')}</label>
          <select
            name="role"
            className="input"
            value={role}
            onChange={(e) => {
              const nextRole = e.target.value;
              setRole(nextRole);
              if (nextRole !== 'SELLER') {
                resetSellerPhoneVerificationState();
                setSellerPhone('');
              }
            }}
          >
            <option value="CUSTOMER">{t('signup.customerOption')}</option>
            <option value="SELLER">{t('signup.sellerOption')}</option>
          </select>
        </div>
        {role === 'SELLER' && (
          <div className="space-y-2">
            <label className="label">{t('signup.mobilePhone')}</label>
            <input
              name="phone"
              type="text"
              inputMode="tel"
              autoComplete="tel"
              className="input"
              placeholder="+1 555 000 1234"
              required
              value={sellerPhone}
              onChange={(e) => {
                setSellerPhone(e.target.value);
                resetSellerPhoneVerificationState();
              }}
            />
            <p className="text-xs text-slate-500 mt-1">
              {t('signup.phoneHelp')}
            </p>
            <div id="seller-signup-recaptcha" />
            {otpStep !== 'verified' && (
              <button
                type="button"
                className="btn-outline w-full sm:w-auto text-sm"
                onClick={sendSellerPhoneOtp}
                disabled={otpLoading}
              >
                {otpLoading ? 'Sending code…' : otpStep === 'otp_sent' ? 'Resend code' : 'Send verification code'}
              </button>
            )}
            {otpStep === 'otp_sent' && (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-600">
                  Enter the code sent to {maskedPhone || sellerPhone}.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="input"
                  placeholder="123456"
                  aria-label="One-time verification code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
                />
                <button
                  type="button"
                  className="btn-primary w-full sm:w-auto text-sm"
                  onClick={verifySellerPhoneOtp}
                  disabled={otpLoading}
                >
                  {otpLoading ? 'Verifying…' : 'Verify code'}
                </button>
              </div>
            )}
            {phoneVerificationError && <p className="text-red-600 text-xs">{phoneVerificationError}</p>}
            {phoneVerificationSuccess && (
              <p className={otpStep === 'verified' ? 'text-green-600 text-xs' : 'text-slate-600 text-xs'}>
                {phoneVerificationSuccess}
              </p>
            )}
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={loading || (role === 'SELLER' && !phoneVerificationIdToken)}>
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
