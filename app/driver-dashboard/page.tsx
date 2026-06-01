'use client';

import { useState, useCallback } from 'react';
import RideRequestPopup, { RideRequest } from '@/components/RideRequestPopup';
import { Car, Wifi, WifiOff } from 'lucide-react';

// ─── Demo / test data ─────────────────────────────────────────────────────────

const DEMO_REQUEST: RideRequest = {
  id: 'demo-ride-001',
  passenger: {
    id: 'passenger-123',
    name: 'Alex Johnson',
    avatarUrl: '',
    rating: 4.92,
    totalTrips: 47,
    isFirstRide: false,
    isVerified: true,
  },
  pickup: {
    address: '123 Main Street',
    area: 'Downtown',
    city: 'San Francisco, CA',
    distanceKm: 1.8,
    estimatedMinutes: 4,
  },
  destination: {
    address: '456 Market Street',
    area: 'Financial District',
    city: 'San Francisco, CA',
  },
  earnings: {
    baseFare: 3.5,
    distanceFare: 6.2,
    timeFare: 1.8,
    tips: 0,
    total: 11.5,
    currency: 'USD',
  },
  trip: {
    rideType: 'Standard',
    passengerCount: 1,
    tripDistanceKm: 4.3,
    tripDurationMinutes: 12,
    specialNotes: '',
  },
  timeoutSeconds: 30,
  isMuted: false,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DriverDashboardPage() {
  const [isOnline, setIsOnline] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<RideRequest | null>(null);
  const [lastResult, setLastResult] = useState<string>('');

  /** Simulate receiving an incoming ride request */
  const simulateIncomingRequest = useCallback(() => {
    setLastResult('');
    setCurrentRequest({ ...DEMO_REQUEST, id: `ride-${Date.now()}` });
  }, []);

  const handleAccept = useCallback(
    async (requestId: string) => {
      try {
        const res = await fetch('/api/driver/rides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, action: 'accept' }),
        });
        const data = (await res.json()) as { message?: string };
        setLastResult(`✅ ${data.message ?? 'Ride accepted'}`);
      } catch {
        setLastResult('✅ Ride accepted (offline mode)');
      } finally {
        setCurrentRequest(null);
      }
    },
    [],
  );

  const handleReject = useCallback(
    async (requestId: string, reason?: string) => {
      try {
        const res = await fetch('/api/driver/rides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, action: 'reject', reason }),
        });
        const data = (await res.json()) as { message?: string };
        setLastResult(`❌ ${data.message ?? 'Ride declined'}${reason ? ` – ${reason}` : ''}`);
      } catch {
        setLastResult(`❌ Ride declined${reason ? ` – ${reason}` : ''} (offline mode)`);
      } finally {
        setCurrentRequest(null);
      }
    },
    [],
  );

  const handleTimeout = useCallback((requestId: string) => {
    setLastResult(`⏱ Request ${requestId} timed out – auto-declined`);
    setCurrentRequest(null);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6 gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/40 flex items-center justify-center mb-2">
          <Car size={32} className="text-green-400" />
        </div>
        <h1 className="text-2xl font-black text-white">Driver Dashboard</h1>
        <p className="text-white/50 text-sm">FlupFlap Ride – Driver Mode</p>
      </div>

      {/* Online/Offline Toggle */}
      <button
        type="button"
        onClick={() => setIsOnline((v) => !v)}
        className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-bold text-sm transition-all border-2 ${
          isOnline
            ? 'bg-green-500/20 border-green-500/60 text-green-400 hover:bg-green-500/30'
            : 'bg-slate-800 border-white/10 text-white/60 hover:bg-slate-700'
        }`}
      >
        {isOnline ? (
          <>
            <Wifi size={18} /> Online – accepting rides
          </>
        ) : (
          <>
            <WifiOff size={18} /> Offline – go online to receive requests
          </>
        )}
      </button>

      {/* Last result */}
      {lastResult && (
        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/80 text-center max-w-xs">
          {lastResult}
        </div>
      )}

      {/* Simulate button */}
      <button
        type="button"
        onClick={simulateIncomingRequest}
        disabled={!!currentRequest}
        className="px-6 py-3 rounded-2xl bg-green-500 hover:bg-green-400 active:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors shadow-lg shadow-green-500/30"
      >
        {currentRequest ? 'Request in progress…' : '▶ Simulate Incoming Ride Request'}
      </button>

      <p className="text-white/30 text-xs text-center max-w-xs">
        In production, incoming ride requests appear automatically via WebSocket / Firebase push.
      </p>

      {/* ── Full-screen popup ── */}
      {currentRequest && (
        <RideRequestPopup
          request={currentRequest}
          onAccept={handleAccept}
          onReject={handleReject}
          onTimeout={handleTimeout}
        />
      )}
    </div>
  );
}
