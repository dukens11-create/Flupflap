"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface CartItem {
  id: string;
  title: string;
  priceCents: number;
  shippingCents: number;
  shippingMode?: string;
  imageUrl: string;
  quantity: number;
  pickupAvailable?: boolean;
  pickupCity?: string;
  pickupState?: string;
}

type RateQuote = {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  deliveryDays: number | null;
};

type MapboxContextItem = {
  id?: string;
  text?: string;
  short_code?: string;
};

type MapboxFeature = {
  id: string;
  address?: string;
  text?: string;
  place_name?: string;
  context?: MapboxContextItem[];
};

type AddressSuggestion = {
  id: string;
  label: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  'puerto rico': 'PR', 'guam': 'GU', 'virgin islands': 'VI',
  'american samoa': 'AS', 'northern mariana islands': 'MP',
};

type ShipGroup = {
  sellerId: string;
  sellerName: string;
  shipmentId: string;
  rates: RateQuote[];
  /** Precomputed minimum delivery days across rates (null if no rates have delivery days). */
  minDeliveryDays: number | null;
};

type SelectedRate = {
  sellerId: string;
  shipmentId: string;
  rateId: string;
  rateCents: number;
  carrier: string;
  service: string;
  deliveryDays: number | null;
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Safely converts a rate string (e.g. "8.50") to integer cents. Returns 0 for non-numeric inputs. */
function convertRateToCents(rate: string | number): number {
  const n = Number(rate);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isCalculatedShipping(item: Pick<CartItem, 'shippingMode' | 'shippingCents'>): boolean {
  return item.shippingMode === 'CALCULATED' || (!item.shippingMode && item.shippingCents === 0);
}

function getMapboxContextValue(context: MapboxContextItem[] | undefined, prefix: string): string {
  return context?.find(item => item.id?.startsWith(`${prefix}.`))?.text?.trim() || '';
}

function getMapboxStateCode(context: MapboxContextItem[] | undefined): string {
  const region = context?.find(item => item.id?.startsWith('region.'));
  const shortCode = region?.short_code?.split('-').pop()?.trim().toUpperCase();
  if (shortCode) return shortCode;
  const regionText = region?.text?.trim() || '';
  if (regionText.length <= 2) return regionText.toUpperCase();
  return US_STATE_NAME_TO_ABBR[regionText.toLowerCase()] || '';
}

function parseMapboxFeature(feature: MapboxFeature): AddressSuggestion | null {
  const houseNumber = feature.address?.trim() || '';
  const streetName = feature.text?.trim() || '';
  const street1 = [houseNumber, streetName].filter(Boolean).join(' ').trim();
  const city = getMapboxContextValue(feature.context, 'place');
  const state = getMapboxStateCode(feature.context);
  const zip = getMapboxContextValue(feature.context, 'postcode');
  const country = feature.context?.find(item => item.id?.startsWith('country.'))?.short_code?.trim().toUpperCase() || 'US';

  if (!street1 || !city || !state || !zip) {
    return null;
  }

  return {
    id: feature.id,
    label: feature.place_name?.trim() || street1,
    street1,
    city,
    state,
    zip,
    country,
  };
}

function itemShippingLabel(item: CartItem, isPickup: boolean): React.ReactNode {
  if (isPickup) return <span className="text-green-700 font-medium"> · Free pickup</span>;
  if (item.shippingMode === 'FREE') return <span className="text-green-700 font-medium"> · Free shipping</span>;
  if (isCalculatedShipping(item)) return <span className="text-slate-400"> · Shipping calculated at checkout</span>;
  if (item.shippingCents > 0) return <span> · {dollars(item.shippingCents)} shipping</span>;
  return null;
}

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim();
  const addressAutocompleteRef = useRef<HTMLDivElement | null>(null);
  const selectedAutocompleteStreetRef = useRef('');
  const rateRequestVersionRef = useRef(0);
  const taxRequestVersionRef = useRef(0);
  const shippingNameInitializedRef = useRef(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  // Track which items the buyer chose pickup for (item id → true = pickup)
  const [pickupChoices, setPickupChoices] = useState<Record<string, boolean>>({});

  // Live shipping rate state
  const [buyerName, setBuyerName] = useState('');
  const [buyerStreet1, setBuyerStreet1] = useState('');
  const [buyerStreet2, setBuyerStreet2] = useState('');
  const [buyerCity, setBuyerCity] = useState('');
  const [buyerState, setBuyerState] = useState('');
  const [buyerZip, setBuyerZip] = useState('');
  const [buyerCountry, setBuyerCountry] = useState('US');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressDropdownOpen, setAddressDropdownOpen] = useState(false);
  const [fetchingAddressSuggestions, setFetchingAddressSuggestions] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState('');
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [rateGroups, setRateGroups] = useState<ShipGroup[]>([]);
  const [selectedRates, setSelectedRates] = useState<SelectedRate[]>([]);
  const [fetchingRates, setFetchingRates] = useState(false);
  const [rateError, setRateError] = useState('');
  const [ratesFetched, setRatesFetched] = useState(false);
  const [taxCents, setTaxCents] = useState(0);
  const [taxCalculating, setTaxCalculating] = useState(false);
  const [taxCalculated, setTaxCalculated] = useState(false);
  const [taxError, setTaxError] = useState('');
  const [taxFallbackApplied, setTaxFallbackApplied] = useState(false);
  const [finalTotalCents, setFinalTotalCents] = useState(0);

  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem('flupflap_cart') || '[]'));
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (shippingNameInitializedRef.current || status === 'loading') {
      return;
    }

    shippingNameInitializedRef.current = true;
    if (session?.user?.name?.trim()) {
      setBuyerName(session.user.name);
    }
  }, [session?.user?.name, status]);

  useEffect(() => {
    if (!mapboxToken && process.env.NODE_ENV === 'development') {
      console.warn('[checkout/address-autocomplete] NEXT_PUBLIC_MAPBOX_TOKEN is not set; falling back to manual address entry.');
    }
  }, [mapboxToken]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!addressAutocompleteRef.current?.contains(event.target as Node)) {
        setAddressDropdownOpen(false);
        setHighlightedSuggestionIndex(-1);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  // Items that support pickup
  const pickupEligibleIds = useMemo(
    () => new Set(items.filter(i => i.pickupAvailable).map(i => i.id)),
    [items],
  );

  const isPickup = useCallback(
    (itemId: string): boolean => pickupEligibleIds.has(itemId) && !!pickupChoices[itemId],
    [pickupEligibleIds, pickupChoices],
  );

  // Check if any non-pickup items need live shipping rates
  const hasCalculatedShipping = useMemo(
    () => items.some(i => !isPickup(i.id) && isCalculatedShipping(i)),
    [items, isPickup],
  );

  const nonPickupItems = useMemo(
    () => items.filter(i => !isPickup(i.id)),
    [items, isPickup],
  );
  const calculatedShippingItems = useMemo(
    () => nonPickupItems.filter(i => isCalculatedShipping(i)),
    [nonPickupItems],
  );

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.priceCents * i.quantity, 0),
    [items],
  );

  // Shipping from selected live rates
  const liveShippingCents = useMemo(
    () => selectedRates.reduce((s, r) => s + r.rateCents, 0),
    [selectedRates],
  );

  // Flat shipping from products that don't use live rates
  const flatShipping = useMemo(
    () =>
      items.reduce((s, i) => {
        if (isPickup(i.id)) return s;
        if (isCalculatedShipping(i)) return s;
        if (i.shippingMode === 'FREE') return s;
        return s + i.shippingCents * i.quantity;
      }, 0),
    [items, isPickup],
  );

  const totalShipping = hasCalculatedShipping ? liveShippingCents + flatShipping : flatShipping;
  const total = subtotal + totalShipping;
  const requiredRateSellerIds = useMemo(
    () => new Set(rateGroups.map(group => group.sellerId)),
    [rateGroups],
  );
  const hasCompleteShippingSelection = useMemo(() => {
    if (!hasCalculatedShipping) return true;
    if (!ratesFetched) return false;
    if (!rateGroups.length) return false;
    return Array.from(requiredRateSellerIds).every((sellerId) => {
      const selectedRate = selectedRates.find(rate => rate.sellerId === sellerId);
      return !!selectedRate
        && !!selectedRate.shipmentId
        && !!selectedRate.rateId
        && selectedRate.rateCents > 0;
    });
  }, [hasCalculatedShipping, rateGroups, ratesFetched, requiredRateSellerIds, selectedRates]);

  const pickupItemIds = useMemo(
    () => items.filter(i => isPickup(i.id)).map(i => i.id),
    [items, isPickup],
  );
  const allPickup = pickupItemIds.length > 0 && pickupItemIds.length === items.length;

  const buyerAddressComplete = useMemo(() => !!(
    buyerName.trim()
    && buyerStreet1.trim()
    && buyerCity.trim()
    && buyerState.trim()
    && buyerZip.trim()
    && buyerCountry.trim()
  ), [buyerCity, buyerCountry, buyerName, buyerState, buyerStreet1, buyerZip]);

  const buyerAddress = useMemo(() => ({
    name: buyerName.trim() || 'Buyer',
    street1: buyerStreet1.trim(),
    street2: buyerStreet2.trim() || undefined,
    city: buyerCity.trim(),
    state: buyerState.trim(),
    zip: buyerZip.trim(),
    country: buyerCountry.trim() || 'US',
  }), [buyerCity, buyerCountry, buyerName, buyerState, buyerStreet1, buyerStreet2, buyerZip]);

  const shippingReady = hasCompleteShippingSelection && !fetchingRates && !rateError;
  const taxReady = taxCalculated && !taxCalculating && !taxError;
  const taxNotReady = hasCalculatedShipping && (!shippingReady || !taxReady);
  const canProceedToCheckout = !hasCalculatedShipping || allPickup || (shippingReady && taxReady);

  useEffect(() => {
    taxRequestVersionRef.current += 1;
    setTaxCents(0);
    setTaxCalculated(false);
    setTaxCalculating(false);
    setTaxError('');
    setTaxFallbackApplied(false);
    setFinalTotalCents(0);
  }, [
    buyerAddress,
    fetchingRates,
    hasCalculatedShipping,
    hasCompleteShippingSelection,
    rateError,
    selectedRates,
  ]);

  useEffect(() => {
    const query = buyerStreet1.trim();

    if (!mapboxToken || !query || query.length < 3) {
      setAddressSuggestions([]);
      setAddressDropdownOpen(false);
      setFetchingAddressSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      if (!query) {
        setAddressLookupError('');
      }
      return undefined;
    }

    if (
      query === selectedAutocompleteStreetRef.current
      && buyerCity.trim()
      && buyerState.trim()
      && buyerZip.trim()
    ) {
      setAddressSuggestions([]);
      setAddressDropdownOpen(false);
      setFetchingAddressSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setFetchingAddressSuggestions(true);

      try {
        const params = new URLSearchParams({
          autocomplete: 'true',
          access_token: mapboxToken,
          country: (buyerCountry.trim() || 'US').toUpperCase(),
          limit: '5',
          types: 'address',
        });

        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!res.ok) {
          throw new Error(`Mapbox request failed with status ${res.status}`);
        }

        const data = await res.json() as { features?: MapboxFeature[] };
        const suggestions = (data.features ?? [])
          .map(parseMapboxFeature)
          .filter((suggestion): suggestion is AddressSuggestion => !!suggestion);

        setAddressSuggestions(suggestions);
        setAddressDropdownOpen(suggestions.length > 0);
        setHighlightedSuggestionIndex((prev) => {
          if (!suggestions.length) return -1;
          return prev >= 0 && prev < suggestions.length ? prev : 0;
        });
        setAddressLookupError('');
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('[checkout/address-autocomplete]', err);
        setAddressSuggestions([]);
        setAddressDropdownOpen(false);
        setHighlightedSuggestionIndex(-1);
        setAddressLookupError('Address suggestions are unavailable right now. You can continue entering your address manually.');
      } finally {
        if (!controller.signal.aborted) {
          setFetchingAddressSuggestions(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [buyerCity, buyerCountry, buyerState, buyerStreet1, buyerZip, mapboxToken]);

  useEffect(() => {
    const requestVersion = rateRequestVersionRef.current + 1;
    rateRequestVersionRef.current = requestVersion;
    setFetchingRates(false);
    setRateError('');
    // Preserve existing rateGroups for visual continuity while the new fetch is
    // pending. They will be replaced (or cleared) once the debounced request
    // completes. Clearing selectedRates immediately is intentional: a stale
    // rate selection is unsafe to carry forward to a different address.
    setSelectedRates([]);
    setRatesFetched(false);

    if (!hasCalculatedShipping || allPickup) {
      // Shipping is not needed – clear any leftover groups.
      setRateGroups([]);
      return undefined;
    }

    if (!buyerAddressComplete) {
      // Address is incomplete; leave stale groups visible for reference but do
      // not start a new fetch until the address is complete.
      return undefined;
    }

    async function fetchRatesAfterDebounce() {
      if (requestVersion !== rateRequestVersionRef.current) return;

      setFetchingRates(true);
      try {
        const res = await fetch('/api/checkout/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: calculatedShippingItems.map(i => ({ productId: i.id, quantity: i.quantity })),
            buyerAddress,
          }),
        });
        const data = await res.json();
        if (requestVersion !== rateRequestVersionRef.current) return;

        if (!res.ok) {
          setRateError(data.error ?? 'Shipping rate unavailable. Please check address or package details.');
          setRateGroups([]);
          setRatesFetched(true);
          return;
        }

        const rawGroups: Omit<ShipGroup, 'minDeliveryDays'>[] = data.groups ?? [];
        const groups: ShipGroup[] = rawGroups.map(g => {
          const ratesWithDays = g.rates.filter(r => r.deliveryDays !== null);
          return {
            ...g,
            minDeliveryDays: ratesWithDays.length > 0
              ? ratesWithDays.reduce((m, r) => Math.min(m, r.deliveryDays!), Infinity)
              : null,
          };
        });

        setRateGroups(groups);
        setRatesFetched(true);

        if (!groups.length || groups.some(group => group.rates.length === 0)) {
          setRateError('Shipping rate unavailable. Please check address or package details.');
          return;
        }

        const rateMessages = [...(data.errors ?? []), ...(data.warnings ?? [])];
        if (rateMessages.length) {
          setRateError(rateMessages.join(' '));
        }
      } catch {
        if (requestVersion !== rateRequestVersionRef.current) return;
        setRateError('Shipping rate unavailable. Please check address or package details.');
        setRateGroups([]);
        setRatesFetched(true);
      } finally {
        if (requestVersion === rateRequestVersionRef.current) {
          setFetchingRates(false);
        }
      }
    }

    const timer = window.setTimeout(() => {
      fetchRatesAfterDebounce().catch(() => undefined);
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [allPickup, buyerAddress, buyerAddressComplete, calculatedShippingItems, hasCalculatedShipping]);

  useEffect(() => {
    const requestVersion = taxRequestVersionRef.current + 1;
    taxRequestVersionRef.current = requestVersion;

    if (!hasCalculatedShipping || allPickup || !buyerAddressComplete || !hasCompleteShippingSelection || fetchingRates || !!rateError) {
      return undefined;
    }

    async function fetchCheckoutSummary() {
      setTaxCalculating(true);
      try {
        const res = await fetch('/api/checkout/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map(i => ({ productId: i.id, quantity: i.quantity })),
            pickupItemIds,
            shippingRateInfo: {
              shipmentGroups: selectedRates.map((rate) => ({
                sellerId: rate.sellerId,
                shipmentId: rate.shipmentId,
                rateId: rate.rateId,
                rateCents: rate.rateCents,
                carrier: rate.carrier,
                service: rate.service,
              })),
              totalRateCents: liveShippingCents,
              buyerAddress,
            },
          }),
        });
        const data = await res.json();
        if (requestVersion !== taxRequestVersionRef.current) return;

        if (!res.ok) {
          setTaxError(data.error || 'Unable to calculate the final total.');
          return;
        }

        setTaxCents(data.taxCents ?? 0);
        setFinalTotalCents(data.totalCents ?? (total + (data.taxCents ?? 0)));
        setTaxFallbackApplied(!!data.taxFallbackApplied);
        setTaxCalculated(true);
      } catch {
        if (requestVersion !== taxRequestVersionRef.current) return;
        setTaxError('Unable to calculate the final total.');
      } finally {
        if (requestVersion === taxRequestVersionRef.current) {
          setTaxCalculating(false);
        }
      }
    }

    fetchCheckoutSummary().catch(() => undefined);

    return undefined;
  }, [
    allPickup,
    buyerAddress,
    buyerAddressComplete,
    fetchingRates,
    hasCalculatedShipping,
    hasCompleteShippingSelection,
    items,
    liveShippingCents,
    pickupItemIds,
    rateError,
    selectedRates,
    total,
  ]);

  function handleSelectRate(sellerId: string, shipmentId: string, rate: RateQuote) {
    setSelectedRates(prev => {
      const next = prev.filter(r => r.sellerId !== sellerId);
      const shippingRate: SelectedRate = {
        sellerId,
        shipmentId,
        rateId: rate.id,
        rateCents: convertRateToCents(rate.rate),
        carrier: rate.carrier,
        service: rate.service,
        deliveryDays: rate.deliveryDays,
      };
      next.push(shippingRate);
      return next;
    });
  }

  function handleStreetAddressChange(value: string) {
    selectedAutocompleteStreetRef.current = '';
    setBuyerStreet1(value);
    setAddressLookupError('');
    setHighlightedSuggestionIndex(-1);
    setAddressDropdownOpen(value.trim().length >= 3);
  }

  function handleSelectAddressSuggestion(suggestion: AddressSuggestion) {
    selectedAutocompleteStreetRef.current = suggestion.street1;
    setBuyerStreet1(suggestion.street1);
    setBuyerCity(suggestion.city);
    setBuyerState(suggestion.state);
    setBuyerZip(suggestion.zip);
    setBuyerCountry(suggestion.country);
    setAddressSuggestions([]);
    setAddressDropdownOpen(false);
    setHighlightedSuggestionIndex(-1);
    setAddressLookupError('');
  }

  async function handleCheckout() {
    if (!session?.user) {
      router.push('/login?callbackUrl=/checkout');
      return;
    }

    // If live shipping is needed, validate rates selected
    if (hasCalculatedShipping && !canProceedToCheckout) {
      setError(rateError || taxError || 'Please select a valid shipping option before proceeding.');
      return;
    }

    setChecking(true);
    setError('');
    try {
      const shippingRateInfo = hasCalculatedShipping && hasCompleteShippingSelection && taxCalculated && !taxError
        ? {
            shipmentGroups: selectedRates.map(r => ({
              sellerId: r.sellerId,
              shipmentId: r.shipmentId,
              rateId: r.rateId,
              rateCents: r.rateCents,
              carrier: r.carrier,
              service: r.service,
            })),
            totalRateCents: liveShippingCents,
            buyerAddress,
          }
        : undefined;

      const res = await fetch('/api/checkout/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ productId: i.id, quantity: i.quantity })),
          pickupItemIds,
          shippingRateInfo,
          ...(hasCalculatedShipping && buyerAddressComplete ? { buyerAddress } : {}),
        }),
      });
      const data = await res.json();
      if (data.url) {
        // Stripe checkout requires a full page navigation to an external URL
        window.location.href = data.url;
      } else if (res.status === 401) {
        router.push('/login?callbackUrl=/checkout');
      } else {
        setError(data.error || 'Checkout failed. Please try again.');
        setChecking(false);
      }
    } catch {
      setError('Network error. Please try again.');
      setChecking(false);
    }
  }

  if (loading || status === 'loading') {
    return (
      <main className="max-w-2xl mx-auto">
        <div className="card p-8 animate-pulse bg-slate-100 rounded-2xl h-64" />
      </main>
    );
  }

  if (!items.length) {
    return (
      <main className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-black mb-6">Checkout</h1>
        <div className="card p-10 text-center text-slate-500">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium mb-4">Your cart is empty.</p>
          <Link href="/" className="btn-primary">Browse products</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-6">Review your order</h1>

      {!session?.user && (
        <div className="card p-4 mb-4 bg-yellow-50 border-yellow-200 text-yellow-800 text-sm">
          <span>You&apos;ll need to </span>
          <Link href="/login?callbackUrl=/checkout" className="font-semibold underline">sign in</Link>
          <span> before completing your purchase.</span>
        </div>
      )}

      <div className="card p-5 mb-4 space-y-4">
        {items.map(item => (
          <div key={item.id}>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.title}
                className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.title}</p>
                <p className="text-sm text-slate-500">
                  {dollars(item.priceCents)} × {item.quantity}
                  {itemShippingLabel(item, isPickup(item.id))}
                </p>
              </div>
              <p className="font-semibold flex-shrink-0">
                {dollars(item.priceCents * item.quantity)}
              </p>
            </div>
            {/* Pickup / delivery selector */}
            {pickupEligibleIds.has(item.id) && (
              <div className="mt-2 flex gap-3 text-sm pl-[68px]">
                <span className="text-slate-500 text-xs mr-1">Fulfillment:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name={`fulfillment-${item.id}`}
                    checked={!isPickup(item.id)}
                    onChange={() => setPickupChoices(prev => ({ ...prev, [item.id]: false }))}
                  />
                  <span>Delivery</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-green-700">
                  <input
                    type="radio"
                    name={`fulfillment-${item.id}`}
                    checked={isPickup(item.id)}
                    onChange={() => setPickupChoices(prev => ({ ...prev, [item.id]: true }))}
                  />
                  <span>
                    🏠 Pick up{item.pickupCity && item.pickupState ? ` in ${item.pickupCity}, ${item.pickupState}` : ''}
                  </span>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Shipping address for live rate calculation */}
      {!allPickup && hasCalculatedShipping && (
        <div className="card p-5 mb-4 space-y-3">
          <p className="font-semibold text-slate-900">📦 Shipping address</p>
          <p className="text-xs text-slate-500">Enter your full shipping address to calculate live shipping rates automatically.</p>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="label text-xs">Full name</label>
              {session?.user?.name?.trim() && (
                <button
                  type="button"
                  onClick={() => setBuyerName(session.user.name ?? '')}
                  className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
                >
                  Use saved profile name
                </button>
              )}
            </div>
            <input
              type="text"
              value={buyerName}
              onChange={e => setBuyerName(e.target.value)}
              className="input"
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <label htmlFor="checkout-street-address" className="label text-xs">Street address</label>
            <div ref={addressAutocompleteRef} className="relative">
              <input
                id="checkout-street-address"
                type="text"
                value={buyerStreet1}
                onChange={e => handleStreetAddressChange(e.target.value)}
                onFocus={() => {
                  if (addressSuggestions.length > 0) {
                    setAddressDropdownOpen(true);
                    setHighlightedSuggestionIndex(0);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setAddressDropdownOpen(false);
                    setHighlightedSuggestionIndex(-1);
                    return;
                  }

                  if (!addressSuggestions.length || fetchingAddressSuggestions) {
                    return;
                  }

                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setAddressDropdownOpen(true);
                    setHighlightedSuggestionIndex(prev => (
                      prev < addressSuggestions.length - 1 ? prev + 1 : 0
                    ));
                    return;
                  }

                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setAddressDropdownOpen(true);
                    setHighlightedSuggestionIndex(prev => (
                      prev > 0 ? prev - 1 : addressSuggestions.length - 1
                    ));
                    return;
                  }

                  if (event.key === 'Enter' && addressDropdownOpen && highlightedSuggestionIndex >= 0) {
                    event.preventDefault();
                    handleSelectAddressSuggestion(addressSuggestions[highlightedSuggestionIndex]);
                  }
                }}
                className="input"
                placeholder="123 Main St"
                autoComplete="address-line1"
                spellCheck={false}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={addressDropdownOpen && addressSuggestions.length > 0}
                aria-controls="checkout-address-suggestions"
                aria-describedby="checkout-street-address-hint"
                aria-activedescendant={highlightedSuggestionIndex >= 0 ? `checkout-address-suggestion-${highlightedSuggestionIndex}` : undefined}
              />

              {(fetchingAddressSuggestions || (addressDropdownOpen && addressSuggestions.length > 0)) && (
                <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {fetchingAddressSuggestions ? (
                    <p role="status" aria-live="polite" className="px-4 py-3 text-sm text-slate-500">Searching addresses…</p>
                  ) : (
                    <div
                      id="checkout-address-suggestions"
                      role="listbox"
                      aria-label="Address suggestions"
                      aria-live="polite"
                      className="max-h-72 overflow-y-auto overscroll-contain"
                    >
                      {addressSuggestions.map((suggestion, index) => (
                        <button
                          key={suggestion.id}
                          id={`checkout-address-suggestion-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === highlightedSuggestionIndex}
                          onClick={() => handleSelectAddressSuggestion(suggestion)}
                          onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                          className={`w-full border-b border-slate-100 px-4 py-3 text-left text-sm text-slate-700 last:border-b-0 focus:outline-none ${
                            index === highlightedSuggestionIndex ? 'bg-slate-50' : 'hover:bg-slate-50 focus:bg-slate-50'
                          }`}
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p id="checkout-street-address-hint" className="mt-1 text-xs text-slate-500">
              {mapboxToken
                ? 'Start with your street number and name to autofill city, state, ZIP, and country.'
                : 'Enter your street address manually to continue checkout.'}
            </p>
            {addressLookupError && (
              <p
                role="alert"
                aria-live="assertive"
                className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
              >
                ⚠️ {addressLookupError}
              </p>
            )}
          </div>
          <div>
            <label className="label text-xs">Apt, suite, etc. (optional)</label>
            <input
              type="text"
              value={buyerStreet2}
              onChange={e => setBuyerStreet2(e.target.value)}
              className="input"
              placeholder="Apt 4B"
              autoComplete="address-line2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">City</label>
              <input
                type="text"
                value={buyerCity}
                onChange={e => setBuyerCity(e.target.value)}
                className="input"
                placeholder="New York"
                autoComplete="address-level2"
              />
            </div>
            <div>
              <label className="label text-xs">State</label>
              <input
                type="text"
                value={buyerState}
                onChange={e => setBuyerState(e.target.value)}
                className="input"
                placeholder="NY"
                maxLength={2}
                autoComplete="address-level1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">ZIP code</label>
              <input
                type="text"
                value={buyerZip}
                onChange={e => setBuyerZip(e.target.value)}
                className="input"
                placeholder="10001"
                autoComplete="postal-code"
              />
            </div>
            <div>
              <label className="label text-xs">Country</label>
              <select
                value={buyerCountry}
                onChange={(e) => {
                  selectedAutocompleteStreetRef.current = '';
                  setBuyerCountry(e.target.value);
                }}
                className="input"
                autoComplete="country-name"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
              </select>
            </div>
          </div>

          {fetchingRates && rateGroups.length === 0 && (
            <p className="text-sm text-slate-600 font-medium">Calculating shipping…</p>
          )}

          {rateError && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ {rateError}
            </p>
          )}

          {/* Rate options per seller group; dimmed while stale rates are being refreshed */}
          {rateGroups.length > 0 && (
            <div
              className={fetchingRates ? 'opacity-50 pointer-events-none' : undefined}
              aria-disabled={fetchingRates || undefined}
              {...(fetchingRates ? { inert: '' } : {})}
            >
              {fetchingRates && (
                <p className="text-xs text-slate-500 mb-2">Refreshing shipping rates…</p>
              )}
              {rateGroups.map(group => (
                <div key={group.sellerId} className="rounded-xl border border-slate-200 p-3 space-y-2 mb-2 last:mb-0">
                  {rateGroups.length > 1 && (
                    <p className="text-xs font-semibold text-slate-600">Seller: {group.sellerName}</p>
                  )}
                  {group.rates.length === 0 && (
                    <p className="text-xs text-red-600">No rates available for this seller.</p>
                  )}
                  {group.rates.map(rate => {
                    const selected = selectedRates.find(
                      r => r.sellerId === group.sellerId && r.rateId === rate.id,
                    );
                    const isCheapest = rate.id === group.rates[0]?.id;
                    const isFastest = rate.deliveryDays !== null && rate.deliveryDays === group.minDeliveryDays;
                    return (
                      <label key={rate.id} className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`rate-${group.sellerId}`}
                            checked={!!selected}
                            onChange={() => handleSelectRate(group.sellerId, group.shipmentId, rate)}
                          />
                          <span>
                            <span className="font-medium">{rate.carrier}</span>
                            {' · '}
                            {rate.service}
                            {isCheapest && <span className="ml-1 text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-semibold">Best price</span>}
                            {isFastest && !isCheapest && <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-semibold">Fastest</span>}
                          </span>
                        </span>
                        <span className="text-slate-600 text-right flex-shrink-0">
                          ${rate.rate}
                          {rate.deliveryDays !== null ? <span className="text-slate-400 text-xs ml-1">(Est. {rate.deliveryDays} day{rate.deliveryDays === 1 ? '' : 's'})</span> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {selectedRates.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600">Selected shipping</p>
              {selectedRates.map((rate) => (
                <p key={`${rate.sellerId}-${rate.rateId}`} className="text-xs text-slate-600">
                  <span className="font-medium">{rate.carrier}</span> · {rate.service}
                  {rate.deliveryDays !== null ? ` · Estimated delivery ${rate.deliveryDays} day${rate.deliveryDays === 1 ? '' : 's'}` : ''}
                  {' · '}
                  {dollars(rate.rateCents)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card p-5 mb-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Product price</span>
          <span>{dollars(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Shipping fee</span>
          <span>
            {allPickup
              ? 'Free (pickup)'
              : hasCalculatedShipping && fetchingRates
                ? 'Calculating shipping…'
                : hasCalculatedShipping && rateError
                  ? 'Shipping unavailable'
                  : hasCalculatedShipping && !hasCompleteShippingSelection
                    ? 'Shipping not selected'
                    : totalShipping === 0
                      ? 'Free'
                      : dollars(totalShipping)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Tax fee</span>
          <span>
            {taxNotReady
              ? 'TBD'
              : dollars(taxCents)}
          </span>
        </div>
        <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
          <span>Grand total</span>
          <span>
            {taxNotReady
              ? 'TBD'
              : dollars(hasCalculatedShipping ? finalTotalCents : total + taxCents)}
          </span>
        </div>
        {taxFallbackApplied && (
          <p className="text-xs text-slate-500">Tax is temporarily unavailable and has been set to $0.00.</p>
        )}
        {taxError && (
          <p className="text-xs text-amber-700">{taxError}</p>
        )}
      </div>

      {allPickup ? (
        <p className="text-xs text-slate-500 mb-3">
          All items will be picked up in person. No shipping address needed. You will be redirected to Stripe to complete payment.
        </p>
      ) : hasCalculatedShipping ? (
        <p className="text-xs text-slate-500 mb-3">
          Enter your shipping address, choose a shipping option, and verify your final total before payment.
        </p>
      ) : (
        <p className="text-xs text-slate-500 mb-3">
          You will be redirected to Stripe to complete your payment securely. Shipping address is collected at checkout.
        </p>
      )}

      {error && (
        <p className="text-red-600 text-sm mb-3">{error}</p>
      )}

      <div className="flex gap-3">
        <Link href="/cart" className="btn-outline flex-1 text-center">
          ← Back to cart
        </Link>
        <button
          onClick={handleCheckout}
          disabled={checking || !canProceedToCheckout}
          className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {checking
            ? 'Redirecting to payment…'
            : !canProceedToCheckout
              ? 'Select shipping first'
              : 'Proceed to payment →'}
        </button>
      </div>
    </main>
  );
}
