'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, MapPin, AlertCircle } from 'lucide-react';
import {
  calculateGarageSalePricing,
  centsToDollars,
  DEFAULT_GARAGE_SALE_PRICING_SETTINGS,
} from '@/lib/garage-sale-pricing';
import { getGarageSaleTimeValidationError } from '@/lib/garage-sale-time-validation';

const SALE_TYPES = [
  { label: 'Garage Sale', value: 'GARAGE_SALE' },
  { label: 'Yard Sale', value: 'YARD_SALE' },
  { label: 'Estate Sale', value: 'ESTATE_SALE' },
  { label: 'Moving Sale', value: 'MOVING_SALE' },
];

const CATEGORIES = [
  { label: 'Furniture', value: 'furniture' },
  { label: 'Electronics', value: 'electronics' },
  { label: 'Clothing', value: 'clothing' },
  { label: 'Tools', value: 'tools' },
  { label: 'Toys', value: 'toys' },
  { label: 'Baby Items', value: 'baby_items' },
  { label: 'Appliances', value: 'appliances' },
  { label: 'Collectibles', value: 'collectibles' },
  { label: 'Automotive', value: 'automotive' },
  { label: 'Miscellaneous', value: 'miscellaneous' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND',
  'OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];
const DATETIME_STEP_SECONDS = 60;

export default function GarageSaleNewForm() {
  const router = useRouter();

  const [saleType, setSaleType] = useState('GARAGE_SALE');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoInputs, setPhotoInputs] = useState<string[]>(['']);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pricingEstimate = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (getGarageSaleTimeValidationError(start, end)) return null;
    return calculateGarageSalePricing({
      listingType: 'STANDARD',
      startDate: start,
      endDate: end,
      homepagePromotion: false,
      topLocalSearchPlacement: false,
      settings: DEFAULT_GARAGE_SALE_PRICING_SETTINGS,
    });
  }, [endDate, startDate]);

  useEffect(() => {
    if (!startDate || !endDate) {
      setTimeError(null);
      return;
    }
    setTimeError(getGarageSaleTimeValidationError(new Date(startDate), new Date(endDate)));
  }, [startDate, endDate]);

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (photoUrls.length >= 10) {
      setError('Maximum 10 photos allowed');
      return;
    }
    setUploading(true);
    setError(null);
    const uploads = Array.from(files).slice(0, 10 - photoUrls.length);
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
      setError('Photo uploads require Cloudinary to be configured (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME).');
      setUploading(false);
      return;
    }
    const results: string[] = [];
    for (const file of uploads) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'flupflap_unsigned');
      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          results.push(data.secure_url as string);
        }
      } catch {
        // skip failed upload
      }
    }
    setPhotoUrls((prev) => [...prev, ...results]);
    setUploading(false);
  }

  function removePhoto(idx: number) {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleGeolocate() {
    if (!navigator.geolocation) { setGeoStatus('error'); return; }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus('done');
        if (latRef.current) latRef.current.value = String(pos.coords.latitude);
        if (lngRef.current) lngRef.current.value = String(pos.coords.longitude);
      },
      () => setGeoStatus('error'),
      { timeout: 10000 },
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);

    const payload = {
      title: fd.get('title') as string,
      description: fd.get('description') as string,
      saleType,
      listingType: 'STANDARD',
      address: fd.get('address') as string,
      city: fd.get('city') as string,
      state: fd.get('state') as string,
      zipCode: fd.get('zipCode') as string,
      latitude: latRef.current?.value ? parseFloat(latRef.current.value) : null,
      longitude: lngRef.current?.value ? parseFloat(lngRef.current.value) : null,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      photos: photoUrls,
      videoUrl: (fd.get('videoUrl') as string) || null,
      categories,
      sellerPhone: (fd.get('sellerPhone') as string) || null,
      priceRangeMin: fd.get('priceRangeMin') ? parseFloat(fd.get('priceRangeMin') as string) : null,
      priceRangeMax: fd.get('priceRangeMax') ? parseFloat(fd.get('priceRangeMax') as string) : null,
      homepagePromotion: false,
      topLocalSearchPlacement: false,
    };

    // Basic client validation
    if (!payload.title || payload.title.length < 3) {
      setError('Title must be at least 3 characters'); setSubmitting(false); return;
    }
    if (!payload.description || payload.description.length < 10) {
      setError('Description must be at least 10 characters'); setSubmitting(false); return;
    }
    if (!payload.startDate || !payload.endDate) {
      setError('Start and end dates are required'); setSubmitting(false); return;
    }
    const validationError = getGarageSaleTimeValidationError(new Date(payload.startDate), new Date(payload.endDate));
    if (validationError) {
      setError(validationError); setSubmitting(false); return;
    }

    try {
      const res = await fetch('/api/garage-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create listing');
        setSubmitting(false);
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      router.push(`/seller/garage-sales?created=1&paid=1&saleId=${data.id}`);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Basic info */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-900">Sale Information</h2>

        <div>
          <label className="label">Title *</label>
          <input name="title" className="input" placeholder="e.g. Multi-family Garage Sale – Great Deals!" required minLength={3} maxLength={120} />
        </div>

        <div>
          <label className="label">Description *</label>
          <textarea name="description" className="input h-28 resize-none" placeholder="Describe what you're selling, condition, special items…" required minLength={10} maxLength={5000} />
        </div>

        <div>
          <label className="label">Sale Type *</label>
          <div className="flex flex-wrap gap-2">
            {SALE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setSaleType(t.value)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${saleType === t.value ? 'border-[var(--ff-primary-navy)] bg-[var(--ff-primary-navy)] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Price Range Min ($)</label>
            <input name="priceRangeMin" type="number" min="0" step="0.01" className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Price Range Max ($)</label>
            <input name="priceRangeMax" type="number" min="0" step="0.01" className="input" placeholder="500" />
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="card p-5 space-y-3">
        <h2 className="font-bold text-slate-900">Categories</h2>
        <p className="text-xs text-slate-500">Select all that apply</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => toggleCategory(cat.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${categories.includes(cat.value) ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Location */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-900">Location</h2>

        <div>
          <label className="label">Street Address *</label>
          <input name="address" className="input" placeholder="123 Main St" required />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">City *</label>
            <input name="city" className="input" placeholder="Springfield" required />
          </div>
          <div>
            <label className="label">State *</label>
            <select name="state" className="input" required>
              <option value="">Select</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">ZIP Code *</label>
            <input name="zipCode" className="input" placeholder="62701" required maxLength={10} />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="label mb-0">Coordinates</label>
            <button
              type="button"
              onClick={handleGeolocate}
              disabled={geoStatus === 'loading'}
              className="flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <MapPin size={12} />
              {geoStatus === 'loading' ? 'Locating…' : geoStatus === 'done' ? '✓ Located' : 'Use My Location'}
            </button>
            {geoStatus === 'error' && <span className="text-xs text-red-600">Location access denied</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input ref={latRef} name="latitude" type="number" step="any" className="input" placeholder="Latitude (optional)" />
            <input ref={lngRef} name="longitude" type="number" step="any" className="input" placeholder="Longitude (optional)" />
          </div>
          <p className="mt-1 text-xs text-slate-400">Coordinates let buyers find your sale on the map.</p>
        </div>
      </div>

      {/* Schedule */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-900">Schedule</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Start Date &amp; Time *</label>
            <input
              name="startDate"
              type="datetime-local"
              className="input"
              required
              step={DATETIME_STEP_SECONDS}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">End Date &amp; Time *</label>
            <input
              name="endDate"
              type="datetime-local"
              className="input"
              required
              step={DATETIME_STEP_SECONDS}
              min={startDate || undefined}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        {timeError ? (
          <p className="text-xs text-red-600">{timeError}</p>
        ) : (
          <p className="text-xs text-slate-500">End time must be later than start time. On mobile devices, confirm both date and time fields are set before submitting.</p>
        )}
      </div>

      {/* Photos */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-900">Photos (up to 10)</h2>

        {/* Existing photos */}
        {photoUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photoUrls.map((url, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {photoUrls.length < 10 && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-8 text-sm font-medium text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:opacity-50"
            >
              <Upload size={20} />
              {uploading ? 'Uploading…' : `Upload Photos (${photoUrls.length}/10)`}
            </button>
          </div>
        )}

        <div>
          <label className="label">Video URL (optional)</label>
          <input name="videoUrl" type="url" className="input" placeholder="https://youtube.com/…" />
          <p className="mt-1 text-xs text-slate-400">Link to a YouTube or external video of your sale items.</p>
        </div>
      </div>

      {/* Contact */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-900">Contact</h2>
        <div>
          <label className="label">Phone Number (optional)</label>
          <input name="sellerPhone" type="tel" className="input" placeholder="+1 (555) 000-0000" maxLength={30} />
          <p className="mt-1 text-xs text-slate-400">Buyers can message you on FlupFlap. Phone is optional.</p>
        </div>
      </div>

      {/* Pricing */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-900">Pricing &amp; Checkout</h2>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          {!pricingEstimate ? (
            <p className="text-slate-500">Select start and end times to see your live total.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-800">
                Garage Sale · {pricingEstimate.durationDays} day{pricingEstimate.durationDays === 1 ? '' : 's'}
              </p>
              <p className="text-slate-600">Price per day: ${centsToDollars(pricingEstimate.pricePerDayCents)}</p>
              <p className="text-slate-600">Base: ${centsToDollars(pricingEstimate.baseAmountCents)}</p>
              <p className="pt-1 text-base font-black text-slate-900">Total: ${centsToDollars(pricingEstimate.totalCents)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting || uploading} className="btn-brand px-8 py-3 text-base">
          {submitting ? 'Preparing checkout…' : 'Continue to Secure Checkout'}
        </button>
        <p className="text-xs text-slate-400">Your listing activates instantly after successful payment.</p>
      </div>
    </form>
  );
}
