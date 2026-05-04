"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await signIn('credentials', {
      email: form.get('email') as string,
      password: form.get('password') as string,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError('Invalid email or password.');
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">Sign in</h1>
      <form onSubmit={submit} className="card p-6 mt-6 space-y-4">
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" placeholder="you@example.com" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" className="input" placeholder="Password" required />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-4">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-blue-600 hover:underline">Sign up</Link>
      </p>
    </main>
  );
}
