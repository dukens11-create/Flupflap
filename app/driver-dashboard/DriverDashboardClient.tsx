'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  estimateEtaMinutes,
  getAccuracyLabel,
  haversineDistanceMiles,
  normalizeSpeedMph,
  shouldApplyLocationUpdate,
  type TimedCoordinates,
} from '@/lib/driver-tracking';

type DriverPosition = {
  lat: number;
  lng: number;
  speedMph: number | null;
  accuracyMeters: number | null;
  timestamp: number;
};

type RideRequest = {
  id: string;
  passengerName: string;
  pickup: { name: string; lat: number; lng: number };
  dropoff: { name: string; lat: number; lng: number };
  estimatedEarnings: number;
};

type MapboxMap = {
  flyTo: (options: Record<string, unknown>) => void;
  on: (event: string, callback: () => void) => void;
  remove: () => void;
  addControl: (control: unknown, position?: string) => void;
  setStyle: (style: string) => void;
  setCenter: (center: [number, number]) => void;
  getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getLayer: (id: string) => unknown;
  loaded: () => boolean;
};

type MarkerLike = {
  setLngLat: (position: [number, number]) => MarkerLike;
  addTo: (map: MapboxMap) => MarkerLike;
  remove: () => void;
};

type MapboxGL = {
  accessToken: string;
  Map: new (options: Record<string, unknown>) => MapboxMap;
  Marker: new (options?: Record<string, unknown>) => MarkerLike;
  NavigationControl: new () => unknown;
};

const MAPBOX_SCRIPT_ID = 'mapbox-gl-js';
const MAPBOX_STYLESHEET_ID = 'mapbox-gl-css';
const ROUTE_SOURCE_ID = 'driver-route-source';
const ROUTE_LAYER_ID = 'driver-route-layer';

const BASE_MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';
const STREET_STYLE = 'mapbox://styles/mapbox/navigation-night-v1';
const TRAFFIC_STYLE = 'mapbox://styles/mapbox/traffic-night-v2';

const MOCK_RIDE_REQUESTS: RideRequest[] = [
  {
    id: 'ride-101',
    passengerName: 'Alex Johnson',
    pickup: { name: 'Market St & 5th', lat: 37.7837, lng: -122.4089 },
    dropoff: { name: 'Mission Bay Blvd', lat: 37.7711, lng: -122.3915 },
    estimatedEarnings: 18.5,
  },
  {
    id: 'ride-102',
    passengerName: 'Priya Singh',
    pickup: { name: 'Union Square', lat: 37.7882, lng: -122.4070 },
    dropoff: { name: 'Fisherman’s Wharf', lat: 37.8080, lng: -122.4177 },
    estimatedEarnings: 22.0,
  },
  {
    id: 'ride-103',
    passengerName: 'Marcus Lee',
    pickup: { name: 'SoMa - Howard St', lat: 37.7781, lng: -122.4010 },
    dropoff: { name: 'Golden Gate Park', lat: 37.7694, lng: -122.4862 },
    estimatedEarnings: 27.25,
  },
];

function loadMapboxAssets() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window_unavailable'));
      return;
    }

    if (window.document.getElementById(MAPBOX_SCRIPT_ID) && (window as Window & { mapboxgl?: MapboxGL }).mapboxgl) {
      resolve();
      return;
    }

    if (!window.document.getElementById(MAPBOX_STYLESHEET_ID)) {
      const link = document.createElement('link');
      link.id = MAPBOX_STYLESHEET_ID;
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css';
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById(MAPBOX_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('mapbox_script_failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = MAPBOX_SCRIPT_ID;
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('mapbox_script_failed'));
    document.body.appendChild(script);
  });
}

