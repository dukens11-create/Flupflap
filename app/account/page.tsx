'use client';
import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ACCOUNT_DELETION_REASON_LABELS, type AccountDeletionReason } from '@/lib/account-deletion';
import { STRIPE_ERROR_REASONS } from '@/lib/stripe';

export default function AccountPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [stripeState, setStripeState] = useState<string | null>(null);
  const [stripeReason, setStripeReason] = useState<string | null>(null);
  const hasKnownStripeReason = stripeReason
    ? STRIPE_ERROR_REASONS.includes(stripeReason as (typeof STRIPE_ERROR_REASONS)[number])
    : false;

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');

  const [changingPassword, setChangingPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');

  // Phone management
  const [phoneStep, setPhoneStep] = useState<'idle' | 'enter_phone' | 'enter_code'>('idle');
  const [phoneInput, setPhoneInput] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState('');
  const [dbPhone, setDbPhone] = useState<string | null>(null);
  const [dbPhoneVerified, setDbPhoneVerified] = useState(false);

  // Stripe status — fetched fresh from the DB so it reflects the latest
  // onboarding state even if the JWT session hasn't been refreshed yet.
  const [stripeStatus, setStripeStatus] = useState<'not_started' | 'in_progress' | 'complete' | null>(null);

  // Account deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteReason, setDeleteReason] = useState<AccountDeletionReason | ''>('');
  const [deleteOtherDetails, setDeleteOtherDetails] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Load current phone info from server
  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/account/phone/info')
        .then(r => r.json())
        .then(d => {
          if (d.phone !== undefined) setDbPhone(d.phone);
          if (d.phoneVerified !== undefined) setDbPhoneVerified(d.phoneVerified);
        })
        .catch(() => null);
    }
  }, [session?.user?.id, phoneSuccess]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStripeState(params.get('stripe'));
    setStripeReason(params.get('reason'));
  }, []);

  // Load fresh Stripe onboarding status from the server (not the JWT)
  useEffect(() => {
    if (session?.user?.id && session.user.role === 'SELLER') {
      fetch('/api/account/stripe-status')
        .then(r => r.json())
        .then(d => {
          if (d.stripeStatus) setStripeStatus(d.stripeStatus);
        })
        .catch(() => null);
    }
  }, [session?.user?.id, session?.user?.role]);

  if (status === 'loading') {
    return (
      <main className="max-w-md mx-auto">
        <div className="card p-8 animate-pulse bg-slate-100 rounded-2xl h-64" />
      </main>
    );
  }

  if (!session?.user) {
    router.push('/login');
    return null;
  }

  const { email, role } = session.user;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError('');
    setAvatarSuccess('');
    setAvatarUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/account/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(data.error ?? 'Upload failed.');
      } else {
        try {
          await update(); // Refresh session so header/avatar reflects the change
        } catch {
          // update() failure is non-critical; the DB is already updated.
        }
        setAvatarSuccess('Profile photo updated!');
      }
    } catch {
      setAvatarError('Network error. Please try again.');
    } finally {
      setAvatarUploading(false);
      // Reset the input so the same file can be re-selected if needed
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function removeAvatar() {
    setAvatarError('');
    setAvatarSuccess('');
    setAvatarUploading(true);
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(data.error ?? 'Failed to remove photo.');
      } else {
        try {
          await update();
        } catch {
          // update() failure is non-critical; the DB is already updated.
        }
        setAvatarSuccess('Profile photo removed.');
      }
    } catch {
      setAvatarError('Network error. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError('');
    setNameSuccess('');
    setNameLoading(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.error || 'Update failed.');
      } else {
        await update(); // Refresh session to pick up the new name from the server
        setNameSuccess('Name updated!');
        setEditingName(false);
        router.refresh();
      }
    } catch {
      setNameError('Network error. Please try again.');
    }
    setNameLoading(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || 'Password change failed.');
      } else {
        setPwSuccess('Password updated successfully.');
        setChangingPassword(false);
        setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      }
    } catch {
      setPwError('Network error. Please try again.');
    }
    setPwLoading(false);
  }

  async function sendPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError('');
    setPhoneLoading(true);
    try {
      const res = await fetch('/api/account/phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneError(data.error || 'Failed to send code.');
      } else {
        setMaskedPhone(data.maskedPhone);
        setPhoneStep('enter_code');
      }
    } catch {
      setPhoneError('Network error. Please try again.');
    }
    setPhoneLoading(false);
  }

  async function verifyPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError('');
    setPhoneLoading(true);
    try {
      const res = await fetch('/api/account/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneError(data.error || 'Verification failed.');
      } else {
        setPhoneSuccess('Phone number verified and saved!');
        setPhoneStep('idle');
        setPhoneInput('');
        setCodeInput('');
      }
    } catch {
      setPhoneError('Network error. Please try again.');
    }
    setPhoneLoading(false);
  }

  function handleEditName() {
    setName(session?.user.name ?? '');
    setEditingName(true);
    setNameError('');
    setNameSuccess('');
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError('');
    if (!deleteReason) {
      setDeleteError('Please choose a deletion reason.');
      return;
    }
    if (deleteReason === 'other' && !deleteOtherDetails.trim()) {
      setDeleteError('Please provide details when selecting Other.');
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: deletePassword,
          reason: deleteReason,
          otherDetails: deleteReason === 'other' ? deleteOtherDetails.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete account.');
        setDeleteLoading(false);
      } else {
        // signOut redirects, so no need to reset loading state.
        await signOut({ callbackUrl: '/' });
      }
    } catch {
      setDeleteError('Network error. Please try again.');
      setDeleteLoading(false);
    }
  }

  return (
    <main className="max-w-md mx-auto">
      <h1 className="text-3xl font-black mb-6">My Account</h1>

      {session.user.role === 'SELLER' && stripeState === 'error' && (
        <div className="card p-4 mb-6 bg-red-50 border-red-200 text-red-800 text-sm">
          {stripeReason === 'stale_account' && '❌ Your connected Stripe account is outdated for the current mode. Reconnect payouts below.'}
          {stripeReason === 'invalid_key' && '❌ Platform Stripe credentials are invalid. Please contact support/admin.'}
          {stripeReason === 'platform_incomplete' && '❌ Platform Stripe setup is incomplete. Please contact support/admin.'}
          {stripeReason === 'stripe_error' && '❌ Stripe is temporarily unavailable. Please try again later.'}
          {stripeReason !== null && !hasKnownStripeReason && '❌ Stripe returned an unknown error. Please contact support.'}
          {stripeReason === null && '❌ Something went wrong connecting Stripe. Please try again or contact support.'}
        </div>
      )}

      <div className="card p-6 space-y-5 mb-6">
        {/* Profile picture */}
        <div>
          <p className="label">Profile photo</p>
          <div className="flex items-center gap-4 mt-1">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt="Profile"
                className="h-16 w-16 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                <span className="text-2xl text-slate-500 font-medium select-none">
                  {session.user.name?.trim().charAt(0).toUpperCase() || '?'}
                </span>
              </div>
            )}
            <div className="space-y-1">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
                className="hidden"
                id="avatar-upload"
              />
              <div className="flex gap-2 flex-wrap">
                <label
                  htmlFor="avatar-upload"
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 cursor-pointer hover:bg-slate-50 transition-colors ${avatarUploading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {avatarUploading ? 'Uploading…' : session.user.image ? 'Change photo' : 'Upload photo'}
                </label>
                {session.user.image && !avatarUploading && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400">JPEG, PNG, WebP or GIF · max 5 MB</p>
            </div>
          </div>
          {avatarError && <p className="text-red-600 text-xs mt-2">{avatarError}</p>}
          {avatarSuccess && <p className="text-green-600 text-xs mt-2">{avatarSuccess}</p>}
        </div>

        {/* Name */}
        <div>
          <p className="label">Name</p>
          {editingName ? (
            <form onSubmit={saveName} className="flex gap-2 mt-1">
              <input
                className="input flex-1"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                minLength={1}
                maxLength={100}
                autoFocus
              />
              <button className="btn-primary text-sm" disabled={nameLoading}>
                {nameLoading ? '…' : 'Save'}
              </button>
              <button type="button" className="btn-outline text-sm" onClick={() => setEditingName(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium">{session.user.name}</p>
              <button
                onClick={handleEditName}
                className="text-xs text-blue-600 hover:underline"
              >
                Edit
              </button>
            </div>
          )}
          {nameError && <p className="text-red-600 text-xs mt-1">{nameError}</p>}
          {nameSuccess && <p className="text-green-600 text-xs mt-1">{nameSuccess}</p>}
        </div>

        {/* Email */}
        <div>
          <p className="label">Email</p>
          <p className="font-medium">{email}</p>
        </div>

        {/* Role */}
        <div>
          <p className="label">Role</p>
          <p className="font-medium capitalize">{role?.toLowerCase()}</p>
        </div>

        {/* Phone */}
        <div>
          <p className="label">Phone number</p>
          {phoneStep === 'idle' && (
            <div>
              {dbPhone ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-slate-700">{dbPhone}</p>
                  {dbPhoneVerified ? (
                    <span className="badge badge-green">Verified</span>
                  ) : (
                    <span className="badge badge-yellow">Unverified</span>
                  )}
                  <button
                    onClick={() => { setPhoneStep('enter_phone'); setPhoneError(''); setPhoneSuccess(''); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Update
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-500">No phone number added</p>
                  <button
                    onClick={() => { setPhoneStep('enter_phone'); setPhoneError(''); setPhoneSuccess(''); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Add phone
                  </button>
                </div>
              )}
              {phoneSuccess && <p className="text-green-600 text-xs mt-1">{phoneSuccess}</p>}
              {role === 'SELLER' && !dbPhoneVerified && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ Sellers need a verified phone number for two-step sign-in.
                </p>
              )}
            </div>
          )}
          {phoneStep === 'enter_phone' && (
            <form onSubmit={sendPhoneCode} className="space-y-2 mt-1">
              <input
                type="tel"
                className="input"
                placeholder="+1 555 000 1234"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                required
                autoFocus
              />
              {phoneError && <p className="text-red-600 text-xs">{phoneError}</p>}
              <div className="flex gap-2">
                <button className="btn-primary text-sm" disabled={phoneLoading}>
                  {phoneLoading ? 'Sending…' : 'Send code'}
                </button>
                <button type="button" className="btn-outline text-sm" onClick={() => { setPhoneStep('idle'); setPhoneError(''); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {phoneStep === 'enter_code' && (
            <form onSubmit={verifyPhoneCode} className="space-y-2 mt-1">
              <p className="text-xs text-slate-500">
                Code sent to <span className="font-medium">{maskedPhone}</span>
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                className="input tracking-widest text-center text-xl"
                placeholder="123456"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                required
                autoFocus
              />
              {phoneError && <p className="text-red-600 text-xs">{phoneError}</p>}
              <div className="flex gap-2">
                <button className="btn-primary text-sm" disabled={phoneLoading}>
                  {phoneLoading ? 'Verifying…' : 'Verify'}
                </button>
                <button type="button" className="btn-outline text-sm" onClick={() => { setPhoneStep('enter_phone'); setPhoneError(''); }}>
                  Back
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Stripe (sellers) */}
        {role === 'SELLER' && (
          <div>
            <p className="label">Stripe Payouts</p>
            <p className="font-medium">
              {stripeStatus === null ? (
                <span className="text-slate-400 text-sm">Loading…</span>
              ) : stripeStatus === 'complete' ? (
                <>
                  <span className="badge badge-green">Connected</span>
                  {' '}
                  <a href="/api/stripe/connect" className="text-xs text-blue-600 hover:underline ml-2">Manage →</a>
                </>
              ) : stripeStatus === 'in_progress' ? (
                <>
                  <span className="badge badge-yellow">Setup in progress</span>
                  {' '}
                  <a href="/api/stripe/connect" className="text-xs text-blue-600 hover:underline ml-2">Resume setup →</a>
                </>
              ) : (
                <a href="/api/stripe/connect" className="text-blue-600 hover:underline">Connect bank account →</a>
              )}
            </p>
          </div>
        )}

        {/* Password change */}
        <div>
          <p className="label">Password</p>
          {changingPassword ? (
            <form onSubmit={savePassword} className="space-y-2 mt-1">
              <input
                type="password"
                className="input"
                placeholder="Current password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                required
                autoFocus
              />
              <input
                type="password"
                className="input"
                placeholder="New password (min 8 chars)"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                required
                minLength={8}
              />
              <input
                type="password"
                className="input"
                placeholder="Confirm new password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                required
                minLength={8}
              />
              {pwError && <p className="text-red-600 text-xs">{pwError}</p>}
              <div className="flex gap-2">
                <button className="btn-primary text-sm" disabled={pwLoading}>
                  {pwLoading ? 'Saving…' : 'Change password'}
                </button>
                <button type="button" className="btn-outline text-sm" onClick={() => { setChangingPassword(false); setPwError(''); }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-500">••••••••</p>
              <button
                onClick={() => { setChangingPassword(true); setPwSuccess(''); }}
                className="text-xs text-blue-600 hover:underline"
              >
                Change
              </button>
            </div>
          )}
          {pwSuccess && <p className="text-green-600 text-xs mt-1">{pwSuccess}</p>}
        </div>
      </div>

      <div className="space-y-3">
        {role === 'SELLER' && (
          <Link href="/seller" className="btn-primary block text-center">Seller Dashboard</Link>
        )}
        {role === 'ADMIN' && (
          <Link href="/admin" className="btn-dark block text-center">Admin Dashboard</Link>
        )}
        <Link href="/orders" className="btn-outline block text-center">My Orders</Link>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="w-full text-center text-sm text-slate-500 hover:text-red-600 py-2"
        >
          Sign out
        </button>
      </div>

      {/* Danger zone */}
      <div className="mt-10 border border-red-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-red-700 mb-1">Danger Zone</h2>
        <p className="text-sm text-slate-600 mb-4">
          Permanently delete your account and all associated personal data. This action cannot be undone.
        </p>
        {role === 'ADMIN' ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Admin accounts cannot be deleted.
          </div>
        ) : !showDeleteConfirm ? (
          <button
            onClick={() => {
              setShowDeleteConfirm(true);
              setDeleteError('');
              setDeletePassword('');
              setDeleteReason('');
              setDeleteOtherDetails('');
            }}
            className="text-sm font-medium text-red-600 border border-red-300 rounded-lg px-4 py-2 hover:bg-red-50 transition-colors"
          >
            Delete my account
          </button>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-sm text-slate-700 font-medium">Why are you deleting your account?</legend>
              {Object.entries(ACCOUNT_DELETION_REASON_LABELS).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="deleteReason"
                    value={value}
                    checked={deleteReason === value}
                    onChange={() => setDeleteReason(value as AccountDeletionReason)}
                    required
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            {deleteReason === 'other' && (
              <textarea
                className="input min-h-24"
                placeholder="Please tell us why you're leaving"
                value={deleteOtherDetails}
                onChange={e => setDeleteOtherDetails(e.target.value)}
                required
                maxLength={500}
              />
            )}
            <p className="text-sm text-slate-700 font-medium">
              Enter your password to confirm deletion:
            </p>
            <input
              type="password"
              className="input"
              placeholder="Your current password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              required
              autoFocus
            />
            {deleteError && <p className="text-red-600 text-xs">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting…' : 'Yes, permanently delete'}
              </button>
              <button
                type="button"
                className="btn-outline text-sm"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteError('');
                  setDeletePassword('');
                  setDeleteReason('');
                  setDeleteOtherDetails('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
