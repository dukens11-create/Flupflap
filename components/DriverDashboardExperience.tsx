'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  BellOff,
  CarFront,
  Clock3,
  MapPinned,
  Phone,
  Route,
  ShieldAlert,
  Star,
  TimerReset,
  UserRound,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type {
  DriverAvailabilityStatus,
  DriverRideRequest,
  DriverRideSnapshot,
  RideRequestResponseAction,
} from '@/lib/driver-ride-requests';

const POLL_INTERVAL_MS = 4_000;
const BANNER_TIMEOUT_MS = 5_000;

function formatFare(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatResponseLabel(action: RideRequestResponseAction) {
  if (action === 'accept') return 'Accepted';
  if (action === 'reject') return 'Rejected';
  return 'Timed out';
}

function formatDriverStatus(status: DriverAvailabilityStatus) {
  if (status === 'ON_TRIP') return 'On trip';
  return status === 'ONLINE' ? 'Online' : 'Offline';
}

function createRideAlertTone() {
  const BrowserAudioContext = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!BrowserAudioContext) return;

  const audioContext = new BrowserAudioContext();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
  gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.15, audioContext.currentTime + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.4);
  void audioContext.close().catch(() => undefined);
}

function MapPreview({ request }: { request: DriverRideRequest }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.3em] text-slate-400">
        <span>Route preview</span>
        <span>{request.distanceMiles.toFixed(1)} mi away</span>
      </div>
      <div className="relative h-44 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.35),_transparent_40%),linear-gradient(135deg,_#020617,_#0f172a_60%,_#1d4ed8)]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 176" fill="none" aria-hidden="true">
          <path d="M36 130C79 115 95 48 148 50C209 52 207 124 286 46" stroke="rgba(255,255,255,0.18)" strokeWidth="18" strokeLinecap="round" />
          <path d="M36 130C79 115 95 48 148 50C209 52 207 124 286 46" stroke="url(#routeGradient)" strokeWidth="7" strokeLinecap="round" strokeDasharray="10 12" />
          <circle cx="36" cy="130" r="11" fill="#22c55e" />
          <circle cx="286" cy="46" r="11" fill="#fb7185" />
          <defs>
            <linearGradient id="routeGradient" x1="36" y1="130" x2="286" y2="46" gradientUnits="userSpaceOnUse">
              <stop stopColor="#22c55e" />
              <stop offset="1" stopColor="#fb7185" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-x-4 bottom-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-950/70 p-3 text-xs text-slate-200 backdrop-blur">
            <p className="font-semibold text-emerald-300">Pickup</p>
            <p className="mt-1 text-sm font-medium text-white">{request.pickup.title}</p>
            <p className="mt-1 text-slate-300">{request.pickup.address}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/70 p-3 text-xs text-slate-200 backdrop-blur">
            <p className="font-semibold text-rose-300">Dropoff</p>
            <p className="mt-1 text-sm font-medium text-white">{request.destination.title}</p>
            <p className="mt-1 text-slate-300">{request.destination.address}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DriverDashboardExperience() {
  const [snapshot, setSnapshot] = useState<DriverRideSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [busyState, setBusyState] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('unsupported');
  const previousActiveRequestIdRef = useRef<string | null>(null);
  const latestResponseIdRef = useRef<string | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const response = await fetch('/api/driver/ride-requests', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Unable to load ride requests.');
      }

      const data = await response.json() as DriverRideSnapshot;
      setSnapshot(data);
      setError('');
    } catch {
      setError('Unable to load driver dashboard right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const submitAction = useCallback(async (payload: Record<string, unknown>, busyKey: string) => {
    setBusyState(busyKey);
    try {
      const response = await fetch('/api/driver/ride-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Action failed');
      }

      const data = await response.json() as DriverRideSnapshot;
      setSnapshot(data);
      setError('');
    } catch {
      setError('Unable to update the ride request right now.');
    } finally {
      setBusyState(null);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const interval = window.setInterval(() => {
      void loadSnapshot();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (typeof window.Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }
    setNotificationPermission(window.Notification.permission);
  }, []);

  const activeRequest = snapshot?.activeRequest ?? null;
  const queuedRequests = snapshot?.queuedRequests ?? [];
  const latestResponse = snapshot?.recentResponses[0] ?? null;
  const countdownMs = activeRequest ? Math.max(0, new Date(activeRequest.expiresAt).getTime() - currentTime) : 0;
  const urgencyClass = activeRequest?.urgency === 'urgent' ? 'border-rose-400 shadow-rose-500/20' : 'border-sky-400 shadow-sky-500/20';

  useEffect(() => {
    if (!activeRequest) {
      previousActiveRequestIdRef.current = null;
      return;
    }

    if (activeRequest.id === previousActiveRequestIdRef.current) {
      return;
    }

    previousActiveRequestIdRef.current = activeRequest.id;
    setShowDetails(false);

    if (!snapshot?.doNotDisturb) {
      createRideAlertTone();
      navigator.vibrate?.([200, 100, 200]);
      if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
        new window.Notification(`New ride request · ${activeRequest.passenger.name}`, {
          body: `${activeRequest.pickup.title} → ${activeRequest.destination.title} · ${formatFare(activeRequest.estimatedFareCents)}`,
        });
      }
    }
  }, [activeRequest, snapshot?.doNotDisturb]);

  useEffect(() => {
    if (!latestResponse || latestResponse.id === latestResponseIdRef.current) {
      return;
    }

    latestResponseIdRef.current = latestResponse.id;
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
    }

    if (latestResponse.action === 'timeout') {
      setBanner(`Ride request from ${latestResponse.passengerName} timed out and was auto-rejected.`);
    } else if (latestResponse.action === 'accept') {
      setBanner(`Ride accepted. Driver status updated to on trip.`);
    } else {
      setBanner(`Ride request from ${latestResponse.passengerName} was declined.`);
    }

    bannerTimeoutRef.current = setTimeout(() => {
      setBanner(null);
    }, BANNER_TIMEOUT_MS);
  }, [latestResponse]);

  useEffect(() => {
    if (!activeRequest) return;

    const timeout = window.setTimeout(() => {
      void loadSnapshot();
    }, Math.max(200, new Date(activeRequest.expiresAt).getTime() - Date.now() + 150));

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeRequest, loadSnapshot]);

  useEffect(() => {
    const appNavigator = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    const badgeCount = snapshot?.badgeCount ?? 0;
    document.title = badgeCount > 0 ? `(${badgeCount}) Driver Dashboard` : 'Driver Dashboard';

    if (badgeCount > 0) {
      void appNavigator.setAppBadge?.(badgeCount).catch(() => undefined);
      return;
    }

    void appNavigator.clearAppBadge?.().catch(() => undefined);
  }, [snapshot?.badgeCount]);

  useEffect(() => {
    return () => {
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current);
      }
    };
  }, []);

  const recentResponses = snapshot?.recentResponses ?? [];
  const analytics = snapshot?.analytics;

  const stats = useMemo(() => ([
    {
      label: 'Queue',
      value: `${snapshot?.queueCount ?? 0}`,
      hint: 'Outstanding ride requests',
      icon: CarFront,
    },
    {
      label: 'Acceptance rate',
      value: `${analytics?.acceptanceRate ?? 0}%`,
      hint: `${analytics?.accepted ?? 0} accepted`,
      icon: Zap,
    },
    {
      label: 'Timeouts',
      value: `${analytics?.timedOut ?? 0}`,
      hint: `${analytics?.timeoutRate ?? 0}% timeout rate`,
      icon: Clock3,
    },
    {
      label: 'Driver status',
      value: snapshot ? formatDriverStatus(snapshot.driverStatus) : 'Loading',
      hint: snapshot?.doNotDisturb ? 'Do not disturb on' : 'Alerts enabled',
      icon: snapshot?.doNotDisturb ? BellOff : Bell,
    },
  ]), [analytics, snapshot]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window.Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
  }, []);

  if (loading) {
    return <div className="card min-h-[24rem] animate-pulse bg-slate-100" />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-[linear-gradient(135deg,_#020617,_#0f172a_55%,_#1d4ed8)] text-white shadow-2xl shadow-slate-900/30">
        <div className="flex flex-col gap-6 px-6 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-200">Driver command center</p>
            <h1 className="text-3xl font-black sm:text-4xl">Real-time ride request popups, queueing, and alerts.</h1>
            <p className="max-w-xl text-sm text-slate-200 sm:text-base">
              Monitor incoming rides, preview the route, call passengers, and track accept / reject / timeout analytics without leaving the dashboard.
            </p>
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-200">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1">{formatDriverStatus(snapshot?.driverStatus ?? 'ONLINE')}</span>
              <span className="rounded-full border border-sky-400/30 bg-sky-500/15 px-3 py-1">{snapshot?.queueCount ?? 0} live requests</span>
              <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1">{notificationPermission === 'granted' ? 'Push enabled' : 'Push not enabled'}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn rounded-2xl bg-white text-slate-950 hover:bg-slate-100"
              onClick={() => void submitAction({ action: 'simulate' }, 'simulate')}
              disabled={busyState === 'simulate'}
            >
              <Zap className="mr-2 h-4 w-4" />
              {busyState === 'simulate' ? 'Adding ride…' : 'Simulate request'}
            </button>
            <button
              type="button"
              className="btn rounded-2xl border border-white/20 bg-white/10 text-white hover:bg-white/15"
              onClick={() => void submitAction({ action: 'reset' }, 'reset')}
              disabled={busyState === 'reset'}
            >
              <TimerReset className="mr-2 h-4 w-4" />
              Reset demo
            </button>
            <button
              type="button"
              className="btn rounded-2xl border border-white/20 bg-white/10 text-white hover:bg-white/15"
              onClick={() => void submitAction({ action: 'dnd', enabled: !snapshot?.doNotDisturb }, 'dnd')}
              disabled={busyState === 'dnd'}
            >
              {snapshot?.doNotDisturb ? <BellOff className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
              {snapshot?.doNotDisturb ? 'Disable DND' : 'Enable DND'}
            </button>
          </div>
        </div>
      </section>

      {banner && (
        <div className="card flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="h-5 w-5 flex-none" />
          <p>{banner}</p>
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card rounded-[1.75rem] border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-3xl font-black text-slate-950">{stat.value}</p>
                </div>
                <div className="rounded-2xl bg-slate-950 p-3 text-white">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">{stat.hint}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <div className="card rounded-[1.75rem] border-slate-200 bg-slate-950 p-6 text-white shadow-xl shadow-slate-200/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-300">Availability controls</p>
                <h2 className="mt-1 text-2xl font-black">Stay available for quick pickups.</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['ONLINE', 'OFFLINE'] as DriverAvailabilityStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`btn rounded-2xl ${snapshot?.driverStatus === status ? 'bg-white text-slate-950' : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'}`}
                    onClick={() => void submitAction({ action: 'status', status }, `status-${status}`)}
                    disabled={busyState === `status-${status}` || snapshot?.driverStatus === 'ON_TRIP'}
                  >
                    {formatDriverStatus(status)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Push alerts</p>
                <p className="mt-2 text-sm text-slate-200">
                  {notificationPermission === 'granted'
                    ? 'Ride requests can trigger browser push notifications.'
                    : 'Enable browser notifications for ride alerts.'}
                </p>
                {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                  <button type="button" className="btn mt-4 rounded-2xl bg-sky-500 text-white hover:bg-sky-400" onClick={() => void requestNotificationPermission()}>
                    Enable push notifications
                  </button>
                )}
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Badge indicators</p>
                <p className="mt-2 text-sm text-slate-200">
                  App badges and the page title update automatically when queued requests arrive.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Route actions</p>
                <p className="mt-2 text-sm text-slate-200">
                  Accept, decline, inspect full details, or call the rider directly from the popup card.
                </p>
              </div>
            </div>
          </div>

          <div className="card rounded-[1.75rem] border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Recent request activity</p>
                <h2 className="text-2xl font-black text-slate-950">Response tracking & analytics</h2>
              </div>
              <Link href="/notifications" className="text-sm font-semibold text-sky-700 hover:text-sky-800">
                View notifications →
              </Link>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-emerald-50 p-4 text-emerald-900">
                <p className="text-sm font-medium">Accepted</p>
                <p className="mt-2 text-3xl font-black">{analytics?.accepted ?? 0}</p>
              </div>
              <div className="rounded-3xl bg-red-50 p-4 text-red-900">
                <p className="text-sm font-medium">Rejected</p>
                <p className="mt-2 text-3xl font-black">{analytics?.rejected ?? 0}</p>
              </div>
              <div className="rounded-3xl bg-amber-50 p-4 text-amber-900">
                <p className="text-sm font-medium">Timed out</p>
                <p className="mt-2 text-3xl font-black">{analytics?.timedOut ?? 0}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {recentResponses.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                  Incoming ride responses will appear here as drivers accept, reject, or time out requests.
                </div>
              ) : (
                recentResponses.map((response) => (
                  <div key={response.id} className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 p-4 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{response.passengerName}</p>
                      <p className="mt-1 text-slate-500">{formatResponseLabel(response.action)} at {new Date(response.respondedAt).toLocaleTimeString()}</p>
                    </div>
                    <span className={`badge ${response.action === 'accept' ? 'badge-green' : response.action === 'reject' ? 'badge-red' : 'badge-yellow'}`}>
                      {formatResponseLabel(response.action)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="card rounded-[1.75rem] border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Queued requests</p>
                <h2 className="text-2xl font-black text-slate-950">Incoming rides</h2>
              </div>
              <button type="button" className="btn-outline" onClick={() => setShowQueue((current) => !current)}>
                {showQueue ? 'Hide queue' : 'View queue'}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {queuedRequests.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  No queued requests right now. New requests will stack here if another popup is already open.
                </div>
              ) : (
                queuedRequests.slice(0, showQueue ? queuedRequests.length : 2).map((request) => (
                  <div key={request.id} className="rounded-3xl border border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <img src={request.passenger.profileImage} alt={request.passenger.name} className="h-12 w-12 rounded-2xl object-cover" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{request.passenger.name}</p>
                        <p className="truncate text-sm text-slate-500">{request.pickup.title} → {request.destination.title}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">{request.distanceMiles.toFixed(1)} mi</span>
                      <span className="font-semibold text-slate-900">{formatFare(request.estimatedFareCents)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card rounded-[1.75rem] border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
            <p className="text-sm font-medium text-slate-500">Testing scenarios covered</p>
            <h2 className="text-2xl font-black text-slate-950">Built-in ride simulation</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li>• Mock ride request data with passenger rating, ride counts, and fare estimates</li>
              <li>• Automatic timeout handling after 30 seconds</li>
              <li>• Queue management while another request popup is open</li>
              <li>• Manual simulate button for repeated request testing</li>
            </ul>
          </div>
        </aside>
      </section>

      {activeRequest && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 pb-4 pt-20 backdrop-blur-sm sm:items-center sm:px-6">
          <div className={`driver-popup relative w-full max-w-3xl overflow-hidden rounded-[2rem] border bg-[linear-gradient(145deg,_#020617,_#111827_65%,_#1d4ed8)] text-white shadow-2xl ${urgencyClass}`}>
            <div className="absolute inset-x-0 top-0 h-1.5 bg-white/10">
              <div
                className={`h-full ${activeRequest.urgency === 'urgent' ? 'bg-rose-400' : 'bg-sky-400'}`}
                style={{ width: `${Math.max(0, Math.min(100, (countdownMs / 30_000) * 100))}%` }}
              />
            </div>
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <img src={activeRequest.passenger.profileImage} alt={activeRequest.passenger.name} className="h-16 w-16 rounded-[1.5rem] object-cover ring-2 ring-white/20" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-sky-200">New ride request</p>
                      <h2 className="truncate text-2xl font-black">{activeRequest.passenger.name}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-200">
                        <span className="rounded-full bg-white/10 px-3 py-1">{activeRequest.passenger.previousRides} rides</span>
                        <span className="rounded-full bg-white/10 px-3 py-1">⭐ {activeRequest.passenger.rating.toFixed(1)}</span>
                        <span className={`rounded-full px-3 py-1 ${activeRequest.urgency === 'urgent' ? 'bg-rose-500/20 text-rose-100' : 'bg-sky-500/20 text-sky-100'}`}>
                          {activeRequest.urgency === 'urgent' ? 'Urgent pickup' : 'Standard pickup'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Accept in</p>
                    <p className="mt-2 text-3xl font-black text-white">{formatCountdown(countdownMs)}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-300"><MapPinned className="h-4 w-4" /> Pickup</div>
                    <p className="mt-2 text-lg font-bold">{activeRequest.pickup.title}</p>
                    <p className="mt-1 text-sm text-slate-300">{activeRequest.pickup.address}</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Route className="h-4 w-4" /> Destination</div>
                    <p className="mt-2 text-lg font-bold">{activeRequest.destination.title}</p>
                    <p className="mt-1 text-sm text-slate-300">{activeRequest.destination.address}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Clock3 className="h-4 w-4" /> Pickup ETA</div>
                    <p className="mt-2 text-lg font-bold">{activeRequest.estimatedPickupMinutes} min</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Wallet className="h-4 w-4" /> Estimated fare</div>
                    <p className="mt-2 text-lg font-bold">{formatFare(activeRequest.estimatedFareCents)}</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-300"><Users className="h-4 w-4" /> Queue</div>
                    <p className="mt-2 text-lg font-bold">{queuedRequests.length} waiting</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    className="btn rounded-2xl bg-emerald-500 text-white hover:bg-emerald-400"
                    onClick={() => void submitAction({ action: 'respond', requestId: activeRequest.id, response: 'accept' }, `accept-${activeRequest.id}`)}
                    disabled={busyState === `accept-${activeRequest.id}`}
                  >
                    {busyState === `accept-${activeRequest.id}` ? 'Accepting…' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    className="btn rounded-2xl bg-rose-500 text-white hover:bg-rose-400"
                    onClick={() => void submitAction({ action: 'respond', requestId: activeRequest.id, response: 'reject' }, `reject-${activeRequest.id}`)}
                    disabled={busyState === `reject-${activeRequest.id}`}
                  >
                    {busyState === `reject-${activeRequest.id}` ? 'Rejecting…' : 'Reject'}
                  </button>
                  <button type="button" className="btn rounded-2xl border border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => setShowDetails((current) => !current)}>
                    View details
                  </button>
                  <a href={`tel:${activeRequest.passenger.phone}`} className="btn rounded-2xl border border-sky-400/40 bg-sky-500/20 text-white hover:bg-sky-500/30">
                    <Phone className="mr-2 h-4 w-4" />
                    Call passenger
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <MapPreview request={activeRequest} />
                {showDetails && (
                  <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
                    <div className="flex items-center gap-2 text-slate-100"><UserRound className="h-4 w-4" /> Passenger notes</div>
                    <p className="mt-3 leading-6">{activeRequest.notes}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-950/50 p-4">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Pickup address</p>
                        <p className="mt-2 font-medium text-white">{activeRequest.pickup.address}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-950/50 p-4">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Destination</p>
                        <p className="mt-2 font-medium text-white">{activeRequest.destination.address}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
