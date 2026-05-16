'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import GarageSaleCard, { type GarageSaleSummary } from '@/components/GarageSaleCard';
import { MapPin, List, Search, Filter, SlidersHorizontal, X, ChevronLeft, ChevronRight, Navigation } from 'lucide-react';

interface SelectOption { label: string; value: string }

interface Props {
  initialSales: GarageSaleSummary[];
  initialTotal: number;
  initialPage: number;
  totalPages: number;
  perPage: number;
  searchParams: Record<string, string | undefined>;
  radiusOptions: SelectOption[];
  dateFilters: SelectOption[];
  sortOptions: SelectOption[];
  saleTypes: SelectOption[];
  categories: SelectOption[];
  dbError: boolean;
}

export default function GarageSaleBrowseClient({
  initialSales,
  initialTotal,
  initialPage,
  totalPages,
  perPage,
  searchParams,
  radiusOptions,
  dateFilters,
  sortOptions,
  saleTypes,
  categories,
  dbError,
}: Props) {
  const router = useRouter();
  const urlParams = useSearchParams();

  const [view, setView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapboxMapRef = useRef<unknown>(null);

  // Filter state (controlled from URL on mount, then client-controlled)
  const [q, setQ] = useState(searchParams.q ?? '');
  const [city, setCity] = useState(searchParams.city ?? '');
  const [zip, setZip] = useState(searchParams.zip ?? '');
  const [saleType, setSaleType] = useState(searchParams.saleType ?? '');
  const [category, setCategory] = useState(searchParams.category ?? '');
  const [date, setDate] = useState(searchParams.date ?? '');
  const [sort, setSort] = useState(searchParams.sort ?? 'newest');
  const [radius, setRadius] = useState(searchParams.radius ?? '50');

  function buildSearchUrl(overrides: Record<string, string> = {}) {
    const params = new URLSearchParams();
    const current = { q, city, zip, saleType, category, date, sort, radius };
    const merged = { ...current, ...overrides, page: '1' };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return `/garage-sales?${params.toString()}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(buildSearchUrl());
  }

  function handleReset() {
    setQ(''); setCity(''); setZip(''); setSaleType(''); setCategory(''); setDate(''); setSort('newest'); setRadius('50');
    router.push('/garage-sales');
  }

  function handleGeolocate() {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus('done');
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        const params = new URLSearchParams(urlParams.toString());
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
        params.set('sort', 'closest');
        params.set('page', '1');
        setSort('closest');
        router.push(`/garage-sales?${params.toString()}`);
      },
      () => setGeoStatus('error'),
      { timeout: 10000 },
    );
  }

  // Initialize Mapbox if view === 'map' and token present
  useEffect(() => {
    if (view !== 'map') return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !mapRef.current) return;
    if (mapboxMapRef.current) return; // already initialized

    // Dynamically load mapbox-gl only when available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async () => {
      let mapboxgl: any;
      try {
        // Use eval-based dynamic require to avoid webpack bundling error when not installed
        const mod = await (Function('return import("mapbox-gl")')() as Promise<any>);
        mapboxgl = mod.default ?? mod;
      } catch {
        return; // mapbox-gl not installed — map placeholder shown via CSS
      }
      if (!mapRef.current || !mapboxgl) return;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: userCoords ? [userCoords.lng, userCoords.lat] : [-98.5795, 39.8283],
        zoom: userCoords ? 10 : 4,
      });
      mapboxMapRef.current = map;

      initialSales.forEach((sale) => {
        if (sale.latitude == null || sale.longitude == null) return;
        const el = document.createElement('div');
        el.innerHTML = '🏠';
        el.style.fontSize = '24px';
        el.style.cursor = 'pointer';
        el.title = sale.title;
        el.addEventListener('click', () => {
          window.location.href = `/garage-sales/${sale.id}`;
        });
        new mapboxgl.Marker({ element: el })
          .setLngLat([sale.longitude, sale.latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<strong>${sale.title}</strong><br/>${sale.city}, ${sale.state}<br/><a href="/garage-sales/${sale.id}" style="color:#1B3A6B;font-weight:600">View details →</a>`
            )
          )
          .addTo(map);
      });
    })();
  }, [view, initialSales, userCoords]);

  const page = initialPage;

  function pageUrl(p: number) {
    const params = new URLSearchParams(urlParams.toString());
    params.set('page', String(p));
    return `/garage-sales?${params.toString()}`;
  }

  if (dbError) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-500">Database is unavailable. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <form onSubmit={handleSubmit} className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search garage sales…"
              className="input pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="input w-32"
            />
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="ZIP"
              className="input w-24"
            />
            <button type="submit" className="btn-brand px-5">Search</button>
          </div>
        </div>

        {/* Filter row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <SlidersHorizontal size={13} /> Filters
          </button>

          {/* Quick date chips */}
          {[{ label: 'Today', value: 'today' }, { label: 'This Weekend', value: 'weekend' }, { label: 'Open Now', value: 'open_now' }].map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => {
                const newDate = date === d.value ? '' : d.value;
                setDate(newDate);
                router.push(buildSearchUrl({ date: newDate }));
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${date === d.value ? 'border-[var(--ff-primary-navy)] bg-[var(--ff-primary-navy)] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {d.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleGeolocate}
              disabled={geoStatus === 'loading'}
              className="flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Navigation size={13} />
              {geoStatus === 'loading' ? 'Locating…' : geoStatus === 'done' ? 'Located' : 'Near Me'}
            </button>

            {/* View toggle */}
            <div className="flex rounded-full border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'list' ? 'bg-[var(--ff-primary-navy)] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <List size={13} /> List
              </button>
              <button
                type="button"
                onClick={() => setView('map')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'map' ? 'bg-[var(--ff-primary-navy)] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <MapPin size={13} /> Map
              </button>
            </div>
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className="label">Sale Type</label>
              <select value={saleType} onChange={(e) => setSaleType(e.target.value)} className="input">
                {saleTypes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                {categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <select value={date} onChange={(e) => setDate(e.target.value)} className="input">
                {dateFilters.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sort By</label>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="input">
                {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Radius</label>
              <select value={radius} onChange={(e) => setRadius(e.target.value)} className="input">
                {radiusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-5">
              <button type="submit" className="btn-brand px-6">Apply Filters</button>
              <button type="button" onClick={handleReset} className="btn-outline px-4">
                <X size={14} /> Reset
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {initialTotal === 0 ? 'No results' : `${initialTotal} garage sale${initialTotal === 1 ? '' : 's'} found`}
        </p>
        {geoStatus === 'error' && (
          <p className="text-xs text-red-600">Could not determine your location.</p>
        )}
      </div>

      {/* Map view */}
      {view === 'map' && (
        <div className="card overflow-hidden">
          <div ref={mapRef} className="h-[480px] w-full bg-slate-100 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <MapPin size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Map view requires a Mapbox token.</p>
              <p className="text-xs">Set <code className="bg-slate-100 px-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the interactive map.</p>
            </div>
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <>
          {initialSales.length === 0 ? (
            <div className="card p-10 text-center">
              <span className="text-5xl">🔍</span>
              <p className="mt-4 text-lg font-bold text-slate-700">No garage sales found nearby.</p>
              <p className="mt-1 text-sm text-slate-500">Expand your search radius?</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {radiusOptions.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => router.push(buildSearchUrl({ radius: r.value }))}
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${radius === r.value ? 'border-[var(--ff-primary-navy)] bg-[var(--ff-primary-navy)] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="mt-6">
                <Link href="/garage-sales/new" className="btn-brand">Post Your Own Sale</Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {initialSales.map((sale) => (
                <GarageSaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              {page > 1 && (
                <Link href={pageUrl(page - 1)} className="flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  <ChevronLeft size={16} /> Previous
                </Link>
              )}
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              {page < totalPages && (
                <Link href={pageUrl(page + 1)} className="flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Next <ChevronRight size={16} />
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
