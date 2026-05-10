"use client";
import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/components/I18nProvider';

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Multi-step seller flow: credentials → (add_phone?) → otp
  const [step, setStep] = useState<'credentials' | 'add_phone' | 'otp'>('credentials');
  const [maskedPhone, setMaskedPhone] = useState('');
  // Hold credentials for later steps
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');

  /** Step 1 — validate credentials; send OTP to sellers. */
  async function submitCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get('email') as string;
    const password = form.get('password') as string;

    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? t('login.invalidCredentials'));
      return;
    }

    if (data.step === 'otp') {
      // Seller: show OTP form
      setPendingEmail(email);
      setPendingPassword(password);
      setMaskedPhone(data.maskedPhone ?? '');
      setStep('otp');
    } else if (data.step === 'add_phone') {
      // Seller without phone: show phone capture form
      setPendingEmail(email);
      setPendingPassword(password);
      setStep('add_phone');
    } else {
      // Buyer, or seller when OTP is not active in the current sign-in flow:
      // sign in directly with email + password.
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        // Log safe diagnostic fields (no passwords/tokens) so devtools/production logs
        // can distinguish credential rejection from server-side failures.
        console.error('[login] signIn error', { ok: result.ok, status: result.status, error: result.error });
        setError(result.status !== 401 ? t('login.signInServerError') : t('login.invalidCredentials'));
      } else if (!result?.ok) {
        console.error('[login] signIn returned no error but ok is false', { ok: result?.ok, status: result?.status });
        setError(t('login.signInServerError'));
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    }
  }

  /** Step 1b — seller has no phone; save phone and send OTP. */
  async function submitPhone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const phone = form.get('phone') as string;

    const res = await fetch('/api/auth/otp/setup-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, password: pendingPassword, phone }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? t('login.failedSavePhone'));
      return;
    }

    if (data.step === 'signin') {
      if (!pendingEmail || !pendingPassword) {
        setError(t('login.missingLoginInfo'));
        setStep('credentials');
        return;
      }
      const result = await signIn('credentials', {
        email: pendingEmail,
        password: pendingPassword,
        redirect: false,
      });

      if (result?.error) {
        console.error('[login] signIn error (post-phone)', { ok: result.ok, status: result.status, error: result.error });
        setError(result.status !== 401 ? t('login.signInServerError') : t('login.invalidCredentials'));
      } else if (!result?.ok) {
        console.error('[login] signIn returned no error but ok is false (post-phone)', { ok: result?.ok, status: result?.status });
        setError(t('login.signInServerError'));
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
      return;
    }

    setMaskedPhone(data.maskedPhone ?? '');
    setStep('otp');
  }

  /** Step 2 — submit OTP code; complete the seller sign-in. */
  async function submitOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const otp = form.get('otp') as string;

    const result = await signIn('credentials', {
      email: pendingEmail,
      password: pendingPassword,
      otp,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      console.error('[login] signIn error (OTP)', { ok: result.ok, status: result.status, error: result.error });
      setError(result.status !== 401 ? t('login.signInServerError') : t('login.invalidCode'));
    } else if (!result?.ok) {
      console.error('[login] signIn returned no error but ok is false (OTP)', { ok: result?.ok, status: result?.status });
      setError(t('login.signInServerError'));
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  /** Allow the seller to request a fresh code. */
  async function resendOtp() {
    setError('');
    setLoading(true);
    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, password: pendingPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? t('login.failedResendCode'));
    } else {
      setError('');
    }
  }

  function handleBackToCredentials() {
    setStep('credentials');
    setError('');
  }

  if (step === 'add_phone') {
    return (
      <form onSubmit={submitPhone} className="card p-6 mt-6 space-y-4">
        <p className="text-sm text-slate-600">
          {t('login.addPhoneIntro')}
        </p>
        <div>
          <label className="label">{t('login.phoneNumber')}</label>
          <input
            name="phone"
            type="text"
            inputMode="tel"
            autoComplete="tel"
            className="input"
            placeholder="+1 555 000 1234"
            required
          />
          <p className="text-xs text-slate-400 mt-1">
            {t('login.phoneHint')}
          </p>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
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
  }

  if (step === 'otp') {
    return (
      <form onSubmit={submitOtp} className="card p-6 mt-6 space-y-4">
        <p className="text-sm text-slate-600">
          {t('login.otpIntro', { phone: maskedPhone || '***' })}
        </p>
        <div>
          <label className="label">{t('login.verificationCode')}</label>
          <input
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            className="input tracking-widest text-center text-xl"
            placeholder="123456"
            autoComplete="one-time-code"
            required
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
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
  }

  return (
    <form onSubmit={submitCredentials} className="card p-6 mt-6 space-y-4">
      <div>
        <label className="label">{t('login.email')}</label>
        <input name="email" type="email" className="input" placeholder="you@example.com" required />
      </div>
      <div>
        <label className="label">{t('login.password')}</label>
        <div className="relative">
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            className="input pr-10"
            placeholder={t('login.password')}
            required
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:rounded-r-xl"
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
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

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">{t('login.title')}</h1>
      <Suspense fallback={<div className="card p-6 mt-6 h-48 animate-pulse bg-slate-100 rounded-2xl" />}>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-slate-500 mt-4">
        {t('login.noAccount')}{' '}
        <Link href="/signup" className="text-blue-600 hover:underline">{t('login.signUp')}</Link>
      </p>
    </main>
  );
}
