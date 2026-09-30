"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

type Sale = {
  id: string;
  recipientPhone: string;
  amountCents: number;
  commissionCents: number;
  currency: string;
  status: string;
  createdAt: string;
};

type Profile = {
  id: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  tier: string;
  countryCode: string;
  currency: string;
  businessName?: string | null;
  commissionBps: number;
  walletBalanceCents: number;
  lifetimeSalesCents: number;
  lifetimeCommissionCents: number;
  airtimeSales: Sale[];
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export default function AirtimeAgentPanel() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingSaleKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/airtime-agent/profile', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load agent profile');
    setProfile(data.profile);
  }, []);

  useEffect(() => { load().catch(err => setError(err.message)); }, [load]);

  async function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/airtime-agent/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        countryCode: form.get('countryCode'),
        currency: form.get('currency'),
        businessName: form.get('businessName'),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Application failed');
    setMessage('Airtime agent application saved. FlupFlap admin approval is required before live selling.');
    await load();
  }

  async function sell(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const form = new FormData(e.currentTarget);
    const amount = Number(form.get('amount'));
    const idempotencyKey = pendingSaleKeyRef.current ?? ('agent-' + crypto.randomUUID());
    pendingSaleKeyRef.current = idempotencyKey;
    const res = await fetch('/api/airtime-agent/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        operatorId: Number(form.get('operatorId')),
        amountCents: Math.round(amount * 100),
        recipientCountryCode: form.get('recipientCountryCode'),
        recipientPhone: form.get('recipientPhone'),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      pendingSaleKeyRef.current = null;
      return setError(data.error || 'Top-up failed');
    }
    const status = String(data.sale?.status ?? '').toUpperCase();
    if (status === 'SUCCESSFUL' || status === 'SUCCESS' || status === 'COMPLETED') {
      setMessage(data.duplicate ? 'This airtime sale was already completed.' : 'Airtime sent successfully.');
      e.currentTarget.reset();
      pendingSaleKeyRef.current = null;
    } else {
      setMessage('Airtime request accepted and is still processing. Do not submit it again.');
    }
    await load();
  }

  if (profile === undefined) return <div className="card p-6">Loading airtime agent account…</div>;

  if (!profile) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="text-2xl font-black">Become a FlupFlap Airtime Agent</h2>
          <p className="mt-2 text-sm text-slate-600">Sell airtime and data from your seller account. Your agent wallet and commissions stay separate from marketplace payouts.</p>
          <form onSubmit={apply} className="mt-5 space-y-4">
            <label className="block"><span className="label">Business or shop name</span><input name="businessName" className="input" maxLength={120} /></label>
            <label className="block"><span className="label">Country code</span><input name="countryCode" className="input uppercase" placeholder="HT" maxLength={2} required /></label>
            <label className="block"><span className="label">Wallet currency</span><input name="currency" className="input uppercase" placeholder="USD" maxLength={3} defaultValue="USD" required /></label>
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Submitting…' : 'Apply as Airtime Agent'}</button>
          </form>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          {message && <p className="mt-4 text-sm text-green-700">{message}</p>}
        </section>
        <section className="card p-6">
          <h3 className="font-bold">How it works</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Apply from your verified FlupFlap seller account.</li>
            <li>FlupFlap approves your airtime-agent profile.</li>
            <li>Fund your agent wallet.</li>
            <li>Sell airtime to customers and keep your configured commission.</li>
          </ol>
        </section>
      </div>
    );
  }

  const commissionPercent = (profile.commissionBps / 100).toFixed(2);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5"><p className="text-xs uppercase text-slate-500">Wallet</p><p className="text-2xl font-black">{money(profile.walletBalanceCents, profile.currency)}</p></div>
        <div className="card p-5"><p className="text-xs uppercase text-slate-500">Total sales</p><p className="text-2xl font-black">{money(profile.lifetimeSalesCents, profile.currency)}</p></div>
        <div className="card p-5"><p className="text-xs uppercase text-slate-500">Commission earned</p><p className="text-2xl font-black">{money(profile.lifetimeCommissionCents, profile.currency)}</p></div>
        <div className="card p-5"><p className="text-xs uppercase text-slate-500">Agent status</p><p className="text-xl font-black">{profile.status}</p><p className="text-xs text-slate-500">{profile.tier} · {commissionPercent}%</p></div>
      </div>

      {profile.status === 'ACTIVE' ? (
        <section className="card p-6">
          <h2 className="text-xl font-black">Sell airtime</h2>
          <p className="mt-1 text-sm text-slate-500">The sale is debited from your FlupFlap agent wallet. Failed provider transactions are automatically refunded to the wallet.</p>
          <form onSubmit={sell} className="mt-5 grid gap-4 md:grid-cols-2">
            <label><span className="label">Recipient country</span><input name="recipientCountryCode" className="input uppercase" placeholder="HT" maxLength={2} required /></label>
            <label><span className="label">Recipient phone</span><input name="recipientPhone" className="input" placeholder="+509..." required /></label>
            <label><span className="label">Operator ID</span><input name="operatorId" type="number" min="1" className="input" required /></label>
            <label><span className="label">Airtime amount ({profile.currency})</span><input name="amount" type="number" min="0.01" step="0.01" className="input" required /></label>
            <button className="btn-primary md:col-span-2" disabled={busy}>{busy ? 'Sending…' : 'Send Airtime'}</button>
          </form>
        </section>
      ) : (
        <section className="card p-6">
          <h2 className="font-black">Approval required</h2>
          <p className="mt-2 text-sm text-slate-600">Your application status is <strong>{profile.status}</strong>. Live selling remains locked until the profile is ACTIVE.</p>
        </section>
      )}

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{message}</p>}

      <section className="card overflow-hidden">
        <div className="border-b p-5"><h2 className="font-black">Recent airtime sales</h2></div>
        <div className="divide-y">
          {profile.airtimeSales?.length ? profile.airtimeSales.map((sale) => (
            <div key={sale.id} className="grid gap-1 p-4 text-sm sm:grid-cols-4">
              <span>{sale.recipientPhone}</span>
              <span>{money(sale.amountCents, sale.currency)}</span>
              <span>{sale.status}</span>
              <span className="text-slate-500">{new Date(sale.createdAt).toLocaleString()}</span>
            </div>
          )) : <p className="p-5 text-sm text-slate-500">No airtime sales yet.</p>}
        </div>
      </section>
    </div>
  );
}
