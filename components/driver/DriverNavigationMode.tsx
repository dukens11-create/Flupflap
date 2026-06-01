'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_ALTERNATIVE_ROUTES,
  DEFAULT_SEGMENTS,
  DEFAULT_TURNS,
  DEFAULT_WAYPOINTS,
  DistanceUnit,
  AlternativeRoute,
  AnnouncementState,
  calculateNavigationSnapshot,
  directionIcon,
  directionVerb,
  formatDistance,
  formatDurationMinutes,
  getTurnAnnouncement,
  getUrgencyColor,
  reorderWaypoints,
  shouldRecalculateRoute,
  type RouteSegment,
  type Waypoint,
} from '@/lib/driver-navigation';

const VOICE_OPTIONS = [
  { id: 'female-en', label: 'Female · English', lang: 'en-US' },
  { id: 'male-en', label: 'Male · English', lang: 'en-GB' },
  { id: 'female-es', label: 'Female · Spanish', lang: 'es-ES' },
];

function trafficColor(traffic: RouteSegment['traffic']): string {
  if (traffic === 'slow') return 'bg-rose-500';
  if (traffic === 'moderate') return 'bg-amber-500';
  return 'bg-emerald-500';
}

export default function DriverNavigationMode() {
  const [rideAccepted, setRideAccepted] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<AlternativeRoute>(DEFAULT_ALTERNATIVE_ROUTES[0]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>(DEFAULT_WAYPOINTS);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('km');
  const [voiceOption, setVoiceOption] = useState(VOICE_OPTIONS[0]);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voicePaused, setVoicePaused] = useState(false);
  const [traveledMeters, setTraveledMeters] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(38);
  const [trafficDelayMinutes, setTrafficDelayMinutes] = useState(2);
  const [deviationMeters, setDeviationMeters] = useState(0);
  const [gpsLost, setGpsLost] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [announcementState, setAnnouncementState] = useState<AnnouncementState>({
    turnId: '',
    warned300m: false,
    warned100m: false,
  });

  const totalDistance = selectedRoute.distanceMeters;
  const routeTurns = useMemo(
    () =>
      DEFAULT_TURNS.map((turn) => ({
        ...turn,
        distanceFromStartMeters: Math.round((turn.distanceFromStartMeters / 6000) * totalDistance),
      })),
    [totalDistance],
  );

  const routeSegments = useMemo(
    () =>
      DEFAULT_SEGMENTS.map((segment) => ({
        ...segment,
        startMeters: Math.round((segment.startMeters / 6000) * totalDistance),
        endMeters: Math.round((segment.endMeters / 6000) * totalDistance),
      })),
    [totalDistance],
  );

  const snapshot = useMemo(
    () =>
      calculateNavigationSnapshot({
        totalDistanceMeters: totalDistance,
        traveledMeters,
        currentSpeedKmh: speedKmh,
        trafficDelayMinutes,
        baselineEtaMinutes: selectedRoute.etaMinutes,
        turns: routeTurns,
        segments: routeSegments,
      }),
    [routeSegments, routeTurns, selectedRoute.etaMinutes, speedKmh, totalDistance, trafficDelayMinutes, traveledMeters],
  );

  useEffect(() => {
    if (!rideAccepted || snapshot.arrived) return;

    let updateIntervalMs = 3000;
    const batteryApi = (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }).getBattery;
    if (batteryApi) {
      batteryApi().then((battery) => {
        if (battery.level < 0.2) {
          updateIntervalMs = 5000;
        }
      }).catch(() => {
        // no-op
      });
    }

    const interval = window.setInterval(() => {
      setTraveledMeters((current) => Math.min(totalDistance, current + Math.round((speedKmh * 1000 / 3600) * 3)));
      setTrafficDelayMinutes((current) => Math.max(0, current + (Math.random() < 0.35 ? 1 : -1)));
      setSpeedKmh((current) => Math.max(18, Math.min(62, current + (Math.random() < 0.5 ? 2 : -2))));
      setDeviationMeters((current) => Math.max(0, current + (Math.random() < 0.2 ? 45 : -30)));
      setGpsLost(Math.random() < 0.04);
      setNetworkError(Math.random() < 0.03);
    }, updateIntervalMs);

    return () => window.clearInterval(interval);
  }, [rideAccepted, snapshot.arrived, speedKmh, totalDistance]);

  useEffect(() => {
    if (!rideAccepted || voiceMuted || voicePaused) return;

    const { message, nextState } = getTurnAnnouncement(snapshot.distanceToNextTurnMeters, snapshot.nextTurn, announcementState);
    if (!message) return;

    setAnnouncementState(nextState);
    setAlerts((current) => [message, ...current].slice(0, 5));

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = voiceOption.lang;
      const voice = window.speechSynthesis
        .getVoices()
        .find((item) => item.lang === voiceOption.lang || item.lang.startsWith(voiceOption.lang.split('-')[0]));
      if (voice) {
        utterance.voice = voice;
      }
      window.speechSynthesis.speak(utterance);
    }
  }, [announcementState, rideAccepted, snapshot.distanceToNextTurnMeters, snapshot.nextTurn, voiceMuted, voiceOption.lang, voicePaused]);

  useEffect(() => {
    if (!rideAccepted || !snapshot.nextTurn) return;

    const dynamicAlerts: string[] = [];
    if (snapshot.nextTurn.sharpTurn && snapshot.distanceToNextTurnMeters <= 180) {
      dynamicAlerts.push('Sharp turn ahead. Reduce speed.');
    }
    if (snapshot.nextTurn.exitNumber) {
      dynamicAlerts.push(`Take ${snapshot.nextTurn.exitNumber}.`);
    }
    if (snapshot.nextTurn.tollWarning) {
      dynamicAlerts.push('Toll road ahead.');
    }
    if (snapshot.nextTurn.laneRecommendation) {
      dynamicAlerts.push(snapshot.nextTurn.laneRecommendation);
    }
    if (shouldRecalculateRoute(deviationMeters)) {
      dynamicAlerts.push('Route recalculated due to deviation.');
      setDeviationMeters(0);
    }

    if (dynamicAlerts.length) {
      setAlerts((current) => [...dynamicAlerts, ...current].slice(0, 6));
    }
  }, [deviationMeters, rideAccepted, snapshot.distanceToNextTurnMeters, snapshot.nextTurn]);

  if (!rideAccepted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-white">
        <h1 className="text-center text-3xl font-black">Incoming Ride Accepted?</h1>
        <p className="text-center text-slate-300">Start full-screen navigation mode with turn-by-turn guidance, live route updates, and voice instructions.</p>
        <button
          type="button"
          className="rounded-xl bg-emerald-500 px-6 py-3 text-lg font-semibold text-slate-950"
          onClick={() => {
            setRideAccepted(true);
            setTraveledMeters(0);
            setAlerts([]);
          }}
        >
          Accept Ride & Start Navigation
        </button>
      </main>
    );
  }

  const urgencyColor = getUrgencyColor(snapshot.distanceToNextTurnMeters);

  return (
    <main className="fixed inset-0 bg-slate-950 text-white">
      <section className={`relative z-20 border-b border-slate-700 p-4 ${urgencyColor}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl animate-pulse">{snapshot.nextTurn ? directionIcon(snapshot.nextTurn.direction) : '✅'}</span>
            <div>
              <p className="text-sm uppercase tracking-wide text-white/80">Next turn</p>
              {snapshot.nextTurn ? (
                <p className="text-xl font-black">
                  {directionVerb(snapshot.nextTurn.direction)} on <span className="font-black underline">{snapshot.nextTurn.streetName}</span>
                </p>
              ) : (
                <p className="text-xl font-black">Arrived at destination</p>
              )}
              <p className="text-2xl font-black">{formatDistance(snapshot.distanceToNextTurnMeters, distanceUnit)}</p>
            </div>
          </div>

          <button
            type="button"
            className="rounded-lg border border-white/40 bg-black/20 px-3 py-2 text-sm"
            onClick={() => setDetailsExpanded((value) => !value)}
          >
            {detailsExpanded ? 'Collapse details' : 'Expand details'}
          </button>
        </div>
      </section>

      <section className="relative h-[52vh] overflow-hidden bg-slate-900">
        <div className="absolute inset-0 grid place-content-center text-center text-slate-400">
          <p className="text-sm uppercase tracking-[0.3em]">Map view</p>
          <p className="text-xs">Viewport locked ahead · pan/zoom disabled in navigation mode</p>
        </div>

        <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 space-y-2">
          {routeSegments.map((segment, index) => (
            <div key={segment.id} className={`h-2 rounded-full ${trafficColor(segment.traffic)} ${index === snapshot.currentSegmentIndex ? 'ring-2 ring-white' : ''}`} />
          ))}
        </div>

        <div className="absolute left-10 top-1/2 -translate-y-1/2 text-xl">🚗</div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 text-xl">📍</div>
        <div className="absolute right-14 top-[45%] text-lg">🏁</div>
      </section>

      <section className="absolute bottom-0 left-0 right-0 z-20 space-y-3 border-t border-slate-700 bg-slate-950/95 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="text-slate-300">Distance remaining</p>
            <p className="text-2xl font-black">{formatDistance(snapshot.remainingMeters, distanceUnit)}</p>
            <p className="text-xs text-slate-400">Completion {snapshot.completionPercent}%</p>
          </div>
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="text-slate-300">ETA remaining</p>
            <p className="text-2xl font-black">{formatDurationMinutes(snapshot.etaMinutes)}</p>
            <p className="text-xs text-slate-400">
              Arrive by {snapshot.arrivalTimeLabel} · {snapshot.earlyLateMinutes <= 0 ? `${Math.abs(snapshot.earlyLateMinutes)} min early` : `${snapshot.earlyLateMinutes} min late`}
            </p>
          </div>
        </div>

        {detailsExpanded && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-slate-900 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Upcoming turns</p>
              <ul className="space-y-1 text-sm">
                {snapshot.upcomingTurns.map((turn) => (
                  <li key={turn.id} className="flex items-center justify-between gap-2 rounded bg-slate-800 px-2 py-1">
                    <span className="font-semibold">{directionIcon(turn.direction)} {turn.streetName}</span>
                    <span>{formatDistance(turn.distanceFromStartMeters - traveledMeters, distanceUnit)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg bg-slate-900 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Voice guidance</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  className="rounded bg-slate-800 px-2 py-1"
                  value={voiceOption.id}
                  onChange={(event) => {
                    const next = VOICE_OPTIONS.find((option) => option.id === event.target.value);
                    if (next) setVoiceOption(next);
                  }}
                >
                  {VOICE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <button type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => setVoiceMuted((value) => !value)}>
                  {voiceMuted ? 'Unmute' : 'Mute'}
                </button>
                <button type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => setVoicePaused((value) => !value)}>
                  {voicePaused ? 'Resume' : 'Pause'}
                </button>
                <button type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => setDistanceUnit((unit) => (unit === 'km' ? 'mi' : 'km'))}>
                  Unit: {distanceUnit.toUpperCase()}
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-slate-900 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Alternative routes</p>
              <div className="space-y-1 text-sm">
                {DEFAULT_ALTERNATIVE_ROUTES.map((route) => (
                  <button
                    key={route.id}
                    type="button"
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left ${route.id === selectedRoute.id ? 'bg-emerald-600 text-slate-950' : 'bg-slate-800'}`}
                    onClick={() => {
                      setSelectedRoute(route);
                      setTraveledMeters(0);
                      setAnnouncementState({ turnId: '', warned100m: false, warned300m: false });
                    }}
                  >
                    <span>{route.name}</span>
                    <span>{formatDurationMinutes(route.etaMinutes)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-slate-900 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Waypoints</p>
              <ul className="space-y-1 text-sm">
                {waypoints.map((waypoint, index) => (
                  <li key={waypoint.id} className="rounded bg-slate-800 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={waypoint.completed ? 'line-through text-slate-400' : ''}>{waypoint.label}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded bg-slate-700 px-1"
                          onClick={() => setWaypoints((current) => reorderWaypoints(current, index, Math.max(0, index - 1)))}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded bg-slate-700 px-1"
                          onClick={() => setWaypoints((current) => reorderWaypoints(current, index, Math.min(current.length - 1, index + 1)))}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded bg-slate-700 px-2"
                          onClick={() =>
                            setWaypoints((current) =>
                              current.map((item) => (item.id === waypoint.id ? { ...item, completed: true } : item)),
                            )
                          }
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded bg-slate-800 px-2 py-1">Speed limit: 50 km/h</span>
          <span className="rounded bg-slate-800 px-2 py-1">Current speed: {Math.round(speedKmh)} km/h</span>
          {gpsLost && <span className="rounded bg-rose-600 px-2 py-1">GPS signal weak · using last known route</span>}
          {networkError && <span className="rounded bg-rose-600 px-2 py-1">Network issue · retrying traffic updates</span>}
        </div>

        {alerts.length > 0 && (
          <ul className="space-y-1 text-xs text-slate-200">
            {alerts.slice(0, 3).map((alert) => (
              <li key={alert} className="rounded bg-slate-800 px-2 py-1">{alert}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          {snapshot.arrived ? (
            <button
              type="button"
              className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-950"
              onClick={() => {
                setRideAccepted(false);
                setTraveledMeters(0);
              }}
            >
              Complete Trip
            </button>
          ) : null}
          <button
            type="button"
            className="rounded bg-slate-700 px-3 py-2 text-sm"
            onClick={() => setRideAccepted(false)}
          >
            Exit navigation mode
          </button>
        </div>
      </section>
    </main>
  );
}
