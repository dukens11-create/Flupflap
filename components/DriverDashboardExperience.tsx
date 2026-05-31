'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Car,
  Circle,
  Compass,
  DollarSign,
  History,
  Home,
  Loader2,
  Menu,
  Phone,
  RefreshCw,
  Star,
  UserCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DriverDashboardPayload, RideRequest } from '@/lib/driver-dashboard-store';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function getNavigationHref(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function DriverDashboardExperience() {
  const [dashboard, setDashboard] = useState<DriverDashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setIsSyncing(true);
      const response = await fetch('/api/driver/dashboard', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Could not load your dashboard data.');
      }

      setDashboard(payload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong while loading the dashboard.');
    } finally {
      setIsLoading(false);
      if (showSpinner) setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const interval = setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => clearInterval(interval);
  }, [loadDashboard]);

  const handleStatusToggle = useCallback(async () => {
    if (!dashboard) return;

    const nextStatus = dashboard.availabilityStatus === 'online' ? 'offline' : 'online';

    try {
      setIsSyncing(true);
      const response = await fetch('/api/driver/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to change status right now.');
      }
      setDashboard(payload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update your availability.');
    } finally {
      setIsSyncing(false);
    }
  }, [dashboard]);

  const handleRideAction = useCallback(async (rideId: string, action: 'accept' | 'reject') => {
    try {
      setIsSyncing(true);
      const response = await fetch('/api/driver/ride-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rideId, action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to update this ride request.');
      }
      setDashboard(payload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to process this request.');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const mapQuery = useMemo(() => {
    if (!dashboard?.rideRequests.length) {
      return encodeURIComponent(dashboard?.driverLocation.label ?? 'Brooklyn, NY');
    }

    const [firstRide] = dashboard.rideRequests;
    return encodeURIComponent(`${dashboard.driverLocation.label} to ${firstRide.pickupAddress}`);
  }, [dashboard]);

  const statusIsOnline = dashboard?.availabilityStatus === 'online';
  const desktopNavItems: Array<{ label: string; icon: LucideIcon }> = [
    { label: 'Dashboard', icon: Home },
    { label: 'Ride Requests', icon: Car },
    { label: 'Trip History', icon: History },
    { label: 'Earnings', icon: DollarSign },
    { label: 'Notifications', icon: Bell },
  ];
  const mobileNavItems: Array<{ label: string; icon: LucideIcon }> = [
    { label: 'Home', icon: Home },
    { label: 'Requests', icon: Car },
    { label: 'History', icon: History },
    { label: 'Alerts', icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28 lg:pb-8">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden lg:flex lg:flex-col lg:gap-5 lg:rounded-3xl lg:border lg:border-slate-800 lg:bg-gradient-to-b lg:from-slate-900 lg:to-slate-950 lg:p-5">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900/70 p-3">
              <Car className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Drive Driver</p>
                <p className="text-sm font-semibold text-white">Modern Dispatch</p>
              </div>
            </div>
            <nav className="space-y-2 text-sm">
              {desktopNavItems.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-slate-300 transition hover:border-slate-700 hover:bg-slate-900"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="space-y-4 lg:space-y-5">
            <header className="rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-4 shadow-2xl shadow-slate-950/70 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Driver dashboard</p>
                  <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Ready to ride</h1>
                  <p className="text-sm text-slate-400">Live status and dispatch updates synchronized in real time.</p>
                </div>

                <details className="group relative">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 transition hover:border-slate-600 hover:bg-slate-800">
                    <UserCircle2 className="h-4 w-4 text-cyan-300" />
                    Driver Profile
                    <Menu className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded-2xl border border-slate-700 bg-slate-900 p-2 text-sm shadow-xl">
                    <Link href="/account" className="block rounded-xl px-3 py-2 text-slate-200 transition hover:bg-slate-800">Profile</Link>
                    <Link href="/account" className="block rounded-xl px-3 py-2 text-slate-200 transition hover:bg-slate-800">Settings</Link>
                    <Link href="/messages" className="block rounded-xl px-3 py-2 text-slate-200 transition hover:bg-slate-800">Help</Link>
                  </div>
                </details>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleStatusToggle}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${statusIsOnline ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'}`}
                >
                  <Circle className={`h-3 w-3 ${statusIsOnline ? 'fill-emerald-950 text-emerald-950' : 'fill-slate-400 text-slate-400'}`} />
                  {statusIsOnline ? 'Go Offline' : 'Go Online'}
                </button>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusIsOnline ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-600 bg-slate-800/60 text-slate-300'}`}>
                  <Circle className={`h-2.5 w-2.5 ${statusIsOnline ? 'fill-emerald-300 text-emerald-300' : 'fill-slate-400 text-slate-400'}`} />
                  {dashboard?.availabilityLabel ?? 'Offline'}
                </span>
                {isSyncing && <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />}
              </div>
            </header>

            {errorMessage && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            )}

            {isLoading || !dashboard ? (
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-28 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/80" />
                ))}
              </div>
            ) : (
              <>
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <article className="rounded-3xl border border-slate-800 bg-gradient-to-br from-emerald-500/20 to-slate-900 p-4">
                    <p className="text-xs uppercase tracking-wider text-emerald-200">Wallet</p>
                    <p className="mt-2 text-3xl font-black text-white">{formatCurrency(dashboard.wallet.totalEarningsCents)}</p>
                    <div className="mt-3 flex gap-3 text-xs text-slate-300">
                      <span>Today: {formatCurrency(dashboard.wallet.dailyEarningsCents)}</span>
                      <span>Week: {formatCurrency(dashboard.wallet.weeklyEarningsCents)}</span>
                    </div>
                  </article>

                  <article className="rounded-3xl border border-slate-800 bg-gradient-to-br from-cyan-500/20 to-slate-900 p-4">
                    <p className="text-xs uppercase tracking-wider text-cyan-200">Driver rating</p>
                    <p className="mt-2 flex items-center gap-2 text-3xl font-black text-white">
                      <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
                      {dashboard.rating.currentRating.toFixed(1)}
                    </p>
                    <div className="mt-3 flex gap-3 text-xs text-slate-300">
                      <span>{dashboard.rating.totalRides} rides</span>
                      <span>{dashboard.rating.acceptanceRate}% accepted</span>
                    </div>
                  </article>

                  <article className="rounded-3xl border border-slate-800 bg-gradient-to-br from-violet-500/20 to-slate-900 p-4 sm:col-span-2 xl:col-span-1">
                    <p className="text-xs uppercase tracking-wider text-violet-200">Availability</p>
                    <p className="mt-2 text-xl font-bold text-white">{dashboard.availabilityLabel}</p>
                    <p className="mt-2 text-xs text-slate-300">Synced: {new Date(dashboard.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </article>
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  <article className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80">
                    <div className="flex items-center justify-between px-4 py-3">
                      <h2 className="text-sm font-semibold text-white">Live map</h2>
                      <a href={getNavigationHref(dashboard.rideRequests[0]?.pickupAddress ?? dashboard.driverLocation.label)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/35">
                        <Compass className="h-3.5 w-3.5" />
                        Navigate
                      </a>
                    </div>
                    <iframe
                      title="Driver live map"
                      src={`https://maps.google.com/maps?q=${mapQuery}&t=&z=13&ie=UTF8&iwloc=&output=embed`}
                      className="h-64 w-full border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    <div className="px-4 py-3 text-xs text-slate-300">
                      Driver location: {dashboard.driverLocation.label}
                    </div>
                  </article>

                  <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                    <h2 className="text-sm font-semibold text-white">Notifications</h2>
                    <div className="mt-3 space-y-2">
                      {dashboard.notifications.length ? dashboard.notifications.slice(0, 5).map((notification) => (
                        <div key={notification.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-sm">
                          <p className="font-semibold text-slate-100">{notification.title}</p>
                          <p className="text-xs text-slate-400">{notification.message}</p>
                        </div>
                      )) : (
                        <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No new notifications yet.</p>
                      )}
                    </div>
                  </article>
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                  <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-white">Ride requests</h2>
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-200">{dashboard.rideRequests.length} active</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {dashboard.rideRequests.length ? dashboard.rideRequests.map((ride: RideRequest) => (
                        <div key={ride.id} className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-4 transition hover:border-slate-700 hover:shadow-lg hover:shadow-cyan-500/10">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <img src={ride.passengerAvatar} alt={ride.passengerName} className="h-11 w-11 rounded-full border border-slate-700 object-cover" />
                              <div>
                                <p className="text-sm font-semibold text-white">{ride.passengerName}</p>
                                <p className="text-xs text-slate-400">{ride.pickupDistanceMiles.toFixed(1)} mi away</p>
                              </div>
                            </div>
                            <p className="text-sm font-bold text-emerald-300">{formatCurrency(ride.estimatedEarningsCents)}</p>
                          </div>

                          <div className="mt-3 space-y-1 text-xs text-slate-300">
                            <p><span className="text-slate-500">Pickup:</span> {ride.pickupAddress}</p>
                            <p><span className="text-slate-500">Dropoff:</span> {ride.destinationAddress}</p>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleRideAction(ride.id, 'accept')} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400">Accept ride</button>
                            <button type="button" onClick={() => handleRideAction(ride.id, 'reject')} className="rounded-xl bg-rose-500/80 px-4 py-2 text-xs font-semibold text-rose-50 transition hover:bg-rose-400">Reject</button>
                            <a href={getNavigationHref(ride.pickupAddress)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800"><Compass className="h-3.5 w-3.5" />Navigate</a>
                            <a href={`tel:${ride.passengerPhone}`} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800"><Phone className="h-3.5 w-3.5" />Call</a>
                          </div>
                        </div>
                      )) : (
                        <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No available ride requests right now.</p>
                      )}
                    </div>
                  </article>

                  <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                    <h2 className="text-sm font-semibold text-white">Trip history</h2>
                    <div className="mt-3 space-y-2">
                      {dashboard.tripHistory.length ? dashboard.tripHistory.map((trip) => (
                        <div key={trip.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{new Date(trip.date).toLocaleDateString()} • {new Date(trip.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="font-semibold text-emerald-300">{formatCurrency(trip.earningsCents)}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-100">{trip.passengerName}</p>
                          <p className="text-xs text-slate-400">{trip.pickupAddress} → {trip.destinationAddress}</p>
                          <p className="mt-1 text-xs text-yellow-300">★ {trip.rating.toFixed(1)}</p>
                        </div>
                      )) : (
                        <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No completed trips yet.</p>
                      )}
                    </div>
                  </article>
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between text-xs text-slate-300">
          {mobileNavItems.map(({ label, icon: Icon }) => (
            <button key={label} type="button" className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 transition hover:bg-slate-800">
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2 lg:bottom-6 lg:right-6">
        <a href={dashboard?.rideRequests[0] ? `tel:${dashboard.rideRequests[0].passengerPhone}` : 'tel:+10000000000'} className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:scale-105" aria-label="Call passenger">
          <Phone className="h-5 w-5" />
        </a>
        <button type="button" onClick={() => void loadDashboard(true)} className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:scale-105" aria-label="Refresh dashboard">
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
