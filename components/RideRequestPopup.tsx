'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  MapPin,
  Navigation,
  Star,
  Clock,
  DollarSign,
  ChevronUp,
  X,
  Shield,
  Users,
  Award,
  Zap,
  Car,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PassengerInfo {
  id: string;
  name: string;
  avatarUrl?: string;
  rating: number;
  totalTrips: number;
  isFirstRide?: boolean;
  isVerified?: boolean;
}

export interface LocationInfo {
  address: string;
  area?: string;
  city?: string;
  distanceKm?: number;
  estimatedMinutes?: number;
  lat?: number;
  lng?: number;
}

export interface EarningsBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  tips?: number;
  total: number;
  currency?: string;
}

export interface TripInfo {
  rideType?: string;
  passengerCount?: number;
  specialNotes?: string;
  vehicleRequirements?: string;
  tripDistanceKm?: number;
  tripDurationMinutes?: number;
}

export interface RideRequest {
  id: string;
  passenger: PassengerInfo;
  pickup: LocationInfo;
  destination: LocationInfo;
  earnings: EarningsBreakdown;
  trip?: TripInfo;
  timeoutSeconds?: number;
  isMuted?: boolean;
}

interface RideRequestPopupProps {
  request: RideRequest;
  onAccept: (requestId: string) => Promise<void> | void;
  onReject: (requestId: string, reason?: string) => Promise<void> | void;
  onTimeout?: (requestId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DECLINE_REASONS = [
  'Too far away',
  'Wrong direction',
  'Destination too far',
  'Traffic / road issues',
  'Vehicle issue',
  'Other',
];

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function getTimerColor(secondsLeft: number, total: number): string {
  const ratio = secondsLeft / total;
  if (ratio > 0.5) return '#22c55e'; // green
  if (ratio > 0.25) return '#f97316'; // orange
  return '#ef4444'; // red
}

function getTimerTextClass(secondsLeft: number, total: number): string {
  const ratio = secondsLeft / total;
  if (ratio > 0.5) return 'text-green-400';
  if (ratio > 0.25) return 'text-orange-400';
  return 'text-red-400';
}

// ─── Sound engine (Web Audio API) ─────────────────────────────────────────────

function useAlertSound(isMuted: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const loopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  /** Play a short rising-tone ping (Uber-style alert) */
  const playAlertPing = useCallback(() => {
    if (isMuted) return;
    const ctx = getCtx();
    if (!ctx) return;

    const notes = [440, 550, 660];
    let t = ctx.currentTime;
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.04);
      gain.gain.linearRampToValueAtTime(0, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
      t += 0.18;
    }
  }, [isMuted, getCtx]);

  /** Play a short single beep (countdown last 5 s) */
  const playBeep = useCallback(() => {
    if (isMuted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }, [isMuted, getCtx]);

  const startAlertLoop = useCallback(() => {
    if (isMuted) return;
    playAlertPing();
    loopIntervalRef.current = setInterval(() => {
      playAlertPing();
    }, 2500);
  }, [isMuted, playAlertPing]);

  const stopAlertLoop = useCallback(() => {
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }
  }, []);

  // Stop when component unmounts
  useEffect(() => () => stopAlertLoop(), [stopAlertLoop]);

  return { startAlertLoop, stopAlertLoop, playBeep };
}

// ─── SwipeToAccept ─────────────────────────────────────────────────────────────

function SwipeToAccept({ onAccepted }: { onAccepted: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const [offsetY, setOffsetY] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [animateArrows, setAnimateArrows] = useState(true);
  const SWIPE_THRESHOLD = 90; // pixels upward to complete swipe
  const TRACK_HEIGHT = 160;

  const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val));

  const handlePointerDown = (e: React.PointerEvent) => {
    if (accepted) return;
    startYRef.current = e.clientY;
    setAnimateArrows(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startYRef.current === null || accepted) return;
    const delta = startYRef.current - e.clientY; // positive = upward
    setOffsetY(clamp(delta, 0, TRACK_HEIGHT));
  };

