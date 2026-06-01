'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { User } from 'firebase/auth';
import { onIdTokenChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import type { Database } from 'firebase/database';
import { limitToLast, onDisconnect, onValue, push, query, ref, remove, set, update } from 'firebase/database';
import { getFirebaseClientAuth, getFirebaseClientDatabase, getFirebaseClientSetupError } from '@/lib/firebase/client';
import {
  calculateAverageSpeedKph,
  calculateDistanceKm,
  calculateEtaMinutes,
  calculateTrackedDistanceKm,
  calculateTripEarnings,
  clearDriverDashboardCache,
  clearQueuedDriverMutations,
  normalizeChatCollection,
  normalizeDriverRecord,
  normalizeEarningCollection,
  normalizeLocationCollection,
  normalizePaymentCollection,
  normalizeRideCollection,
  readDriverDashboardCache,
  readQueuedDriverMutations,
  summarizeEarnings,
  trimLocationHistory,
  type ChatMessageRecord,
  type DriverAvailabilityStatus,
  type DriverDashboardCache,
  type DriverRecord,
  type EarningRecord,
  type LocationRecord,
  type PaymentRecord,
  type QueuedDriverMutation,
  type RideRecord,
  writeDriverDashboardCache,
  writeQueuedDriverMutations,
} from '@/lib/driver-dashboard/sync';

const LOCATION_SYNC_INTERVAL_MS = 5000;
const LOCATION_HISTORY_LIMIT = 100;
const RIDE_LIMIT = 25;
const EARNINGS_LIMIT = 100;
const PAYMENTS_LIMIT = 50;
const CHAT_LIMIT = 40;
const QUICK_REPLIES = [
  'I am on the way.',
  'Traffic is a little heavy but I am getting closer.',
  'I have arrived at the pickup point.',
  'Please share a landmark if you do not see me.',
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const message = 'message' in error ? error.message : undefined;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
    const code = 'code' in error ? error.code : undefined;
    if (typeof code === 'string' && code.trim()) {
      return code.trim();
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function getFallbackDriver(user: User): DriverRecord {
  return normalizeDriverRecord(
    {
      name: user.displayName || user.email?.split('@')[0] || 'Driver',
      email: user.email || '',
      status: 'offline',
      rating: 5,
      vehicle_info: {
        make: '',
        model: '',
        color: '',
        plate: '',
      },
      wallet_balance: 0,
      pending_balance: 0,
      active_hours_seconds: 0,
      last_status_changed_at: new Date().toISOString(),
    },
    user.uid,
    user.email || '',
  );
}

function toDurationMinutes(startedAt: string) {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return 1;
  return Math.max(1, Math.round((Date.now() - started) / (1000 * 60)));
}

export default function DriverDashboardRealtime() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [driver, setDriver] = useState<DriverRecord | null>(null);
  const [rides, setRides] = useState<RideRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [earnings, setEarnings] = useState<EarningRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageRecord[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [authError, setAuthError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(true);
  const [connectedToFirebase, setConnectedToFirebase] = useState(false);
  const [queuedMutationsCount, setQueuedMutationsCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const databaseRef = useRef<Database | null>(null);
  const cacheRef = useRef<DriverDashboardCache>({
    driver: null,
    rides: [],
    locations: [],
    earnings: [],
    payments: [],
    chatMessages: [],
  });
  const autoTransitionRef = useRef('');
  const locationSyncInFlightRef = useRef(false);

  const persistCache = useCallback((driverId: string, patch: Partial<DriverDashboardCache>) => {
    const nextCache = {
      ...cacheRef.current,
      ...patch,
    };
    cacheRef.current = nextCache;
    writeDriverDashboardCache(driverId, nextCache);
    setLastSyncAt(new Date().toISOString());
  }, []);

  const updateQueuedCount = useCallback((driverId: string) => {
    setQueuedMutationsCount(readQueuedDriverMutations(driverId).length);
  }, []);

  const applyDriverPatch = useCallback((driverId: string, nextDriver: DriverRecord | null) => {
    setDriver(nextDriver);
    persistCache(driverId, { driver: nextDriver });
  }, [persistCache]);

  const applyCollectionPatch = useCallback((driverId: string, patch: Partial<DriverDashboardCache>) => {
    if (patch.rides) setRides(patch.rides);
    if (patch.locations) setLocations(patch.locations);
    if (patch.earnings) setEarnings(patch.earnings);
    if (patch.payments) setPayments(patch.payments);
    if (patch.chatMessages) setChatMessages(patch.chatMessages);
    persistCache(driverId, patch);
  }, [persistCache]);

  const executeMutation = useCallback(async (mutation: QueuedDriverMutation) => {
    const database = databaseRef.current;
    if (!database) {
      throw new Error('Firebase Realtime Database is unavailable.');
    }

    if (mutation.mode === 'set') {
      await set(ref(database, mutation.path), mutation.payload);
      return;
    }

    if (mutation.mode === 'update') {
      await update(ref(database, mutation.path), mutation.payload);
      return;
    }

    await remove(ref(database, mutation.path));
  }, []);

  const queueMutation = useCallback((driverId: string, mutation: QueuedDriverMutation) => {
    const queue = [...readQueuedDriverMutations(driverId), mutation];
    writeQueuedDriverMutations(driverId, queue);
    setQueuedMutationsCount(queue.length);
  }, []);

  const runMutation = useCallback(async (driverId: string, mutation: QueuedDriverMutation) => {
    if (!browserOnline || !databaseRef.current) {
      queueMutation(driverId, mutation);
      setSyncError('You are offline. Changes were queued and will sync automatically.');
      return false;
    }

    try {
      await executeMutation(mutation);
      updateQueuedCount(driverId);
      setSyncError('');
      return true;
    } catch (error) {
      queueMutation(driverId, mutation);
      setSyncError(getErrorMessage(error, 'Live sync failed. The action was queued for retry.'));
      return false;
    }
  }, [browserOnline, executeMutation, queueMutation, updateQueuedCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncOnlineState = () => {
      setBrowserOnline(window.navigator.onLine);
    };
    syncOnlineState();
    window.addEventListener('online', syncOnlineState);
    window.addEventListener('offline', syncOnlineState);
    return () => {
      window.removeEventListener('online', syncOnlineState);
      window.removeEventListener('offline', syncOnlineState);
    };
  }, []);

  useEffect(() => {
    const error = getFirebaseClientSetupError();
    if (error) {
      setSetupError(error);
      return undefined;
    }

    try {
      const auth = getFirebaseClientAuth();
      databaseRef.current = getFirebaseClientDatabase();
      setSetupError(null);

      return onIdTokenChanged(auth, async (nextUser) => {
        if (nextUser) {
          try {
            await nextUser.getIdToken();
          } catch (error) {
            setAuthError(getErrorMessage(error, 'Failed to refresh your Firebase session.'));
          }
        }
        setFirebaseUser(nextUser);
        setAuthError('');
      });
    } catch (error) {
      setSetupError(getErrorMessage(error, 'Firebase setup is incomplete.'));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      cacheRef.current = {
        driver: null,
        rides: [],
        locations: [],
        earnings: [],
        payments: [],
        chatMessages: [],
      };
      setDriver(null);
      setRides([]);
      setLocations([]);
      setEarnings([]);
      setPayments([]);
      setChatMessages([]);
      setQueuedMutationsCount(0);
      setConnectedToFirebase(false);
      setLastSyncAt(null);
      return;
    }

    const cached = readDriverDashboardCache(firebaseUser.uid);
    const fallbackDriver = getFallbackDriver(firebaseUser);
    cacheRef.current = cached ?? {
      driver: fallbackDriver,
      rides: [],
      locations: [],
      earnings: [],
      payments: [],
      chatMessages: [],
    };
    setDriver(cacheRef.current.driver ?? fallbackDriver);
    setRides(cacheRef.current.rides);
    setLocations(cacheRef.current.locations);
    setEarnings(cacheRef.current.earnings);
    setPayments(cacheRef.current.payments);
    setChatMessages(cacheRef.current.chatMessages);
    updateQueuedCount(firebaseUser.uid);
  }, [firebaseUser, updateQueuedCount]);

  useEffect(() => {
    if (!firebaseUser || !databaseRef.current) return undefined;

    const driverId = firebaseUser.uid;
    const database = databaseRef.current;
    const driverRef = ref(database, `drivers/${driverId}`);
    const createdAt = new Date().toISOString();

    void update(driverRef, {
      driver_id: driverId,
      name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Driver',
      email: firebaseUser.email || '',
      rating: 5,
      status: cacheRef.current.driver?.status ?? 'offline',
      wallet_balance: cacheRef.current.driver?.wallet_balance ?? 0,
      pending_balance: cacheRef.current.driver?.pending_balance ?? 0,
      active_hours_seconds: cacheRef.current.driver?.active_hours_seconds ?? 0,
      last_status_changed_at: cacheRef.current.driver?.last_status_changed_at ?? createdAt,
      vehicle_info: cacheRef.current.driver?.vehicle_info ?? {},
    }).catch((error) => {
      setSyncError(getErrorMessage(error, 'Could not bootstrap the driver profile.'));
    });

    void onDisconnect(driverRef).update({
      status: 'offline',
      last_status_changed_at: new Date().toISOString(),
    }).catch(() => null);

    const unsubscribeConnected = onValue(ref(database, '.info/connected'), (snapshot) => {
      setConnectedToFirebase(Boolean(snapshot.val()));
    });

    const unsubscribeDriver = onValue(driverRef, (snapshot) => {
      const nextDriver = snapshot.exists()
        ? normalizeDriverRecord(snapshot.val(), driverId, firebaseUser.email || '')
        : getFallbackDriver(firebaseUser);
      applyDriverPatch(driverId, nextDriver);
    }, (error) => {
      setSyncError(getErrorMessage(error, 'Could not subscribe to the driver profile.'));
    });

    const unsubscribeRides = onValue(query(ref(database, `rides/${driverId}`), limitToLast(RIDE_LIMIT)), (snapshot) => {
      applyCollectionPatch(driverId, { rides: normalizeRideCollection(snapshot.val(), driverId) });
    }, (error) => {
      setSyncError(getErrorMessage(error, 'Could not subscribe to rides.'));
    });

    const unsubscribeLocations = onValue(
      query(ref(database, `locations/${driverId}`), limitToLast(LOCATION_HISTORY_LIMIT)),
      (snapshot) => {
        applyCollectionPatch(driverId, { locations: trimLocationHistory(normalizeLocationCollection(snapshot.val(), driverId), LOCATION_HISTORY_LIMIT) });
      },
      (error) => {
        setSyncError(getErrorMessage(error, 'Could not subscribe to live locations.'));
      },
    );

    const unsubscribeEarnings = onValue(query(ref(database, `earnings/${driverId}`), limitToLast(EARNINGS_LIMIT)), (snapshot) => {
      applyCollectionPatch(driverId, { earnings: normalizeEarningCollection(snapshot.val(), driverId) });
    }, (error) => {
      setSyncError(getErrorMessage(error, 'Could not subscribe to earnings.'));
    });

    const unsubscribePayments = onValue(query(ref(database, `payments/${driverId}`), limitToLast(PAYMENTS_LIMIT)), (snapshot) => {
      applyCollectionPatch(driverId, { payments: normalizePaymentCollection(snapshot.val(), driverId) });
    }, (error) => {
      setSyncError(getErrorMessage(error, 'Could not subscribe to payments.'));
    });

    const unsubscribeChat = onValue(query(ref(database, `chatMessages/${driverId}`), limitToLast(CHAT_LIMIT)), (snapshot) => {
      applyCollectionPatch(driverId, { chatMessages: normalizeChatCollection(snapshot.val(), driverId) });
    }, (error) => {
      setSyncError(getErrorMessage(error, 'Could not subscribe to chat messages.'));
    });

    return () => {
      unsubscribeConnected();
      unsubscribeDriver();
      unsubscribeRides();
      unsubscribeLocations();
      unsubscribeEarnings();
      unsubscribePayments();
      unsubscribeChat();
    };
  }, [applyCollectionPatch, applyDriverPatch, firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !browserOnline || !databaseRef.current) return undefined;

    let cancelled = false;

    const flushQueue = async () => {
      const queued = readQueuedDriverMutations(firebaseUser.uid);
      if (!queued.length) {
        setQueuedMutationsCount(0);
        return;
      }

      const remaining: QueuedDriverMutation[] = [];
      for (const mutation of queued) {
        try {
          await executeMutation(mutation);
        } catch {
          remaining.push(mutation);
        }
      }

      if (!cancelled) {
        writeQueuedDriverMutations(firebaseUser.uid, remaining);
        setQueuedMutationsCount(remaining.length);
        if (!remaining.length) {
          setSyncError('');
        }
      }
    };

    void flushQueue();

    return () => {
      cancelled = true;
    };
  }, [browserOnline, executeMutation, firebaseUser]);

  const activeRide = useMemo(() => rides.find((ride) => ['requested', 'accepted', 'arrived', 'started'].includes(ride.status)) ?? null, [rides]);
  const incomingRides = useMemo(() => rides.filter((ride) => ride.status === 'requested'), [rides]);
  const latestLocation = useMemo(() => locations[locations.length - 1] ?? null, [locations]);
  const trackedDistanceKm = useMemo(() => calculateTrackedDistanceKm(locations), [locations]);
  const averageSpeedKph = useMemo(() => calculateAverageSpeedKph(locations), [locations]);
  const earningsSummary = useMemo(() => summarizeEarnings(earnings, payments), [earnings, payments]);
  const distanceToPickupKm = useMemo(() => {
    if (!activeRide || !latestLocation || !['requested', 'accepted', 'arrived'].includes(activeRide.status)) return null;
    return calculateDistanceKm(latestLocation, activeRide.pickup);
  }, [activeRide, latestLocation]);
  const distanceToDropoffKm = useMemo(() => {
    if (!activeRide || !latestLocation || !['started', 'ended'].includes(activeRide.status)) return null;
    return calculateDistanceKm(latestLocation, activeRide.dropoff);
  }, [activeRide, latestLocation]);

  const syncDriverStatus = useCallback(async (nextStatus: DriverAvailabilityStatus) => {
    if (!firebaseUser) return;
    setStatusLoading(true);
    const now = new Date().toISOString();
    const activeHoursSeconds = driver?.status === 'online' && driver.last_status_changed_at
      ? driver.active_hours_seconds + Math.max(0, Math.round((Date.now() - new Date(driver.last_status_changed_at).getTime()) / 1000))
      : driver?.active_hours_seconds ?? 0;

    const nextDriver = normalizeDriverRecord({
      ...(driver ?? getFallbackDriver(firebaseUser)),
      status: nextStatus,
      last_status_changed_at: now,
      active_hours_seconds: activeHoursSeconds,
    }, firebaseUser.uid, firebaseUser.email || '');

    applyDriverPatch(firebaseUser.uid, nextDriver);
    await runMutation(firebaseUser.uid, {
      path: `drivers/${firebaseUser.uid}`,
      mode: 'update',
      payload: {
        driver_id: firebaseUser.uid,
        name: nextDriver.name,
        phone: nextDriver.phone,
        email: nextDriver.email,
        rating: nextDriver.rating,
        status: nextDriver.status,
        vehicle_info: nextDriver.vehicle_info,
        wallet_balance: nextDriver.wallet_balance,
        pending_balance: nextDriver.pending_balance,
        last_status_changed_at: nextDriver.last_status_changed_at,
        active_hours_seconds: nextDriver.active_hours_seconds,
        last_location: nextDriver.last_location,
      },
      createdAt: now,
    });
    setStatusLoading(false);
  }, [applyDriverPatch, driver, firebaseUser, runMutation]);

  const syncLocation = useCallback(async (reason: 'manual' | 'interval') => {
    if (!firebaseUser || !databaseRef.current || locationSyncInFlightRef.current) return;
    if (typeof window === 'undefined' || !('geolocation' in window.navigator)) {
      setLocationError('Geolocation is not available in this browser.');
      return;
    }

    locationSyncInFlightRef.current = true;

    window.navigator.geolocation.getCurrentPosition(async (position) => {
      const timestamp = new Date(position.timestamp || Date.now()).toISOString();
      const locationRef = push(ref(databaseRef.current!, `locations/${firebaseUser.uid}`));
      const locationId = locationRef.key ?? `loc_${Date.now()}`;
      const payload = {
        location_id: locationId,
        driver_id: firebaseUser.uid,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp,
        accuracy: position.coords.accuracy,
        reason,
      };

      const nextLocation = {
        location_id: locationId,
        driver_id: firebaseUser.uid,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp,
        accuracy: position.coords.accuracy,
      } satisfies LocationRecord;

      const nextLocations = trimLocationHistory([...locations, nextLocation], LOCATION_HISTORY_LIMIT);
      applyCollectionPatch(firebaseUser.uid, { locations: nextLocations });
      if (driver) {
        applyDriverPatch(firebaseUser.uid, {
          ...driver,
          last_location: {
            latitude: nextLocation.latitude,
            longitude: nextLocation.longitude,
            timestamp: nextLocation.timestamp,
          },
        });
      }

      const writeSucceeded = await runMutation(firebaseUser.uid, {
        path: `locations/${firebaseUser.uid}/${locationId}`,
        mode: 'set',
        payload,
        createdAt: timestamp,
      });

      if (writeSucceeded) {
        await runMutation(firebaseUser.uid, {
          path: `drivers/${firebaseUser.uid}`,
          mode: 'update',
          payload: {
            last_location: {
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              timestamp: nextLocation.timestamp,
            },
          },
          createdAt: timestamp,
        });

        if (locations.length >= LOCATION_HISTORY_LIMIT) {
          const oldestLocation = [...locations].sort((left, right) => left.timestamp.localeCompare(right.timestamp))[0];
          if (oldestLocation) {
            await runMutation(firebaseUser.uid, {
              path: `locations/${firebaseUser.uid}/${oldestLocation.location_id}`,
              mode: 'remove',
              payload: {},
              createdAt: timestamp,
            });
          }
        }
      }

      setLocationError('');
      locationSyncInFlightRef.current = false;
    }, (error) => {
      setLocationError(getErrorMessage(error, 'Unable to fetch your live location.'));
      locationSyncInFlightRef.current = false;
    }, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 10000,
    });
  }, [applyCollectionPatch, applyDriverPatch, driver, firebaseUser, locations, runMutation]);

  useEffect(() => {
    if (!firebaseUser || !driver) return undefined;
    if (!['online', 'busy', 'on_trip'].includes(driver.status)) return undefined;

    const interval = window.setInterval(() => {
      void syncLocation('interval');
    }, LOCATION_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [driver, firebaseUser, syncLocation]);

  const commitRideStatus = useCallback(async (ride: RideRecord, nextStatus: RideRecord['status']) => {
    if (!firebaseUser) return;

    const now = new Date().toISOString();
    const durationMinutes = toDurationMinutes(ride.created_at);
    const tripDistanceKm = Math.max(calculateDistanceKm(ride.pickup, ride.dropoff), trackedDistanceKm);
    const fare = calculateTripEarnings({
      distanceKm: tripDistanceKm,
      durationMinutes,
      surgeMultiplier: driver?.status === 'busy' || driver?.status === 'on_trip' ? 1.15 : 1,
    });

    const updatedRide: RideRecord = {
      ...ride,
      driver_id: firebaseUser.uid,
      status: nextStatus,
      updated_at: now,
      cancelled_at: nextStatus === 'cancelled' ? now : null,
      earnings: ['ended', 'completed'].includes(nextStatus) ? Number(fare.total.toFixed(2)) : ride.earnings,
    };

    applyCollectionPatch(firebaseUser.uid, {
      rides: rides.map((currentRide) => currentRide.ride_id === ride.ride_id ? updatedRide : currentRide),
    });

    await runMutation(firebaseUser.uid, {
      path: `rides/${firebaseUser.uid}/${ride.ride_id}`,
      mode: 'set',
      payload: updatedRide,
      createdAt: now,
    });

    if (nextStatus === 'accepted') {
      await syncDriverStatus('busy');
      return;
    }

    if (nextStatus === 'started') {
      await syncDriverStatus('on_trip');
      return;
    }

    if (nextStatus === 'cancelled' || nextStatus === 'no_show') {
      await syncDriverStatus('online');
      return;
    }

    if (!['ended', 'completed'].includes(nextStatus)) {
      return;
    }

    const earningRecords: EarningRecord[] = [
      {
        earnings_id: `${ride.ride_id}-base`,
        driver_id: firebaseUser.uid,
        amount: Number((fare.base + fare.distance + fare.time).toFixed(2)),
        trip_id: ride.ride_id,
        date: now,
        type: 'base',
      },
    ];

    if (fare.surge > 0) {
      earningRecords.push({
        earnings_id: `${ride.ride_id}-surge`,
        driver_id: firebaseUser.uid,
        amount: Number(fare.surge.toFixed(2)),
        trip_id: ride.ride_id,
        date: now,
        type: 'surge',
      });
    }

    const paymentRecord: PaymentRecord = {
      payment_id: `${ride.ride_id}-payment`,
      driver_id: firebaseUser.uid,
      amount: Number(fare.total.toFixed(2)),
      status: 'pending',
      method: 'wallet',
      date: now,
    };

    applyCollectionPatch(firebaseUser.uid, {
      earnings: [...earnings, ...earningRecords].sort((left, right) => right.date.localeCompare(left.date)),
      payments: [paymentRecord, ...payments.filter((payment) => payment.payment_id !== paymentRecord.payment_id)],
    });

    for (const earningRecord of earningRecords) {
      await runMutation(firebaseUser.uid, {
        path: `earnings/${firebaseUser.uid}/${earningRecord.earnings_id}`,
        mode: 'set',
        payload: earningRecord,
        createdAt: now,
      });
    }

    await runMutation(firebaseUser.uid, {
      path: `payments/${firebaseUser.uid}/${paymentRecord.payment_id}`,
      mode: 'set',
      payload: paymentRecord,
      createdAt: now,
    });

    await runMutation(firebaseUser.uid, {
      path: `drivers/${firebaseUser.uid}`,
      mode: 'update',
      payload: {
        wallet_balance: Number((earningsSummary.walletBalance + fare.total).toFixed(2)),
        pending_balance: Number((earningsSummary.pendingPayments + fare.total).toFixed(2)),
      },
      createdAt: now,
    });

    await syncDriverStatus('online');
  }, [applyCollectionPatch, driver, earnings, earningsSummary.pendingPayments, earningsSummary.walletBalance, firebaseUser, payments, rides, runMutation, syncDriverStatus, trackedDistanceKm]);

  useEffect(() => {
    if (!activeRide || !latestLocation) return;

    const transitionKey = `${activeRide.ride_id}:${activeRide.status}`;
    if (autoTransitionRef.current === transitionKey) return;

    if (activeRide.status === 'accepted' && distanceToPickupKm !== null && distanceToPickupKm <= 0.05) {
      autoTransitionRef.current = transitionKey;
      void commitRideStatus(activeRide, 'arrived');
      return;
    }

    if (activeRide.status === 'started' && distanceToDropoffKm !== null && distanceToDropoffKm <= 0.1) {
      autoTransitionRef.current = transitionKey;
      void commitRideStatus(activeRide, 'ended');
    }
  }, [activeRide, commitRideStatus, distanceToDropoffKm, distanceToPickupKm, latestLocation]);

  const sendChatMessage = useCallback(async (messageBody: string) => {
    if (!firebaseUser || !activeRide) return;
    const trimmed = messageBody.trim();
    if (!trimmed) return;

    const messageRef = push(ref(databaseRef.current!, `chatMessages/${firebaseUser.uid}`));
    const messageId = messageRef.key ?? `msg_${Date.now()}`;
    const message: ChatMessageRecord = {
      message_id: messageId,
      driver_id: firebaseUser.uid,
      trip_id: activeRide.ride_id,
      sender: 'driver',
      body: trimmed,
      created_at: new Date().toISOString(),
      read_at: null,
      deleted_at: null,
      voice_note_url: null,
    };

    applyCollectionPatch(firebaseUser.uid, { chatMessages: [...chatMessages, message].sort((left, right) => left.created_at.localeCompare(right.created_at)) });
    const succeeded = await runMutation(firebaseUser.uid, {
      path: `chatMessages/${firebaseUser.uid}/${messageId}`,
      mode: 'set',
      payload: message,
      createdAt: message.created_at,
    });
    if (succeeded) {
      setChatDraft('');
    }
  }, [activeRide, applyCollectionPatch, chatMessages, firebaseUser, runMutation]);

  const markMessageRead = useCallback(async (message: ChatMessageRecord) => {
    if (!firebaseUser || message.read_at || message.deleted_at) return;
    const readAt = new Date().toISOString();
    applyCollectionPatch(firebaseUser.uid, {
      chatMessages: chatMessages.map((entry) => entry.message_id === message.message_id ? { ...entry, read_at: readAt } : entry),
    });
    await runMutation(firebaseUser.uid, {
      path: `chatMessages/${firebaseUser.uid}/${message.message_id}`,
      mode: 'update',
      payload: { read_at: readAt },
      createdAt: readAt,
    });
  }, [applyCollectionPatch, chatMessages, firebaseUser, runMutation]);

  const softDeleteMessage = useCallback(async (message: ChatMessageRecord) => {
    if (!firebaseUser || message.deleted_at) return;
    const deletedAt = new Date().toISOString();
    applyCollectionPatch(firebaseUser.uid, {
      chatMessages: chatMessages.map((entry) => entry.message_id === message.message_id
        ? { ...entry, body: '', deleted_at: deletedAt }
        : entry),
    });
    await runMutation(firebaseUser.uid, {
      path: `chatMessages/${firebaseUser.uid}/${message.message_id}`,
      mode: 'update',
      payload: { body: '', deleted_at: deletedAt },
      createdAt: deletedAt,
    });
  }, [applyCollectionPatch, chatMessages, firebaseUser, runMutation]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authLoading) return;

    setAuthLoading(true);
    setAuthError('');

    try {
      await signInWithEmailAndPassword(getFirebaseClientAuth(), email.trim(), password);
      setPassword('');
    } catch (error) {
      setAuthError(getErrorMessage(error, 'Unable to sign in with Firebase Auth.'));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    if (!firebaseUser) return;

    await syncDriverStatus('offline');
    clearDriverDashboardCache(firebaseUser.uid);
    clearQueuedDriverMutations(firebaseUser.uid);
    await signOut(getFirebaseClientAuth());
  }

  const metrics = [
    { label: 'Wallet balance', value: formatCurrency(earningsSummary.walletBalance) },
    { label: 'Daily earnings', value: formatCurrency(earningsSummary.daily) },
    { label: 'Weekly earnings', value: formatCurrency(earningsSummary.weekly) },
    { label: 'Pending payouts', value: formatCurrency(earningsSummary.pendingPayments) },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">Firebase Realtime Driver Ops</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">Driver dashboard live sync</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300">
                This dashboard connects rides, live GPS updates, earnings, payouts, driver status, and chat directly to Firebase Realtime Database.
                It also caches the latest state locally and queues writes while offline.
              </p>
            </div>

            <div className="grid gap-2 text-sm text-slate-200">
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">Browser</span>
                <span className={browserOnline ? 'text-emerald-300' : 'text-amber-300'}>
                  {browserOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">Firebase</span>
                <span className={connectedToFirebase ? 'text-emerald-300' : 'text-slate-300'}>
                  {connectedToFirebase ? 'Connected' : 'Waiting for realtime connection'}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">Queued writes</span>
                <span>{queuedMutationsCount}</span>
              </div>
            </div>
          </div>

          {lastSyncAt && (
            <p className="mt-4 text-xs text-slate-400">Last local sync update: {formatDateTime(lastSyncAt)}</p>
          )}
        </header>

        {setupError ? (
          <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">
            <h2 className="text-lg font-semibold">Firebase setup required</h2>
            <p className="mt-3">{setupError}</p>
            <p className="mt-3">
              Add the Firebase web app keys plus <code className="rounded bg-black/20 px-1 py-0.5">NEXT_PUBLIC_FIREBASE_DATABASE_URL</code>,
              then apply the rules in <code className="rounded bg-black/20 px-1 py-0.5">/docs/firebase-driver-dashboard.rules.json</code>.
            </p>
            <Link href="/login" className="mt-4 inline-flex rounded-full border border-white/20 px-4 py-2 text-white transition hover:bg-white/10">
              Open existing sign-in page
            </Link>
          </section>
        ) : null}

        {syncError ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {syncError}
          </div>
        ) : null}

        {locationError ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {locationError}
          </div>
        ) : null}

        {!firebaseUser ? (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
            <form onSubmit={handleLogin} className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
              <h2 className="text-xl font-semibold">Driver sign-in</h2>
              <p className="mt-2 text-sm text-slate-300">
                Use Firebase Auth email/password credentials. Firebase handles token refresh automatically while the dashboard keeps realtime listeners active.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Email</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Password</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
              </div>

              {authError ? (
                <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{authError}</p>
              ) : null}

              <button
                type="submit"
                disabled={authLoading || Boolean(setupError)}
                className="mt-5 inline-flex w-full justify-center rounded-full bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {authLoading ? 'Connecting…' : 'Sign in with Firebase'}
              </button>
            </form>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
              <h2 className="text-xl font-semibold">What syncs live</h2>
              <ul className="mt-4 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
                <li className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">Incoming ride requests and ride status updates</li>
                <li className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">Driver online/offline/busy state with timestamps</li>
                <li className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">GPS location batches every 5 seconds with last-100 cleanup</li>
                <li className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">Wallet, earnings breakdown, and payout states</li>
                <li className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">Offline cache and queued write replay when connectivity returns</li>
                <li className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">Realtime passenger chat listener with read and soft-delete states</li>
              </ul>
            </section>
          </section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Signed in as</p>
                    <h2 className="text-2xl font-semibold">{driver?.name || firebaseUser.email || 'Driver'}</h2>
                    <p className="text-sm text-slate-300">{firebaseUser.email}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['offline', 'online', 'busy', 'on_trip'] as DriverAvailabilityStatus[]).map((statusOption) => (
                      <button
                        key={statusOption}
                        type="button"
                        disabled={statusLoading}
                        onClick={() => { void syncDriverStatus(statusOption); }}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          driver?.status === statusOption
                            ? 'bg-emerald-400 text-slate-950'
                            : 'border border-white/10 bg-slate-900/80 text-white hover:bg-white/10'
                        }`}
                      >
                        {statusOption.replace('_', ' ')}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { void handleLogout(); }}
                      className="rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                    >
                      Logout
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-4">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Live location tracking</h2>
                    <p className="mt-2 text-sm text-slate-300">
                      GPS updates are sent every 5 seconds while you are online, busy, or on trip.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void syncLocation('manual'); }}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Sync now
                  </button>
                </div>

                <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                    <dt className="text-slate-400">Last coordinate</dt>
                    <dd className="mt-2 text-white">
                      {latestLocation ? `${latestLocation.latitude.toFixed(5)}, ${latestLocation.longitude.toFixed(5)}` : 'Awaiting first GPS fix'}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                    <dt className="text-slate-400">Distance tracked</dt>
                    <dd className="mt-2 text-white">{trackedDistanceKm.toFixed(2)} km</dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                    <dt className="text-slate-400">Average speed</dt>
                    <dd className="mt-2 text-white">{averageSpeedKph.toFixed(1)} km/h</dd>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                    <dt className="text-slate-400">History retained</dt>
                    <dd className="mt-2 text-white">{locations.length} / {LOCATION_HISTORY_LIMIT} points</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Ride synchronization</h2>
                    <p className="mt-2 text-sm text-slate-300">
                      Incoming ride requests, ride lifecycle changes, cancellations, and passenger details are streamed live from Firebase.
                    </p>
                  </div>
                  <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                    {incomingRides.length} new request{incomingRides.length === 1 ? '' : 's'}
                  </div>
                </div>

                {activeRide ? (
                  <div className="mt-5 rounded-3xl border border-white/10 bg-slate-900/70 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm text-slate-400">Current trip</p>
                        <h3 className="text-2xl font-semibold text-white">{activeRide.passenger_name}</h3>
                        <p className="mt-1 text-sm text-slate-300">{activeRide.passenger_phone || 'No passenger phone on record'}</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm capitalize text-white">
                        {activeRide.status.replace('_', ' ')}
                      </span>
                    </div>

                    <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <dt className="text-slate-400">Pickup</dt>
                        <dd className="mt-2 text-white">{activeRide.pickup.address}</dd>
                        {distanceToPickupKm !== null ? (
                          <p className="mt-2 text-emerald-300">
                            {distanceToPickupKm.toFixed(2)} km away · ETA {calculateEtaMinutes(distanceToPickupKm, averageSpeedKph || 28)} min
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <dt className="text-slate-400">Dropoff</dt>
                        <dd className="mt-2 text-white">{activeRide.dropoff.address}</dd>
                        {distanceToDropoffKm !== null ? (
                          <p className="mt-2 text-emerald-300">
                            {distanceToDropoffKm.toFixed(2)} km remaining · ETA {calculateEtaMinutes(distanceToDropoffKm, averageSpeedKph || 28)} min
                          </p>
                        ) : null}
                      </div>
                    </dl>

                    <div className="mt-5 flex flex-wrap gap-3">
                      {activeRide.status === 'requested' ? (
                        <button type="button" onClick={() => { void commitRideStatus(activeRide, 'accepted'); }} className="rounded-full bg-emerald-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-300">
                          Accept
                        </button>
                      ) : null}
                      {activeRide.status === 'accepted' ? (
                        <button type="button" onClick={() => { void commitRideStatus(activeRide, 'arrived'); }} className="rounded-full border border-white/10 bg-slate-800 px-4 py-2 font-medium text-white transition hover:bg-slate-700">
                          Mark arrived
                        </button>
                      ) : null}
                      {activeRide.status === 'arrived' ? (
                        <button type="button" onClick={() => { void commitRideStatus(activeRide, 'started'); }} className="rounded-full bg-emerald-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-300">
                          Start trip
                        </button>
                      ) : null}
                      {activeRide.status === 'started' ? (
                        <button type="button" onClick={() => { void commitRideStatus(activeRide, 'ended'); }} className="rounded-full bg-emerald-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-300">
                          End trip
                        </button>
                      ) : null}
                      {['requested', 'accepted', 'arrived', 'started'].includes(activeRide.status) ? (
                        <button type="button" onClick={() => { void commitRideStatus(activeRide, 'cancelled'); }} className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 font-medium text-rose-100 transition hover:bg-rose-400/20">
                          Cancel ride
                        </button>
                      ) : null}
                      {['requested', 'accepted', 'arrived'].includes(activeRide.status) ? (
                        <button type="button" onClick={() => { void commitRideStatus(activeRide, 'no_show'); }} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 font-medium text-amber-100 transition hover:bg-amber-400/20">
                          Rider no-show
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-slate-900/50 p-6 text-sm text-slate-300">
                    No active ride is assigned yet. As soon as a ride is written to <code className="rounded bg-black/20 px-1 py-0.5">rides/{firebaseUser.uid}</code>, it will appear here instantly.
                  </div>
                )}

                <div className="mt-5 overflow-hidden rounded-3xl border border-white/10">
                  <table className="min-w-full divide-y divide-white/10 text-sm">
                    <thead className="bg-slate-900/80 text-left text-slate-300">
                      <tr>
                        <th className="px-4 py-3 font-medium">Passenger</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Pickup</th>
                        <th className="px-4 py-3 font-medium">Created</th>
                        <th className="px-4 py-3 font-medium">Earnings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 bg-slate-950/40">
                      {rides.length ? rides.map((ride) => (
                        <tr key={ride.ride_id}>
                          <td className="px-4 py-3 text-white">{ride.passenger_name}</td>
                          <td className="px-4 py-3 capitalize text-slate-200">{ride.status.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-slate-300">{ride.pickup.address}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDateTime(ride.created_at)}</td>
                          <td className="px-4 py-3 text-slate-300">{formatCurrency(ride.earnings)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-slate-400">No rides synced yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
                  <h2 className="text-xl font-semibold">Payments & earnings</h2>
                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                      <p className="text-slate-400">Monthly total</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(earningsSummary.monthly)}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                        <p className="text-slate-400">Base + time + distance</p>
                        <p className="mt-2 text-white">{formatCurrency(earningsSummary.byType.base)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                        <p className="text-slate-400">Surge / bonuses / tips</p>
                        <p className="mt-2 text-white">
                          {formatCurrency(earningsSummary.byType.surge + earningsSummary.byType.bonus + earningsSummary.byType.tip)}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">Realtime chat</h2>
                      <p className="mt-2 text-sm text-slate-300">Quick replies and read states stay in sync via Firebase.</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {QUICK_REPLIES.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        onClick={() => { void sendChatMessage(reply); }}
                        disabled={!activeRide}
                        className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendChatMessage(chatDraft);
                    }}
                    className="mt-4 flex gap-3"
                  >
                    <input
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      placeholder={activeRide ? 'Type a message to the passenger' : 'Chat activates when a ride is live'}
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                      disabled={!activeRide}
                    />
                    <button
                      type="submit"
                      disabled={!activeRide || !chatDraft.trim()}
                      className="rounded-full bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Send
                    </button>
                  </form>

                  <div className="mt-4 space-y-3">
                    {chatMessages.length ? chatMessages.slice(-8).map((message) => (
                      <article key={message.message_id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium capitalize text-white">{message.sender}</p>
                            <p className="mt-1 text-slate-300">
                              {message.deleted_at ? 'Message deleted' : message.body || 'Voice note'}
                            </p>
                            {message.voice_note_url ? (
                              <a href={message.voice_note_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-emerald-300 hover:text-emerald-200">
                                Open voice note
                              </a>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-400">{formatDateTime(message.created_at)}</p>
                        </div>
                        <div className="mt-3 flex gap-2 text-xs">
                          {!message.read_at ? (
                            <button type="button" onClick={() => { void markMessageRead(message); }} className="rounded-full border border-white/10 px-3 py-1 text-slate-200 transition hover:bg-white/10">
                              Mark read
                            </button>
                          ) : (
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">Read</span>
                          )}
                          {!message.deleted_at ? (
                            <button type="button" onClick={() => { void softDeleteMessage(message); }} className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-rose-100 transition hover:bg-rose-400/20">
                              Soft delete
                            </button>
                          ) : null}
                        </div>
                      </article>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-slate-400">
                        No chat messages have been synced yet.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
