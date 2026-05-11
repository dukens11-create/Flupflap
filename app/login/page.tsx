"use client";
import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { resolveRoleLoginDestination } from '@/lib/role-experience';

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Multi-step seller flow: credentials → (add_phone?) → otp
  const [step, setStep] = useState<'credentials' | 'add_phone' | 'otp'>('credentials');
  const [maskedPhone, setMaskedPhone] = useState('');
  // Hold credentials for later steps
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');

  async function redirectByRole() {
    setRedirecting(true);
    setLoading(true);
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
    await new Promise((resolve) => setTimeout(resolve, 180));
    router.push(resolveRoleLoginDestination(role, callbackUrl));
    router.refresh();
  }

  /** Step 1 — validate credentials; send OTP to sellers. */
  async function submitCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get('email') as string;
    const password = form.get('password') as string;

    let res: Response;
    let data: { step?: string; maskedPhone?: string; error?: string };
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
      // Non-seller: sign in directly
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError(t('login.invalidCredentials'));
      } else {
        await redirectByRole();
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

    let res: Response;
    let data: { step?: string; maskedPhone?: string; error?: string };
    try {
      res = await fetch('/api/auth/otp/setup-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, password: pendingPassword, phone }),
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
        setError(t('login.invalidCredentials'));
      } else {
        await redirectByRole();
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
      setError(t('login.invalidCode'));
    } else {
      await redirectByRole();
    }
  }

  /** Allow the seller to request a fresh code. */
  async function resendOtp() {
    setError('');
    setLoading(true);
    let res: Response;
    let data: { error?: string };
    try {
      res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, password: pendingPassword }),
      });
      data = await res.json();
    } catch (err) {
      console.error('[login] network error during OTP resend', err);
      setLoading(false);
      setError(t('login.failedResendCode'));
      return;
    }
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

  if (redirecting) {
    return (
      <div className="card p-6 mt-6">
        <div className="flex items-center gap-3 text-slate-700">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm font-medium">{t('login.signingIn')}</p>
        </div>
      </div>
    );
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
            type="tel"
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
        <input
          name="password"
          type={showPassword ? 'text' : 'password'}
          className="input"
          placeholder={t('login.password')}
          required
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
    <main className="mx-auto max-w-md px-4 py-10">
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
