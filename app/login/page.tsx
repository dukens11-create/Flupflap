"use client";
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/components/I18nProvider';

const NEXTAUTH_CREDENTIALS_ERROR = 'error=CredentialsSignin';

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
      // Step 1: Fetch the CSRF token required by NextAuth
      const csrfRes = await fetch('/api/auth/csrf');
      if (!csrfRes.ok) {
        console.error('[login] failed to fetch CSRF token', { status: csrfRes.status });
        setError(t('login.signInServerError'));
        return;
      }
      const { csrfToken } = await csrfRes.json() as { csrfToken?: string };
      if (!csrfToken) {
        console.error('[login] CSRF response missing csrfToken field');
        setError(t('login.signInServerError'));
        return;
      }

      // Step 2: POST form-encoded credentials to the NextAuth callback endpoint
      const callbackRes = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email, password, csrfToken, callbackUrl, json: 'true' }).toString(),
      });

      // Parse callback body once; NextAuth returns JSON {url} when json=true is sent
      let callbackData: { url?: string } = {};
      try {
        callbackData = await callbackRes.json() as { url?: string };
      } catch {
        // Non-JSON response (e.g. unexpected HTML): treat as server error
        console.error('[login] credentials callback returned non-JSON response', { status: callbackRes.status });
      }

      // Safe diagnostics — no passwords or tokens logged
      console.log('[login] credentials callback', { status: callbackRes.status, redirectUrl: callbackData.url });

      // Step 3: Confirm authentication by inspecting the session
      let session: { user?: unknown } = {};
      try {
        const sessionRes = await fetch('/api/auth/session');
        session = await sessionRes.json() as { user?: unknown };
      } catch {
        console.error('[login] failed to parse session response');
      }

      if (session?.user) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        // NextAuth encodes the failure reason in the redirect URL it would have used
        const isCredentialsError = (callbackData.url ?? '').includes(NEXTAUTH_CREDENTIALS_ERROR);
        console.error('[login] authentication failed', {
          callbackStatus: callbackRes.status,
          hasCredentialsError: isCredentialsError,
        });
        setError(isCredentialsError ? t('login.invalidCredentials') : t('login.signInServerError'));
      }
    } catch (err) {
      console.error('[login] login flow threw unexpectedly', { message: err instanceof Error ? err.message : String(err) });
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
