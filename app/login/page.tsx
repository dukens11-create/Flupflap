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

  async function submitCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get('email') as string;
    const password = form.get('password') as string;

    try {
      const result = await signIn('credentials', { email, password, redirect: false, callbackUrl });

      if (result?.error) {
        // Log safe diagnostic fields (no passwords/tokens) so devtools/production logs
        // can distinguish credential rejection from server-side failures.
        console.error('[login] signIn error', { ok: result.ok, status: result.status, error: result.error });
        setError(result.status !== 401 ? t('login.signInServerError') : t('login.invalidCredentials'));
      } else if (result?.url) {
        router.push(result.url);
        router.refresh();
      } else if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        console.error('[login] signIn returned unexpected result', { ok: result?.ok, status: result?.status, hasUrl: !!result?.url });
        setError(t('login.signInServerError'));
      }
    } catch (err) {
      console.error('[login] signIn threw unexpectedly', { message: err instanceof Error ? err.message : String(err) });
      setError(t('login.signInServerError'));
    } finally {
      setLoading(false);
    }
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
