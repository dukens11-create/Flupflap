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
    const email = String(form.get('email') ?? '').trim();
    const password = form.get('password') as string;

    try {
      // Step 1: Fetch the CSRF token required by NextAuth
      const csrfRes = await fetch('/api/auth/csrf', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!csrfRes.ok) {
        console.error('[login] failed to fetch CSRF token', { status: csrfRes.status });
        setError(t('login.signInServerError'));
        return;
      }
      const csrfData = await csrfRes.json().catch((error) => {
        console.error('[login] failed to parse CSRF response', {
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      }) as { csrfToken?: string } | null;
      const csrfToken = csrfData?.csrfToken;
      if (!csrfToken) {
        console.error('[login] CSRF response missing csrfToken field');
        setError(t('login.signInServerError'));
        return;
      }

      // Step 2: POST form-encoded credentials to the NextAuth callback endpoint
      const callbackRes = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ email, password, csrfToken, callbackUrl, json: 'true' }).toString(),
        redirect: 'follow',
      });

      // Parse callback body once; NextAuth usually returns JSON, but production may return HTML/other payloads.
      const callbackText = await callbackRes.text();
      let callbackData: { url?: string; error?: string } = {};
      try {
        callbackData = callbackText ? JSON.parse(callbackText) as { url?: string; error?: string } : {};
      } catch {
        callbackData = {};
      }

      // Safe diagnostics — no passwords or tokens logged
      console.log('[login] credentials callback', {
        status: callbackRes.status,
        error: callbackData.error ?? null,
        redirectUrl: callbackData.url ?? null,
        responseContentType: callbackRes.headers.get('content-type'),
        responseBytes: callbackText.length,
      });

      // Step 3: Confirm authentication by inspecting the session
      let session: { user?: unknown } = {};
      try {
        const sessionRes = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        session = await sessionRes.json() as { user?: unknown };
      } catch {
        console.error('[login] failed to parse session response');
      }

      if (session?.user) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        // NextAuth encodes the failure reason in the redirect URL it would have used
        const callbackSnippet = callbackText.slice(0, 2048);
        const isCredentialsError =
          callbackData.error === 'CredentialsSignin'
          || callbackRes.status === 401
          || (callbackData.url ?? '').includes(NEXTAUTH_CREDENTIALS_ERROR)
          || callbackSnippet.includes(NEXTAUTH_CREDENTIALS_ERROR);
        console.error('[login] authentication failed', {
          callbackStatus: callbackRes.status,
          callbackError: callbackData.error ?? null,
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
