"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      setError((await res.json()).error || 'Signup failed');
      setLoading(false);
      return;
    }

    await signIn('credentials', {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });

    router.push(payload.role === 'SELLER' ? '/seller' : '/');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">Create account</h1>
      <form onSubmit={submit} className="card p-6 mt-6 space-y-4">
        <div>
          <label className="label">Full name</label>
          <input name="name" className="input" placeholder="Jane Smith" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" placeholder="you@example.com" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" className="input" placeholder="Minimum 8 characters" required minLength={8} />
        </div>
        <div>
          <label className="label">Account type</label>
          <select name="role" className="input">
            <option value="CUSTOMER">Customer – I want to buy</option>
            <option value="SELLER">Seller – I want to sell</option>
          </select>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-4">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
      </p>
    </main>
  );
}
