'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Car,
  ChevronDown,
  ChevronUp,
  Map,
  MessageCircle,
  Navigation,
  Phone,
  Settings,
  Star,
  User,
  Wallet,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const DRIVER = {
  name: 'Alex Jordan',
  rating: 4.95,
  vehicle: 'Toyota Camry • ABC-2198',
  acceptanceRate: 92,
  tripsToday: 3,
  tripsCompleted: 1248,
};

const RIDE_REQUEST = {
  passengerName: 'Maya Lee',
  passengerRating: 4.9,
  pickup: '24 Main Street, Downtown',
  destination: '88 Harbor View Ave, Uptown',
  distance: '1.8 mi',
  eta: '6 min',
  fare: '$18.40',
};

const WEEKLY_EARNINGS = [120, 96, 132, 115, 154, 188, 140];

function formatTimeOnline(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export default function DriverDashboardPage() {
  const [isOnline, setIsOnline] = useState(true);
  const [showRideRequest, setShowRideRequest] = useState(true);
  const [countdown, setCountdown] = useState(25);
  const [hasAcceptedRide, setHasAcceptedRide] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [mapZoom, setMapZoom] = useState(14);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [onlineSeconds, setOnlineSeconds] = useState(2 * 3600 + 17 * 60);
  const [activeTab, setActiveTab] = useState<'map' | 'rides' | 'earnings' | 'profile'>('map');

  useEffect(() => {
    if (!isOnline || hasAcceptedRide) return;
    if (countdown <= 0) {
      setShowRideRequest(false);
      return;
    }
    const timer = setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, hasAcceptedRide, isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    const timer = setInterval(() => setOnlineSeconds((value) => value + 60), 60000);
    return () => clearInterval(timer);
  }, [isOnline]);

  const todayEarnings = useMemo(() => {
    const total = WEEKLY_EARNINGS[WEEKLY_EARNINGS.length - 1] ?? 0;
    return `$${total.toFixed(2)}`;
  }, []);

  const acceptRide = () => {
    setHasAcceptedRide(true);
    setSheetOpen(true);
    setShowRideRequest(false);
  };

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-[#f5f5f5] font-['-apple-system,BlinkMacSystemFont,Segoe_UI,sans-serif]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <header className="rounded-3xl border border-white/10 bg-black/70 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[#a3a3a3]">Welcome back</p>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{DRIVER.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm">
                <Star className="h-4 w-4 fill-current text-[#00D084]" />
                <span className="font-semibold">{DRIVER.rating} ★</span>
              </div>
              <button
                type="button"
                aria-pressed={isOnline}
                onClick={() => setIsOnline((current) => !current)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                  isOnline
                    ? 'bg-[#00D084] text-[#0b1512] shadow-[0_0_0_3px_rgba(0,208,132,0.2)]'
                    : 'bg-white/10 text-[#f5f5f5]'
                }`}
              >
                <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-[#0fff9d] animate-pulse' : 'bg-[#6b7280]'}`} />
                {isOnline ? 'Online' : 'Offline'}
              </button>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10"
                aria-label="Profile"
              >
                <User className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl" style={{ minHeight: '65vh' }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,208,132,0.13),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_35%),linear-gradient(180deg,#151515,#0f0f0f)]" />
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />

          <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            <span className="h-5 w-5 rounded-full border-4 border-white bg-[#3b82f6]" />
            <span className="rounded-full bg-black/70 px-2 py-1 text-xs">You are here</span>
          </div>

          <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
            <button type="button" aria-label="Zoom in" onClick={() => setMapZoom((z) => Math.min(20, z + 1))} className="grid h-10 w-10 place-items-center rounded-xl bg-black/70 text-white transition hover:bg-black">
              <ZoomIn className="h-5 w-5" />
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => setMapZoom((z) => Math.max(1, z - 1))} className="grid h-10 w-10 place-items-center rounded-xl bg-black/70 text-white transition hover:bg-black">
              <ZoomOut className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-pressed={trafficEnabled}
              onClick={() => setTrafficEnabled((value) => !value)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${trafficEnabled ? 'bg-[#00D084] text-[#0b1512]' : 'bg-black/70 text-white'}`}
            >
              Traffic
            </button>
          </div>

          <div className="absolute left-4 top-4 z-20 rounded-xl bg-black/65 px-3 py-2 text-xs font-medium">
            Zoom {mapZoom} • {trafficEnabled ? 'Traffic on' : 'Traffic off'}
          </div>

          {showRideRequest && isOnline && !hasAcceptedRide && (
            <article className="ride-card absolute bottom-6 left-1/2 z-30 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-3xl border border-white/10 bg-[#111111]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div aria-label={`${RIDE_REQUEST.passengerName} avatar`} className="grid h-12 w-12 place-items-center rounded-full bg-[#222] text-sm font-bold">ML</div>
                  <div>
                    <p className="text-base font-semibold">{RIDE_REQUEST.passengerName}</p>
                    <p className="text-sm text-[#bcbcbc]">{RIDE_REQUEST.passengerRating} ★ passenger rating</p>
                  </div>
                </div>
                <span className="rounded-full bg-[#22120b] px-3 py-1 text-sm font-semibold text-[#ffb27d]">{countdown}s</span>
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-base font-semibold leading-6">Pickup: {RIDE_REQUEST.pickup}</p>
                <p className="text-[#cfcfcf]">Dropoff: {RIDE_REQUEST.destination}</p>
                <p className="text-[#bcbcbc]">{RIDE_REQUEST.distance} away • {RIDE_REQUEST.eta} to pickup</p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-2xl font-bold text-[#00D084]">{RIDE_REQUEST.fare}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowRideRequest(false)} className="rounded-xl border border-white/15 px-4 py-2 font-semibold text-[#f5f5f5] transition hover:bg-white/5 active:scale-95">
                    Reject
                  </button>
                  <button type="button" onClick={acceptRide} className="rounded-xl bg-[#00D084] px-4 py-2 font-semibold text-[#0b1512] transition hover:brightness-105 active:scale-95">
                    Accept
                  </button>
                </div>
              </div>
            </article>
          )}

          {hasAcceptedRide && (
            <div className="absolute bottom-6 left-6 z-30 rounded-2xl bg-black/75 px-4 py-3 text-sm">
              Active trip in progress • Navigate to pickup
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4">
            <p className="text-xs uppercase tracking-wide text-[#a3a3a3]">Current earnings</p>
            <p className="mt-1 text-2xl font-bold text-[#00D084]">{todayEarnings}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4">
            <p className="text-xs uppercase tracking-wide text-[#a3a3a3]">Trips today</p>
            <p className="mt-1 text-2xl font-bold">{DRIVER.tripsToday}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4">
            <p className="text-xs uppercase tracking-wide text-[#a3a3a3]">Time online</p>
            <p className="mt-1 text-2xl font-bold">{formatTimeOnline(onlineSeconds)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4">
            <p className="text-xs uppercase tracking-wide text-[#a3a3a3]">Acceptance rate</p>
            <p className="mt-1 text-2xl font-bold">{DRIVER.acceptanceRate}%</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-black/60 p-4 lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Wallet</h2>
              <button type="button" className="rounded-xl bg-[#00D084] px-4 py-2 text-sm font-semibold text-[#0b1512]">
                Quick withdrawal
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-[#bcbcbc]">Today</p>
                <p className="mt-1 text-2xl font-bold">{todayEarnings}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-[#bcbcbc]">Balance</p>
                <p className="mt-1 text-2xl font-bold">$742.50</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-[#bcbcbc]">Weekly earnings</p>
              <div className="mt-3 flex h-24 items-end gap-2">
                {WEEKLY_EARNINGS.map((amount, index) => (
                  <span
                    key={index}
                    aria-label={`Day ${index + 1}: $${amount}`}
                    className="flex-1 rounded-t-md bg-[#00D084]/80"
                    style={{ height: `${Math.max(18, amount / 2)}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/60 p-4 lg:col-span-2">
            <h2 className="text-xl font-bold">Profile</h2>
            <div className="mt-4 flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-[#2a2a2a] text-lg font-bold">AJ</div>
              <div>
                <p className="text-lg font-semibold">{DRIVER.name}</p>
                <p className="text-sm text-[#bcbcbc]">{DRIVER.vehicle}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[#bcbcbc]">Rating</p>
                <p className="font-semibold">{DRIVER.rating} ★</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[#bcbcbc]">Completed</p>
                <p className="font-semibold">{DRIVER.tripsCompleted}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[#bcbcbc]">Acceptance</p>
                <p className="font-semibold">{DRIVER.acceptanceRate}%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[#bcbcbc]">Status</p>
                <p className="font-semibold text-[#00D084]">{isOnline ? 'Online' : 'Offline'}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" aria-label="Open settings" className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">Settings</button>
              <button type="button" aria-label="Get help" className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">Help</button>
            </div>
          </div>
        </section>
      </div>

      <aside
        className={`fixed bottom-0 left-0 right-0 z-40 mx-auto w-full max-w-3xl rounded-t-3xl border border-white/10 bg-[#101010] p-4 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] transition-transform duration-300 ${
          sheetOpen ? 'translate-y-0' : 'translate-y-[84%]'
        }`}
      >
        <button type="button" aria-label={sheetOpen ? 'Collapse trip details' : 'Expand trip details'} onClick={() => setSheetOpen((open) => !open)} className="mx-auto mb-3 block rounded-full bg-white/20 p-1">
          {sheetOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[#a3a3a3]">Trip details</p>
            <p className="text-lg font-bold">{hasAcceptedRide ? RIDE_REQUEST.destination : 'Waiting for next request'}</p>
            <p className="text-sm text-[#bcbcbc]">{hasAcceptedRide ? 'Turn right in 200 ft • Keep left in 0.7 mi' : 'Swipe down to dismiss panel'}</p>
          </div>
          {hasAcceptedRide && <span className="rounded-full bg-[#00D084]/20 px-3 py-1 text-sm font-semibold text-[#00D084]">Navigation ready</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" aria-label="Get directions to passenger" className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">Directions</button>
          <button type="button" aria-label="Call passenger" className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">Call</button>
          <button type="button" aria-label="Message passenger" className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">Message</button>
        </div>
      </aside>

      {hasAcceptedRide && (
        <div className="fixed bottom-28 right-5 z-50 flex flex-col gap-3">
          <button type="button" aria-label="Call passenger" className="grid h-14 w-14 place-items-center rounded-full bg-[#00D084] text-[#0b1512] shadow-xl"><Phone className="h-6 w-6" /></button>
          <button type="button" aria-label="Message passenger" className="grid h-12 w-12 place-items-center rounded-full bg-[#111] text-white shadow-xl"><MessageCircle className="h-5 w-5" /></button>
          <button type="button" aria-label="Start navigation" className="grid h-12 w-12 place-items-center rounded-full bg-[#111] text-white shadow-xl"><Navigation className="h-5 w-5" /></button>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/95 p-2 md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4 gap-1 text-center text-xs">
          <li><button type="button" aria-label="Map view" aria-current={activeTab === 'map' ? 'page' : undefined} onClick={() => setActiveTab('map')} className={`flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 ${activeTab === 'map' ? 'text-[#00D084]' : 'text-[#d4d4d4]'}`}><Map className="h-4 w-4" />Map</button></li>
          <li><button type="button" aria-label="Rides" aria-current={activeTab === 'rides' ? 'page' : undefined} onClick={() => setActiveTab('rides')} className={`flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 ${activeTab === 'rides' ? 'text-[#00D084]' : 'text-[#d4d4d4]'}`}><Car className="h-4 w-4" />Rides</button></li>
          <li><button type="button" aria-label="Earnings" aria-current={activeTab === 'earnings' ? 'page' : undefined} onClick={() => setActiveTab('earnings')} className={`flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 ${activeTab === 'earnings' ? 'text-[#00D084]' : 'text-[#d4d4d4]'}`}><Wallet className="h-4 w-4" />Earnings</button></li>
          <li><button type="button" aria-label="Profile" aria-current={activeTab === 'profile' ? 'page' : undefined} onClick={() => setActiveTab('profile')} className={`flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 ${activeTab === 'profile' ? 'text-[#00D084]' : 'text-[#d4d4d4]'}`}><User className="h-4 w-4" />Profile</button></li>
        </ul>
      </nav>

      <style jsx>{`
        .ride-card {
          animation: slideUp 320ms ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translate(-50%, 30px);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}
