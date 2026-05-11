'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import CategoryPicker from '@/components/CategoryPicker';
import ConditionPicker from '@/components/ConditionPicker';
import MediaUpload from '@/components/MediaUpload';

type FormErrors = {
  title?: string;
  price?: string;
  inventoryQty?: string;
  category?: string;
  condition?: string;
  images?: string;
  submit?: string;
};

export default function NewListingForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [mediaState, setMediaState] = useState({
    imageCount: 0,
    uploading: false,
    progress: 0,
    error: '',
  });
  const handleMediaStateChange = useCallback((nextState: {
    imageCount: number;
    hasVideo: boolean;
    uploading: boolean;
    progress: number;
    error: string;
  }) => {
    setMediaState({
      imageCount: nextState.imageCount,
      uploading: nextState.uploading,
      progress: nextState.progress,
      error: nextState.error,
    });
    if (nextState.imageCount > 0) {
      setErrors((current) => {
        if (!current.images) return current;
        return { ...current, images: undefined };
      });
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const nextErrors: FormErrors = {};
    const title = String(formData.get('title') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();
    const categoryId = String(formData.get('categoryId') ?? '').trim();
    const condition = String(formData.get('condition') ?? '').trim();
    const priceRaw = String(formData.get('price') ?? '').trim();
    const inventoryRaw = String(formData.get('inventoryQty') ?? '').trim();
    const images = formData.getAll('images').map(String).filter(Boolean);
    const fallbackImage = String(formData.get('imageUrl') ?? '').trim();
    const resolvedImages = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);

    if (!title) nextErrors.title = 'Please enter a product title.';
    if (!category && !categoryId) nextErrors.category = 'Please select a category.';
    if (!condition) nextErrors.condition = 'Please select an item condition.';

    const price = Number(priceRaw);
    if (!priceRaw || Number.isNaN(price) || price <= 0) {
      nextErrors.price = 'Please enter a valid price.';
    }

    const inventoryQty = Number(inventoryRaw);
    if (!inventoryRaw || Number.isNaN(inventoryQty) || !Number.isInteger(inventoryQty) || inventoryQty < 1) {
      nextErrors.inventoryQty = 'Please enter an inventory quantity of at least 1.';
    }

    if (resolvedImages.length < 1) {
      nextErrors.images = 'Please upload at least 1 product image.';
    } else if (resolvedImages.length > 6) {
      nextErrors.images = 'You can upload up to 6 product images.';
    }
    if (mediaState.uploading) {
      nextErrors.images = 'Please wait for media uploads to finish before submitting.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setErrors({ submit: data?.message ?? 'Unable to submit listing. Please try again.' });
        setSubmitting(false);
        return;
      }

      router.push(data.redirectTo ?? '/seller/dashboard');
    } catch {
      setErrors({ submit: 'Network error. Please try again.' });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4" noValidate>
      <div>
        <label className="label">Title</label>
        <input name="title" className={`input ${errors.title ? 'border-red-500 ring-1 ring-red-100' : ''}`} placeholder="e.g. Used iPhone 13" required minLength={3} />
        {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
      </div>
      <div>
        <label className="label">Description</label>
        <textarea name="description" className="input h-28 resize-none" placeholder="Describe the item in detail…" required minLength={10} />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Price ($)</label>
          <input name="price" type="number" step="0.01" min="0.01" className={`input ${errors.price ? 'border-red-500 ring-1 ring-red-100' : ''}`} placeholder="0.00" required />
          {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price}</p>}
        </div>
        <div className="flex-1">
          <label className="label">Shipping ($)</label>
          <input name="shipping" type="number" step="0.01" min="0" className="input" placeholder="0.00" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <CategoryPicker />
          {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category}</p>}
        </div>
        <div className="flex-1">
          <ConditionPicker required />
          {errors.condition && <p className="mt-1 text-xs text-red-600">{errors.condition}</p>}
        </div>
      </div>
      <MediaUpload
        required
        onStateChange={handleMediaStateChange}
      />
      {errors.images && <p className="mt-1 text-xs text-red-600">{errors.images}</p>}
      {!errors.images && mediaState.imageCount < 1 && (
        <p className="mt-1 text-xs text-slate-500">Upload at least 1 image to enable submission.</p>
      )}
      {mediaState.uploading && (
        <p className="mt-1 text-xs text-slate-500">Uploading media… {mediaState.progress}%</p>
      )}
      <div>
        <label className="label">Inventory (qty)</label>
        <input name="inventoryQty" type="number" min="1" defaultValue="1" className={`input ${errors.inventoryQty ? 'border-red-500 ring-1 ring-red-100' : ''}`} />
        {errors.inventoryQty && <p className="mt-1 text-xs text-red-600">{errors.inventoryQty}</p>}
      </div>

      <fieldset className="border border-slate-200 rounded-xl p-4 space-y-3">
        <legend className="text-sm font-semibold text-slate-700 px-1">Local Pickup (optional)</legend>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="pickupAvailable" value="true" className="rounded" />
          <span className="text-sm text-slate-700">This item is available for local pickup</span>
        </label>
        <p className="text-xs text-slate-500">
          If enabled, buyers can pick up this item directly from you. Only your city and state will be shown publicly — your exact address is never displayed.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">City</label>
            <input name="pickupCity" className="input" placeholder="e.g. Brooklyn" />
          </div>
          <div>
            <label className="label">State</label>
            <input name="pickupState" className="input" placeholder="e.g. NY" maxLength={2} />
          </div>
        </div>
        <div>
          <label className="label">ZIP / Postal code</label>
          <input name="pickupPostalCode" className="input" placeholder="e.g. 11201" />
        </div>
      </fieldset>

      {errors.submit && (
        <div className="card p-3 bg-red-50 border-red-200 text-red-700 text-sm">{errors.submit}</div>
      )}

      <button
        className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
        type="submit"
        disabled={submitting || mediaState.uploading || mediaState.imageCount < 1}
      >
        {submitting ? 'Submitting…' : 'Submit for review'}
      </button>
      <p className="text-xs text-slate-500 text-center">Your listing will be reviewed by an admin before it goes live.</p>
    </form>
  );
}
