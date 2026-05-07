"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';

export default function SignupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('CUSTOMER');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setError((await res.json()).error || t('signup.signupFailed'));
      setLoading(false);
      return;
    }

    await signIn('credentials', {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });

    router.push(payload.role === 'SELLER' ? '/seller' : '/');
  }

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
          <input name="password" type="password" className="input" placeholder={t('signup.passwordPlaceholder')} required minLength={8} />
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
              type="tel"
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
        <Link href="/login" className="text-blue-600 hover:underline">{t('signup.signIn')}</Link>
      </p>
    </main>
  );
}