function formatCoords(position: DriverPosition | null) {
  if (!position) return 'Unknown';
  return `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
}

export default function DriverDashboardClient({ mapboxToken }: { mapboxToken: string }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const driverMarkerRef = useRef<MarkerLike | null>(null);
  const rideMarkersRef = useRef<MarkerLike[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const geoStatusRef = useRef<'idle' | 'loading' | 'active' | 'denied' | 'unavailable' | 'error'>('idle');
  const lastKnownPositionRef = useRef<DriverPosition | null>(null);

  const [driverOnline, setDriverOnline] = useState(true);
  const [driverPosition, setDriverPosition] = useState<DriverPosition | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'active' | 'denied' | 'unavailable' | 'error'>('idle');
  const [geoMessage, setGeoMessage] = useState('Enable location to start live tracking.');
  const [acceptedRideId, setAcceptedRideId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<'map' | 'street'>('map');
  const [trafficEnabled, setTrafficEnabled] = useState(false);

  useEffect(() => {
    geoStatusRef.current = geoStatus;
  }, [geoStatus]);

  const acceptedRide = useMemo(
    () => MOCK_RIDE_REQUESTS.find((ride) => ride.id === acceptedRideId) ?? null,
    [acceptedRideId],
  );

  const nearbyRideRequests = useMemo(() => {
    if (!driverPosition) {
      return MOCK_RIDE_REQUESTS.map((ride) => ({
        ...ride,
        distanceMiles: null,
        etaMinutes: null,
      }));
    }

    return MOCK_RIDE_REQUESTS
      .map((ride) => {
        const distanceMiles = haversineDistanceMiles(
          { lat: driverPosition.lat, lng: driverPosition.lng },
          { lat: ride.pickup.lat, lng: ride.pickup.lng },
        );
        const etaMinutes = estimateEtaMinutes(distanceMiles, driverPosition.speedMph);

        return {
          ...ride,
          distanceMiles,
          etaMinutes,
        };
      })
      .filter((ride) => (ride.distanceMiles ?? 0) <= 8)
      .sort((a, b) => (a.distanceMiles ?? Number.MAX_SAFE_INTEGER) - (b.distanceMiles ?? Number.MAX_SAFE_INTEGER));
  }, [driverPosition]);

  const updateRoutePreview = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    const coordinates = acceptedRide && driverPosition
      ? [
        [driverPosition.lng, driverPosition.lat],
        [acceptedRide.pickup.lng, acceptedRide.pickup.lat],
        [acceptedRide.dropoff.lng, acceptedRide.dropoff.lat],
      ]
      : [];

    const routeGeoJson = {
      type: 'FeatureCollection',
      features: coordinates.length
        ? [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates,
            },
            properties: {},
          },
        ]
        : [],
    };

    const source = map.getSource(ROUTE_SOURCE_ID);
    if (source) {
      source.setData(routeGeoJson);
      return;
    }

    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: routeGeoJson,
    });

    if (!map.getLayer(ROUTE_LAYER_ID)) {
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#22d3ee',
          'line-width': 5,
          'line-opacity': 0.85,
        },
      });
    }
  }, [acceptedRide, driverPosition]);

  const updateMapMarkers = useCallback(() => {
    const map = mapRef.current;
    const mapboxgl = (window as Window & { mapboxgl?: MapboxGL }).mapboxgl;
    if (!map || !mapboxgl) return;

    if (driverPosition) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new mapboxgl.Marker({ color: '#3b82f6' })
          .setLngLat([driverPosition.lng, driverPosition.lat])
          .addTo(map);
      } else {
        driverMarkerRef.current.setLngLat([driverPosition.lng, driverPosition.lat]);
      }
    }

    rideMarkersRef.current.forEach((marker) => marker.remove());
    rideMarkersRef.current = [];

    nearbyRideRequests.forEach((ride) => {
      const pickupMarker = new mapboxgl.Marker({ color: acceptedRide?.id === ride.id ? '#22c55e' : '#f97316' })
        .setLngLat([ride.pickup.lng, ride.pickup.lat])
        .addTo(map);
      rideMarkersRef.current.push(pickupMarker);

      if (acceptedRide?.id === ride.id) {
        const dropoffMarker = new mapboxgl.Marker({ color: '#ec4899' })
          .setLngLat([ride.dropoff.lng, ride.dropoff.lat])
          .addTo(map);
        rideMarkersRef.current.push(dropoffMarker);
      }
    });

    updateRoutePreview();
  }, [acceptedRide, driverPosition, nearbyRideRequests, updateRoutePreview]);

  const centerOnDriver = useCallback(() => {
    if (!driverPosition || !mapRef.current) return;
    mapRef.current.flyTo({ center: [driverPosition.lng, driverPosition.lat], zoom: 14, essential: true });
  }, [driverPosition]);

  const applyMapStyle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const style = trafficEnabled
      ? TRAFFIC_STYLE
      : mapMode === 'street'
        ? STREET_STYLE
        : BASE_MAP_STYLE;

    map.setStyle(style);
    map.on('style.load', () => {
      updateMapMarkers();
      updateRoutePreview();
    });
  }, [mapMode, trafficEnabled, updateMapMarkers, updateRoutePreview]);

  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus('unavailable');
      setGeoMessage('Location is unavailable in this browser.');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setGeoStatus('loading');
    setGeoMessage('Requesting location permission...');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const nextPosition: DriverPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speedMph: normalizeSpeedMph(position.coords.speed),
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          timestamp: position.timestamp,
        };

        setDriverPosition((previous) => {
          const previousTimed: TimedCoordinates | null = previous
            ? { lat: previous.lat, lng: previous.lng, timestamp: previous.timestamp }
            : null;

          const shouldApply = shouldApplyLocationUpdate(
            previousTimed,
            { lat: nextPosition.lat, lng: nextPosition.lng, timestamp: nextPosition.timestamp },
            {
              minDistanceMeters: document.hidden ? 40 : 10,
              minTimeMs: document.hidden ? 8000 : 2000,
            },
          );

          if (!shouldApply) {
            return previous;
          }

          lastKnownPositionRef.current = nextPosition;

          if (!document.hidden && mapRef.current) {
            mapRef.current.setCenter([nextPosition.lng, nextPosition.lat]);
          }

          return nextPosition;
        });

        setGeoStatus('active');
        setGeoMessage('Live GPS tracking is active.');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGeoStatus('denied');
          setGeoMessage('Location permission denied. Enable it to receive live ride requests nearby.');
          return;
        }
        setGeoStatus('error');
        setGeoMessage('Unable to read your location right now. Please try again.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );
  }, []);

  useEffect(() => {
    if (!mapboxToken) {
      setGeoMessage('Map is unavailable because NEXT_PUBLIC_MAPBOX_TOKEN is missing.');
      return;
    }

    let mounted = true;

    void loadMapboxAssets()
      .then(() => {
        if (!mounted || !mapContainerRef.current || mapRef.current) return;

        const mapboxgl = (window as Window & { mapboxgl?: MapboxGL }).mapboxgl;
        if (!mapboxgl) return;

        mapboxgl.accessToken = mapboxToken;

        const cachedPosition = lastKnownPositionRef.current;
        const center = cachedPosition
          ? [cachedPosition.lng, cachedPosition.lat]
          : [-122.4194, 37.7749];

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: BASE_MAP_STYLE,
          center,
          zoom: 13,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        mapRef.current = map;

        map.on('load', () => {
          if (cachedPosition) {
            setDriverPosition(cachedPosition);
          }
          updateMapMarkers();
          updateRoutePreview();
        });
      })
      .catch(() => {
        setGeoMessage('Unable to load map assets. Check your network connection and Mapbox token.');
      });

    return () => {
      mounted = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      rideMarkersRef.current.forEach((marker) => marker.remove());
      rideMarkersRef.current = [];
      driverMarkerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, updateMapMarkers, updateRoutePreview]);

  useEffect(() => {
    updateMapMarkers();
  }, [updateMapMarkers]);

  useEffect(() => {
    if (!mapRef.current) return;
    applyMapStyle();
  }, [applyMapStyle]);

  useEffect(() => {
    if (!navigator.permissions || !navigator.permissions.query) {
      startLocationTracking();
      return;
    }

    let mounted = true;
    void navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (!mounted) return;

      if (status.state === 'denied') {
        setGeoStatus('denied');
        setGeoMessage('Location permission denied. Enable location from browser settings to continue.');
        return;
      }

      startLocationTracking();
      status.onchange = () => {
        if (status.state === 'granted' && geoStatusRef.current !== 'active') {
          startLocationTracking();
        }
      };
    }).catch(() => {
      startLocationTracking();
    });

    return () => {
      mounted = false;
    };
  }, [startLocationTracking]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Driver Dashboard</h1>
            <p className="text-xs text-slate-400">Status: <span className={driverOnline ? 'text-emerald-400' : 'text-amber-400'}>{driverOnline ? 'Online' : 'Offline'}</span> • {formatCoords(driverPosition)}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDriverOnline((prev) => !prev)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${driverOnline ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-100'}`}
            >
              {driverOnline ? 'Go Offline' : 'Go Online'}
            </button>
            <button
              type="button"
              onClick={centerOnDriver}
              className="rounded-full border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Current Location
            </button>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[2fr_1fr] md:p-6">
        <section className="relative min-h-[520px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          {mapboxToken ? (
            <div ref={mapContainerRef} className="h-[65vh] min-h-[520px] w-full" />
          ) : (
            <div className="flex h-[65vh] min-h-[520px] items-center justify-center px-6 text-center text-sm text-slate-400">
              Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the live map.
            </div>
          )}

          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMapMode('map')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mapMode === 'map' ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-100'}`}
            >
              Map View
            </button>
            <button
              type="button"
              onClick={() => setMapMode('street')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mapMode === 'street' ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-100'}`}
            >
              Street View
            </button>
            <button
              type="button"
              onClick={() => setTrafficEnabled((prev) => !prev)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${trafficEnabled ? 'bg-fuchsia-400 text-slate-950' : 'bg-slate-800 text-slate-100'}`}
            >
              Traffic {trafficEnabled ? 'On' : 'Off'}
            </button>
          </div>

          <div className="absolute bottom-3 left-3 right-3 z-10 rounded-xl bg-slate-900/85 p-3 text-xs text-slate-200 backdrop-blur">
            <p className="font-medium text-slate-100">GPS Tracking</p>
            <p className="text-slate-300">{geoMessage}</p>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400 sm:grid-cols-4">
              <span>Coordinates: {formatCoords(driverPosition)}</span>
              <span>Speed: {driverPosition?.speedMph ? `${driverPosition.speedMph.toFixed(1)} mph` : 'Unavailable'}</span>
              <span>Accuracy: {driverPosition?.accuracyMeters ? `${driverPosition.accuracyMeters.toFixed(0)}m (${getAccuracyLabel(driverPosition.accuracyMeters)})` : 'Unavailable'}</span>
              <span>Permission: {geoStatus}</span>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nearby Ride Requests</h2>
          {nearbyRideRequests.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
              No nearby requests yet.
            </div>
          ) : (
            nearbyRideRequests.map((ride) => {
              const isAccepted = acceptedRideId === ride.id;
              return (
                <article key={ride.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-100">{ride.passengerName}</h3>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-emerald-300">${ride.estimatedEarnings.toFixed(2)}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-300">Pickup: {ride.pickup.name}</p>
                  <p className="text-xs text-slate-300">Destination: {ride.dropoff.name}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    Distance to pickup: {ride.distanceMiles ? `${ride.distanceMiles.toFixed(2)} mi` : 'Awaiting GPS'} • ETA: {ride.etaMinutes ? `${ride.etaMinutes} min` : '—'}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAcceptedRideId(ride.id)}
                      className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950"
                    >
                      {isAccepted ? 'Accepted' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (acceptedRideId === ride.id) {
                          setAcceptedRideId(null);
                        }
                      }}
                      className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200"
                    >
                      Reject
                    </button>
                  </div>
                </article>
              );
            })
          )}

          {acceptedRide && (
            <div className="rounded-xl border border-cyan-700/40 bg-cyan-950/30 p-4 text-xs text-cyan-100">
              <p className="font-semibold">Accepted Ride Route Preview</p>
              <p className="mt-1">Pickup: {acceptedRide.pickup.name}</p>
              <p>Dropoff: {acceptedRide.dropoff.name}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
