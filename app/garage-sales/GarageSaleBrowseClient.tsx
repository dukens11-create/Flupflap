'use client';
import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import GarageSaleCard, { type GarageSaleSummary } from '@/components/GarageSaleCard';
import { MapPin, List, Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, Navigation } from 'lucide-react';

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
  const [isNavigating, startNavigation] = useTransition();

  const [view, setView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [actionError, setActionError] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  // mapboxMapRef is used to track if the map has been initialized
  // to prevent re-initialization on re-renders
  const mapInitialized = useRef(false);

  // Filter state (controlled from URL on mount, then client-controlled)
  const [q, setQ] = useState(searchParams.q ?? '');
  const [city, setCity] = useState(searchParams.city ?? '');
  const [zip, setZip] = useState(searchParams.zip ?? '');
  const [saleType, setSaleType] = useState(searchParams.saleType ?? '');
  const [category, setCategory] = useState(searchParams.category ?? '');
  const [date, setDate] = useState(searchParams.date ?? '');
  const [sort, setSort] = useState(searchParams.sort ?? 'newest');
  const [radius, setRadius] = useState(searchParams.radius ?? '50');
  const [live, setLive] = useState(searchParams.live ?? '');
  const [lat, setLat] = useState(searchParams.lat ?? '');
  const [lng, setLng] = useState(searchParams.lng ?? '');

  useEffect(() => {
    const nextLat = urlParams.get('lat') ?? '';
    const nextLng = urlParams.get('lng') ?? '';
    setLat(nextLat);
    setLng(nextLng);
    if (nextLat && nextLng) {
      const parsedLat = Number.parseFloat(nextLat);
      const parsedLng = Number.parseFloat(nextLng);
      if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
        setUserCoords({ lat: parsedLat, lng: parsedLng });
      }
    }
  }, [urlParams]);

  function buildSearchUrl(overrides: Record<string, string> = {}) {
    const params = new URLSearchParams();
    const current = { q, city, zip, saleType, category, date, sort, radius, live, lat, lng };
    const merged = { ...current, ...overrides, page: '1' };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return `/garage-sales?${params.toString()}`;
  }

  function navigateWithOverrides(overrides: Record<string, string> = {}) {
    setActionError('');
    const target = buildSearchUrl(overrides);
    startNavigation(() => {
      router.push(target);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lat || lng || !zip.trim()) {
      navigateWithOverrides();
      return;
    }

    try {
      const res = await fetch(`/api/geo/zip?zip=${encodeURIComponent(zip.trim())}&country=us`);
      if (!res.ok) {
        throw new Error('zip_lookup_failed');
      }
      const data = (await res.json()) as { lat?: number; lng?: number };
      if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
        throw new Error('zip_lookup_invalid');
      }
      const nextLat = String(data.lat);
      const nextLng = String(data.lng);
      setLat(nextLat);
      setLng(nextLng);
      setUserCoords({ lat: data.lat as number, lng: data.lng as number });
      navigateWithOverrides({ lat: nextLat, lng: nextLng });
    } catch {
      setActionError('Could not resolve ZIP to coordinates. Showing city/ZIP results without distance filtering.');
      navigateWithOverrides({ lat: '', lng: '' });
    }
  }

  function handleReset() {
    setQ(''); setCity(''); setZip(''); setSaleType(''); setCategory(''); setDate(''); setSort('newest'); setRadius('50'); setLive(''); setLat(''); setLng('');
    setUserCoords(null);
    setActionError('');
    router.push('/garage-sales');
  }

  function handleGeolocate() {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      setActionError('Enter city or ZIP, or allow location access.');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus('done');
        setActionError('');
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setLat(String(coords.lat));
        setLng(String(coords.lng));
        const params = new URLSearchParams(urlParams.toString());
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
        params.set('sort', 'closest');
        params.set('page', '1');
        setSort('closest');
        startNavigation(() => {
          router.push(`/garage-sales?${params.toString()}`);
        });
      },
      () => {
        setGeoStatus('error');
        setActionError('Enter city or ZIP, or allow location access.');
      },
      { timeout: 10000, maximumAge: 120000 },
    );
  }

  // Map integration: requires mapbox-gl to be installed (npm install mapbox-gl)
  // and NEXT_PUBLIC_MAPBOX_TOKEN to be set.
  // When both are present the map will auto-initialize when the map view is selected.
  useEffect(() => {
    if (view !== 'map' || mapInitialized.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !mapRef.current) return;
    mapInitialized.current = true;

    // mapbox-gl is an optional peer dependency. Show a placeholder until installed.
    // To enable the full interactive map:
    //   1. npm install mapbox-gl
    //   2. Set NEXT_PUBLIC_MAPBOX_TOKEN in your environment
    const container = mapRef.current;
    const saleCount = initialSales.length;

    if (container && !container.firstChild) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#64748b;text-align:center;padding:2rem;">
          <div style="font-size:2.5rem;margin-bottom:0.5rem;">🗺️</div>
          <p style="font-weight:600;margin:0 0 0.25rem">Interactive map requires mapbox-gl</p>
          <p style="font-size:0.75rem;margin:0">Install it with <code style="background:#f1f5f9;padding:0.1em 0.4em;border-radius:4px">npm install mapbox-gl</code> and set <code style="background:#f1f5f9;padding:0.1em 0.4em;border-radius:4px">NEXT_PUBLIC_MAPBOX_TOKEN</code></p>
          <p style="font-size:0.75rem;margin:0.5rem 0 0;color:#94a3b8">${saleCount} sale${saleCount !== 1 ? 's' : ''} would appear as pins</p>
        </div>
      `;
    }
  }, [view, initialSales]);

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
                navigateWithOverrides({ date: newDate });
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${date === d.value ? 'border-[var(--ff-primary-navy)] bg-[var(--ff-primary-navy)] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {d.label}
            </button>
          ))}

          {/* Live filter chip — defaults to Nationwide radius so live sales are broadly discoverable */}
          <button
            type="button"
            onClick={() => {
              const newLive = live === 'true' ? '' : 'true';
              setLive(newLive);
              const overrides: Record<string, string> = { live: newLive };
              if (newLive === 'true' && radius !== '99999') {
                setRadius('99999');
                overrides.radius = '99999';
              }
              navigateWithOverrides(overrides);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${live === 'true' ? 'border-red-500 bg-red-500 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            🔴 Live
          </button>

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
              <select
                value={radius}
                onChange={(e) => {
                  const nextRadius = e.target.value;
                  setRadius(nextRadius);
                  navigateWithOverrides({ radius: nextRadius });
                }}
                className="input"
              >
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {initialTotal === 0 ? 'No results' : `${initialTotal} garage sale${initialTotal === 1 ? '' : 's'} found`}
        </p>
        {isNavigating && <p className="text-xs text-slate-500">Updating results…</p>}
      </div>
      {(geoStatus === 'error' || (!lat && !lng && !city && !zip)) && (
        <p className="text-xs text-amber-700">Enter city or ZIP, or allow location access.</p>
      )}
      {actionError && (
        <p className="text-xs text-red-600">{actionError}</p>
      )}

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
              <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-2">
                {radiusOptions.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => {
                      setRadius(r.value);
                      navigateWithOverrides({ radius: r.value });
                    }}
                    className={`pointer-events-auto rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${radius === r.value ? 'border-[var(--ff-primary-navy)] bg-[var(--ff-primary-navy)] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
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