  const handlePointerUp = () => {
    if (accepted) return;
    if (offsetY >= SWIPE_THRESHOLD) {
      setOffsetY(TRACK_HEIGHT);
      setAccepted(true);
      setTimeout(onAccepted, 300);
    } else {
      setOffsetY(0);
      setAnimateArrows(true);
    }
    startYRef.current = null;
  };

  const progress = offsetY / TRACK_HEIGHT;

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <p className="text-sm font-medium text-white/70">
        {accepted ? '✓ Accepted!' : 'Swipe up to accept'}
      </p>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative flex items-center justify-center w-16 rounded-full border-2 border-green-400/50"
        style={{ height: TRACK_HEIGHT }}
      >
        {/* Progress fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full transition-none"
          style={{
            height: `${progress * 100}%`,
            background: `linear-gradient(to top, #22c55e88, #22c55e22)`,
          }}
        />

        {/* Thumb */}
        <div
          ref={thumbRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute bottom-2 w-12 h-12 rounded-full bg-green-400 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg shadow-green-400/50 z-10 touch-none"
          style={{
            transform: `translateY(${-offsetY}px)`,
            transition: offsetY === 0 && !accepted ? 'transform 0.3s ease' : 'none',
          }}
        >
          <ChevronUp size={22} className="text-black font-bold" strokeWidth={3} />
        </div>

        {/* Animated arrows */}
        {animateArrows && !accepted && (
          <div className="absolute inset-0 flex flex-col items-center justify-start pt-3 gap-0.5 pointer-events-none">
            {[0, 1, 2].map((i) => (
              <ChevronUp
                key={i}
                size={14}
                className="text-green-400/60"
                style={{
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RideRequestPopup({
  request,
  onAccept,
  onReject,
  onTimeout,
}: RideRequestPopupProps) {
  const TIMEOUT = request.timeoutSeconds ?? 30;
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT);
  const [phase, setPhase] = useState<'visible' | 'accepting' | 'rejecting' | 'done'>('visible');
  const [loading, setLoading] = useState(false);
  const [showDeclineReasons, setShowDeclineReasons] = useState(false);
  const [visible, setVisible] = useState(false); // for entrance animation

  const { startAlertLoop, stopAlertLoop, playBeep } = useAlertSound(
    request.isMuted ?? false,
  );

  // Entrance animation
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Start alert sound
  useEffect(() => {
    startAlertLoop();
    return () => stopAlertLoop();
  }, [startAlertLoop, stopAlertLoop]);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'visible') return;
    if (secondsLeft <= 0) {
      stopAlertLoop();
      setPhase('done');
      onTimeout?.(request.id);
      return;
    }
    const id = setTimeout(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 5 && next > 0) playBeep();
        return next;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, phase, stopAlertLoop, onTimeout, request.id, playBeep]);

  const handleAccept = useCallback(async () => {
    if (loading || phase !== 'visible') return;
    setLoading(true);
    stopAlertLoop();
    setPhase('accepting');
    try {
      await onAccept(request.id);
    } finally {
      setPhase('done');
    }
  }, [loading, phase, stopAlertLoop, onAccept, request.id]);

  const handleReject = useCallback(
    async (reason?: string) => {
      if (loading || phase !== 'visible') return;
      setLoading(true);
      stopAlertLoop();
      setPhase('rejecting');
      try {
        await onReject(request.id, reason);
      } finally {
        setPhase('done');
      }
    },
    [loading, phase, stopAlertLoop, onReject, request.id],
  );

  const { passenger, pickup, destination, earnings, trip } = request;
  const currency = earnings.currency ?? 'USD';
  const timerColor = getTimerColor(secondsLeft, TIMEOUT);
  const timerTextClass = getTimerTextClass(secondsLeft, TIMEOUT);
  const progressPct = (secondsLeft / TIMEOUT) * 100;

  // Slide-up / fade-out transitions
  const containerStyle: React.CSSProperties = {
    transform: visible && phase === 'visible' ? 'translateY(0)' : 'translateY(100%)',
    opacity:
      phase === 'accepting' || phase === 'rejecting' || phase === 'done' ? 0 : 1,
    transition: 'transform 0.45s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease',
  };

  if (phase === 'done') return null;

  return (
    <>
      {/* Inject keyframes for arrow animation */}
      <style>{`
        @keyframes bounce {
          0%, 100% { opacity: 0.3; transform: translateY(2px); }
          50% { opacity: 1; transform: translateY(-4px); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes warning-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        aria-modal="true"
        role="dialog"
        aria-label="Incoming ride request"
      />

      {/* Popup card – slides up from bottom */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
        style={containerStyle}
      >
        {/* Gradient background card */}
        <div
          className="rounded-t-3xl overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
            maxHeight: '96vh',
            overflowY: 'auto',
          }}
        >
          {/* ── Header: Timer + "New Ride" label ── */}
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-widest text-green-400 uppercase">
                New Ride Request
              </p>
              <p className="text-white/60 text-xs mt-0.5">
                {trip?.rideType ?? 'Standard'}
                {trip?.passengerCount ? ` · ${trip.passengerCount} passenger${trip.passengerCount !== 1 ? 's' : ''}` : ''}
              </p>
            </div>

            {/* Countdown circle */}
            <div
              className="relative flex items-center justify-center"
              style={{
                animation:
                  secondsLeft <= 10
                    ? 'warning-pulse 0.6s ease-in-out infinite'
                    : 'none',
              }}
            >
              <svg width="60" height="60" className="-rotate-90">
                <circle
                  cx="30"
                  cy="30"
                  r="25"
                  fill="none"
                  stroke="#ffffff1a"
                  strokeWidth="4"
                />
                <circle
                  cx="30"
                  cy="30"
                  r="25"
                  fill="none"
                  stroke={timerColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 25}`}
                  strokeDashoffset={`${2 * Math.PI * 25 * (1 - progressPct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.5s ease' }}
                />
              </svg>
              <span
                className={`absolute text-lg font-black tabular-nums ${timerTextClass}`}
                style={{ lineHeight: 1 }}
              >
                {secondsLeft}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mx-5 mb-4 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: timerColor,
                transition: 'width 0.9s linear, background 0.5s ease',
              }}
            />
          </div>

          {/* ── Passenger Info ── */}
          <div className="mx-5 mb-4 flex items-center gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-700 border-2 border-white/20">
                {passenger.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={passenger.avatarUrl}
                    alt={passenger.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white/60">
                    {passenger.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              {/* Pulse ring */}
              <div
                className="absolute inset-0 rounded-full border-2 border-green-400/60"
                style={{ animation: 'pulse-ring 1.8s ease-out infinite' }}
              />
              {passenger.isVerified && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border border-slate-900">
                  <Shield size={10} className="text-white" />
                </div>
              )}
            </div>

            {/* Name + rating */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-lg leading-tight truncate">
                {passenger.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="flex items-center gap-0.5 text-yellow-400 text-sm font-semibold">
                  <Star size={13} fill="currentColor" />
                  {passenger.rating.toFixed(2)}
                </span>
                <span className="text-white/40 text-xs">·</span>
                <span className="flex items-center gap-1 text-white/60 text-xs">
                  <Car size={12} />
                  {passenger.totalTrips.toLocaleString()} trips
                </span>
                {passenger.isFirstRide && (
                  <span className="flex items-center gap-0.5 bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                    <Award size={10} />
                    1st Ride
                  </span>
                )}
              </div>
            </div>

            {/* Earnings highlight */}
            <div className="flex-shrink-0 text-right">
              <p className="text-green-400 font-black text-2xl leading-none">
                {formatCurrency(earnings.total, currency)}
              </p>
              <p className="text-white/40 text-xs mt-0.5">estimated</p>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-5 border-t border-white/10 mb-4" />

          {/* ── Pickup ── */}
          <div className="mx-5 mb-3 flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                <MapPin size={15} className="text-green-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-0.5">
                Pickup
              </p>
              <p className="text-white font-semibold text-sm leading-snug">
                {pickup.address}
              </p>
              {(pickup.area || pickup.city) && (
                <p className="text-white/50 text-xs">
                  {[pickup.area, pickup.city].filter(Boolean).join(', ')}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {pickup.distanceKm !== undefined && (
                  <span className="text-xs text-white/60 flex items-center gap-1">
                    <Navigation size={11} />
                    {pickup.distanceKm.toFixed(1)} km away
                  </span>
                )}
                {pickup.estimatedMinutes !== undefined && (
                  <span className="text-xs text-white/60 flex items-center gap-1">
                    <Clock size={11} />
                    {pickup.estimatedMinutes} min
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Route line */}
          <div className="mx-5 mb-3 flex gap-3">
            <div className="flex-shrink-0 flex justify-center" style={{ width: 32 }}>
              <div className="w-0.5 h-6 bg-white/20 rounded-full" />
            </div>
            <div />
          </div>

          {/* ── Destination ── */}
          <div className="mx-5 mb-4 flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <Navigation size={15} className="text-red-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-0.5">
                Destination
              </p>
              <p className="text-white font-semibold text-sm leading-snug">
                {destination.address}
              </p>
              {(destination.area || destination.city) && (
                <p className="text-white/50 text-xs">
                  {[destination.area, destination.city].filter(Boolean).join(', ')}
                </p>
              )}
              {(trip?.tripDistanceKm !== undefined || trip?.tripDurationMinutes !== undefined) && (
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {trip?.tripDistanceKm !== undefined && (
                    <span className="text-xs text-white/60 flex items-center gap-1">
                      <Navigation size={11} />
                      {trip.tripDistanceKm.toFixed(1)} km trip
                    </span>
                  )}
                  {trip?.tripDurationMinutes !== undefined && (
                    <span className="text-xs text-white/60 flex items-center gap-1">
                      <Clock size={11} />
                      ~{trip.tripDurationMinutes} min
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Earnings Breakdown ── */}
          <div className="mx-5 mb-4 rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <DollarSign size={15} className="text-green-400" />
              <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                Fare Breakdown
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-white/60">Base fare</span>
              <span className="text-white text-right font-medium">
                {formatCurrency(earnings.baseFare, currency)}
              </span>
              <span className="text-white/60">Distance</span>
              <span className="text-white text-right font-medium">
                {formatCurrency(earnings.distanceFare, currency)}
              </span>
              <span className="text-white/60">Time</span>
              <span className="text-white text-right font-medium">
                {formatCurrency(earnings.timeFare, currency)}
              </span>
              {earnings.tips !== undefined && earnings.tips > 0 && (
                <>
                  <span className="text-white/60 flex items-center gap-1">
                    <Zap size={11} /> Tips
                  </span>
                  <span className="text-white text-right font-medium">
                    {formatCurrency(earnings.tips, currency)}
                  </span>
                </>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center">
              <span className="text-white font-semibold">Total</span>
              <span className="text-green-400 font-black text-xl">
                {formatCurrency(earnings.total, currency)}
              </span>
            </div>
          </div>

          {/* ── Special Notes ── */}
          {trip?.specialNotes && (
            <div className="mx-5 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 flex gap-2">
              <Users size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-amber-300 text-xs leading-snug">{trip.specialNotes}</p>
            </div>
          )}

          {/* ── Accept / Reject ── */}
          <div className="mx-5 mb-6 flex gap-3 items-end">
            {/* Swipe-to-accept */}
            <div className="flex-1 flex justify-center">
              <SwipeToAccept onAccepted={handleAccept} />
            </div>

            {/* Reject area */}
            <div className="flex flex-col gap-2 items-end">
              {showDeclineReasons ? (
                <div className="rounded-2xl bg-slate-800 border border-white/10 p-3 flex flex-col gap-1 min-w-[160px]">
                  <p className="text-white/50 text-xs font-semibold mb-1">
                    Decline reason
                  </p>
                  {DECLINE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => void handleReject(reason)}
                      className="text-left text-sm text-white/80 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      {reason}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowDeclineReasons(false)}
                    className="text-xs text-white/40 hover:text-white/70 mt-1 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeclineReasons(true)}
                  className="w-14 h-14 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center hover:bg-red-500/30 active:scale-95 transition-all"
                  aria-label="Reject ride"
                >
                  <X size={22} className="text-red-400" />
                </button>
              )}
              {!showDeclineReasons && (
                <p className="text-xs text-white/40 text-center">Reject</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
