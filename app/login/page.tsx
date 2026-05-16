"use client";
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { useI18n } from '@/components/I18nProvider';
import { resolveRoleLoginDestination } from '@/lib/role-experience';
import { getFirebaseClientAuth } from '@/lib/firebase/client';
import { normalizePhone } from '@/lib/phone';

const OTP_CODE_LENGTH = 6;

function getFirebaseErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const message = 'message' in error ? error.message : undefined;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
    const code = 'code' in error ? error.code : undefined;
    if (typeof code === 'string' && code.trim()) {
      return code.trim();
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'Phone verification failed. Please try again.';
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `***-***-${digits.slice(-4)}`;
}

function formatOtpValue(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
}

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [hidePassword, setHidePassword] = useState(true);

  // Multi-step seller flow: credentials → (add_phone?) → otp
  const [step, setStep] = useState<'credentials' | 'add_phone' | 'otp'>('credentials');
  const [maskedPhone, setMaskedPhone] = useState('');
  // Hold credentials for later steps
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, []);

  async function redirectByRole() {
    setRedirecting(true);
    let role: string | null = null;
    try {
      const sessionRes = await fetch('/api/auth/session');
      if (sessionRes.ok) {
        const data = await sessionRes.json();
        role = data?.user?.role ?? null;
      }
    } catch {
      // ignore and fallback to callback/default route
    }
    router.push(resolveRoleLoginDestination(role, callbackUrl));
    router.refresh();
  }

  function getOrCreateRecaptchaVerifier() {
    const auth = getFirebaseClientAuth();
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        badge: 'bottomleft',
      });
    }
    return { auth, verifier: recaptchaRef.current };
  }

  async function sendPhoneOtp(phoneNumber: string, phoneMask = maskPhone(phoneNumber)) {
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      setError('Invalid phone number. Please include your country code (e.g. +1 for US/Canada).');
      return false;
    }

    setPendingPhone(normalizedPhone);
    setMaskedPhone(phoneMask);
    setStep('otp');
    setOtpCode('');
    setError('');
    setLoading(true);

    try {
      const { auth, verifier } = getOrCreateRecaptchaVerifier();
      confirmationResultRef.current = await signInWithPhoneNumber(auth, normalizedPhone, verifier);
      return true;
    } catch (err) {
      confirmationResultRef.current = null;
      setError(getFirebaseErrorMessage(err));
      return false;
    } finally {
      setLoading(false);
    }
  }

  /** Step 1 — validate credentials; send Firebase OTP to sellers. */
  async function submitCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get('email') as string;
    const password = form.get('password') as string;

    let res: Response;
    let data: { step?: string; phone?: string; maskedPhone?: string; error?: string };
    try {
      res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      data = await res.json();
    } catch (err) {
      console.error('[login] network error during credential check', err);
      setLoading(false);
      setError(t('login.invalidCredentials'));
      return;
    }

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? t('login.invalidCredentials'));
      return;
    }

    if (data.step === 'otp') {
      setPendingEmail(email);
      setPendingPassword(password);
      if (data.phone) {
        await sendPhoneOtp(data.phone, data.maskedPhone ?? maskPhone(data.phone));
      }
    } else if (data.step === 'add_phone') {
      setPendingEmail(email);
      setPendingPassword(password);
      setPendingPhone('');
      setStep('add_phone');
    } else {
      // Non-seller: sign in directly
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError(t('login.invalidCredentials'));
      } else {
        await redirectByRole();
      }
    }
  }

  /** Step 1b — seller has no phone; save phone and send Firebase OTP. */
  async function submitPhone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    let res: Response;
    let data: { step?: string; phone?: string; maskedPhone?: string; error?: string };
    try {
      res = await fetch('/api/auth/otp/setup-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, password: pendingPassword, phone: pendingPhone }),
      });
      data = await res.json();
    } catch (err) {
      console.error('[login] network error during phone setup', err);
      setLoading(false);
      setError(t('login.failedSavePhone'));
      return;
    }

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? t('login.failedSavePhone'));
      return;
    }

    if (data.step === 'otp' && data.phone) {
      await sendPhoneOtp(data.phone, data.maskedPhone ?? maskPhone(data.phone));
    }
  }

  function handleOtpChange(e: ChangeEvent<HTMLInputElement>) {
    setOtpCode(formatOtpValue(e.target.value));
  }

  function handleOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    setOtpCode(formatOtpValue(pasted));
  }

  function handleOtpKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const allowedNavigationKeys = new Set([
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Home',
      'End',
    ]);

    if (allowedNavigationKeys.has(e.key)) {
      return;
    }

    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  }

  /** Step 2 — submit OTP code; complete the seller sign-in. */
  async function submitOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    if (!confirmationResultRef.current) {
      setError('Please request a verification code first.');
      return;
    }
    setError('');
    setLoading(true);

    const normalizedOtp = formatOtpValue(otpCode);
    if (normalizedOtp.length !== OTP_CODE_LENGTH) {
      setLoading(false);
      setError(`Enter the ${OTP_CODE_LENGTH}-digit code sent to your phone.`);
      return;
    }

    try {
      const confirmation = await confirmationResultRef.current.confirm(normalizedOtp);
      const idToken = await confirmation.user.getIdToken(true);
      const verifiedPhone = confirmation.user.phoneNumber ?? pendingPhone;

      await getFirebaseClientAuth().signOut().catch((signOutError) => {
        console.error('[login] Firebase signOut failed after OTP confirmation', signOutError);
      });

      const result = await signIn('credentials', {
        email: pendingEmail,
        password: pendingPassword,
        phone: verifiedPhone,
        firebaseIdToken: idToken,
        redirect: false,
      });

      if (result?.error) {
        setError('Phone verification succeeded, but login could not be completed. Please request a new code and try again.');
      } else {
        await redirectByRole();
      }
    } catch (err) {
      setError(getFirebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  /** Allow the seller to request a fresh code. */
  async function resendOtp() {
    if (!pendingPhone) {
      setError('Please enter your phone number first.');
      return;
    }
    await sendPhoneOtp(pendingPhone, maskedPhone || maskPhone(pendingPhone));
  }

  function handleBackToCredentials() {
    setStep('credentials');
    setError('');
    setMaskedPhone('');
    setOtpCode('');
    confirmationResultRef.current = null;
  }

  let content: ReactNode;

  if (redirecting) {
    content = (
      <div className="card p-6 mt-6">
        <div className="flex items-center gap-3 text-slate-700">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm font-medium">{t('login.signingIn')}</p>
        </div>
      </div>
    );
  } else if (step === 'add_phone') {
    content = (
      <form onSubmit={submitPhone} className="card p-6 mt-6 space-y-4">
        <p className="text-sm text-slate-600">
          {t('login.addPhoneIntro')}
        </p>
        <div>
          <label className="label">{t('login.phoneNumber')}</label>
          <input
            name="phone"
            type="tel"
            className="input"
            placeholder="+1 555 000 1234"
            value={pendingPhone}
            onChange={(e) => setPendingPhone(e.target.value)}
            required
          />
          <p className="text-xs text-slate-400 mt-1">
            {t('login.phoneHint')}
          </p>
        </div>
        {error && <p className="text-red-600 text-sm break-words">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? t('login.sendingCode') : t('login.sendVerificationCode')}
        </button>
        <div className="text-right">
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-blue-600"
            onClick={handleBackToCredentials}
          >
            {t('login.back')}
          </button>
        </div>
      </form>
    );
  } else if (step === 'otp') {
    content = (
      <form onSubmit={submitOtp} className="card p-6 mt-6 space-y-4">
        <p className="text-sm text-slate-600">
          {t('login.otpIntro', { phone: maskedPhone || '***' })}
        </p>
        <div>
          <label className="label">{t('login.verificationCode')}</label>
          <input
            name="otp"
            type="password"
            inputMode="numeric"
            enterKeyHint="done"
            pattern="[0-9]{6}"
            maxLength={OTP_CODE_LENGTH}
            className="input text-center text-xl [letter-spacing:0.6em]"
            placeholder="••••••"
            autoComplete="one-time-code"
            value={otpCode}
            onChange={handleOtpChange}
            onPaste={handleOtpPaste}
            onKeyDown={handleOtpKeyDown}
            required
          />
        </div>
        {error && <p className="text-red-600 text-sm break-words">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? t('login.verifying') : t('login.verifyAndSignIn')}
        </button>
        <div className="flex justify-between text-sm text-slate-500">
          <button
            type="button"
            className="hover:text-blue-600"
            onClick={resendOtp}
            disabled={loading}
          >
            {t('login.resendCode')}
          </button>
          <button
            type="button"
            className="hover:text-blue-600"
            onClick={handleBackToCredentials}
          >
            {t('login.back')}
          </button>
        </div>
      </form>
    );
  } else {
    content = (
      <form onSubmit={submitCredentials} className="card p-6 mt-6 space-y-4">
        <div>
          <label className="label">{t('login.email')}</label>
          <input name="email" type="email" className="input" placeholder="you@example.com" required />
        </div>
        <div>
          <label className="label">{t('login.password')}</label>
          <input
            name="password"
            type={hidePassword ? 'password' : 'text'}
            className="input"
            placeholder={t('login.password')}
            required
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
        {error && <p className="text-red-600 text-sm break-words">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? t('login.signingIn') : t('login.signIn')}
        </button>
        <div className="text-center">
          <Link href="/forgot-password" className="text-sm text-slate-500 hover:text-blue-600">
            {t('login.forgotPassword')}
          </Link>
        </div>
      </form>
    );
  }

  return (
    <>
      {content}
      <div id="recaptcha-container" role="presentation" aria-label="reCAPTCHA" />
    </>
  );
}

function SignupPrompt() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const signupHref = callbackUrl ? `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/signup';

  return (
    <p className="text-center text-sm text-slate-500 mt-4">
      {t('login.noAccount')}{' '}
      <Link href={signupHref} className="text-blue-600 hover:underline">{t('login.signUp')}</Link>
    </p>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-md px-4 py-10 pb-28 sm:pb-10">
      <h1 className="text-3xl font-black">{t('login.title')}</h1>
      <Suspense fallback={<div className="card p-6 mt-6 h-48 animate-pulse bg-slate-100 rounded-2xl" />}>
        <LoginForm />
      </Suspense>
      <Suspense fallback={null}>
        <SignupPrompt />
      </Suspense>
    </main>
  );
}
