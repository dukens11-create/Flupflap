"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { resolveRoleLoginDestination } from '@/lib/role-experience';

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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      role: String(form.get('role') ?? 'CUSTOMER'),
      phone: form.get('phone') ? String(form.get('phone')) : undefined,
    };

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setError((errorData as { error?: string }).error || t('signup.signupFailed'));
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
          <select name="role" className="input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="CUSTOMER">{t('signup.customerOption')}</option>
            <option value="SELLER">{t('signup.sellerOption')}</option>
          </select>
        </div>
        {role === 'SELLER' && (
          <div>
            <label className="label">{t('signup.mobilePhone')}</label>
            <input
              name="phone"
              type="text"
              inputMode="tel"
              autoComplete="tel"
              className="input"
              placeholder="+1 555 000 1234"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              {t('signup.phoneHelp')}
            </p>
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
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
