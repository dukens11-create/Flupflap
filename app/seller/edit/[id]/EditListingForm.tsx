'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import CategoryPicker from '@/components/CategoryPicker';
import ConditionPicker from '@/components/ConditionPicker';
import MediaUpload, { type MediaUploadState } from '@/components/MediaUpload';
import { readApiMessage } from '@/lib/read-api-message';

interface EditListingFormProps {
  id: string;
  canDelete: boolean;
  // Basic fields
  defaultTitle: string;
  defaultDescription: string;
  defaultPriceDollars: string;
  defaultShippingDollars: string;
  defaultInventory: number;
  // Category & condition
  defaultCategoryId?: string | null;
  defaultSubcategoryId?: string | null;
  defaultAttributes?: Record<string, string> | null;
  defaultCondition?: string | null;
  defaultCategorySlug?: string;
  // Media
  defaultImages: string[];
  defaultOriginalImages: string[];
  defaultEnhancedImages: string[];
  defaultImageThumbnails: string[];
  defaultVideoUrl: string;
  // Package
  defaultWeight?: string;
  defaultWeightUnit?: string;
  defaultPackageType?: string;
  defaultShippingClass?: string;
  defaultLength?: string;
  defaultWidth?: string;
  defaultHeight?: string;
  shippingSetupIncomplete: boolean;
  // Pickup
  defaultPickupAvailable: boolean;
  defaultPickupCity?: string | null;
  defaultPickupState?: string | null;
  defaultPickupPostalCode?: string | null;
}

export default function EditListingForm({
  id,
  canDelete,
  defaultTitle,
  defaultDescription,
  defaultPriceDollars,
  defaultShippingDollars,
  defaultInventory,
  defaultCategoryId,
  defaultSubcategoryId,
  defaultAttributes,
  defaultCondition,
  defaultCategorySlug,
  defaultImages,
  defaultOriginalImages,
  defaultEnhancedImages,
  defaultImageThumbnails,
  defaultVideoUrl,
  defaultWeight,
  defaultWeightUnit,
  defaultPackageType,
  defaultShippingClass,
  defaultLength,
  defaultWidth,
  defaultHeight,
  shippingSetupIncomplete,
  defaultPickupAvailable,
  defaultPickupCity,
  defaultPickupState,
  defaultPickupPostalCode,
}: EditListingFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mediaState, setMediaState] = useState<MediaUploadState>({
    imageCount: defaultImages.length,
    uploadedImageCount: defaultImages.length,
    isUploading: false,
    isEnhancing: false,
    hasErrors: false,
    canSubmit: defaultImages.length > 0,
    message: defaultImages.length > 0 ? '' : 'Please upload at least one image.',
  });

  const handleMediaStateChange = useCallback((nextState: MediaUploadState) => {
    setMediaState(nextState);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    // Client-side validation
    const condition = String(formData.get('condition') ?? '').trim();
    const submittedCategoryId = String(formData.get('categoryId') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();
    const isCategoryStale = formData.get('categoryStale') === 'true';
    const weight = String(formData.get('weight') ?? '').trim();
    const length = String(formData.get('length') ?? '').trim();
    const width = String(formData.get('width') ?? '').trim();
    const height = String(formData.get('height') ?? '').trim();
    const images = formData.getAll('images').map(String).filter(Boolean);
    const imageUrl = String(formData.get('imageUrl') ?? '').trim();
    const resolvedImages = images.length > 0 ? images : (imageUrl ? [imageUrl] : []);

    if (!isCategoryStale && !category && !submittedCategoryId) {
      setSubmitError('Please select a category.');
      return;
    }
    if (!condition) {
      setSubmitError('Please select an item condition.');
      return;
    }
    if (!weight || !length || !width || !height) {
      setSubmitError('Please fill in all shipping package dimensions (weight, length, width, height).');
      return;
    }
    const numericPackageValues = [weight, length, width, height].map(Number);
    if (numericPackageValues.some((value) => Number.isNaN(value) || value <= 0)) {
      const packageFields = [
        ['weight', numericPackageValues[0]],
        ['length', numericPackageValues[1]],
        ['width', numericPackageValues[2]],
        ['height', numericPackageValues[3]],
      ] as const;
      const invalidField = packageFields.find(([, value]) => Number.isNaN(value) || value <= 0)?.[0];
      setSubmitError(`Shipping package ${invalidField ?? 'values'} must be greater than 0.`);
      return;
    }
    const shippingRaw = String(formData.get('shipping') ?? '').trim();
    if (shippingRaw) {
      const shippingValue = Number(shippingRaw);
      if (Number.isNaN(shippingValue) || shippingValue < 0) {
        setSubmitError('Please enter a valid shipping amount.');
        return;
      }
    }
    if (resolvedImages.length < 1) {
      setSubmitError('Please upload at least one product image.');
      return;
    }
    if (mediaState.isUploading || mediaState.isEnhancing || !mediaState.canSubmit) {
      setSubmitError(mediaState.message || 'Please wait for media uploads to finish before submitting.');
      return;
    }

    setSubmitError('');
    setSubmitting(true);

    try {
      const res = await fetch(`/api/seller/products/${id}`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });

      if (!res.ok) {
        const errorMessage = await readApiMessage(
          res,
          'Unable to save listing changes. Please review the form and try again.',
        );
        setSubmitError(errorMessage);
        setSubmitting(false);
        return;
      }
      const data = await res.json();

      const redirectTo = data?.redirectTo ?? `/seller?updated=${id}`;
      router.push(redirectTo);
    } catch (err) {
      console.error('[EditListingForm] network error:', err);
      setSubmitError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!canDelete || submitting || deleting) return;
    const confirmed = window.confirm('Delete this listing permanently? This cannot be undone.');
    if (!confirmed) return;

    setSubmitError('');
    setDeleting(true);
    try {
      const res = await fetch(`/api/seller/products/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      let data: { error?: string; message?: string } = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error('[EditListingForm] delete response parse error:', parseErr);
      }
      if (!res.ok) {
        const errorMessage = data?.error ?? data?.message ?? 'Unable to delete this listing right now.';
        setSubmitError(errorMessage);
        setDeleting(false);
        return;
      }
      router.push('/seller?deleted=1');
    } catch (err) {
      console.error('[EditListingForm] delete network error:', err);
      setSubmitError('Network error. Please check your connection and try again.');
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4" noValidate>
      {submitError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </p>
      )}
      <div>
        <label className="label">Title</label>
        <input
          name="title"
          className="input"
          defaultValue={defaultTitle}
          required
          minLength={3}
        />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea
          name="description"
          className="input h-28 resize-none"
          defaultValue={defaultDescription}
          required
          minLength={10}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Price ($)</label>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            className="input"
            defaultValue={defaultPriceDollars}
            required
          />
        </div>
        <div className="flex-1">
          <label className="label">Shipping ($)</label>
          <input
            name="shipping"
            type="number"
            step="0.01"
            min="0"
            className="input"
            defaultValue={defaultShippingDollars}
          />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <CategoryPicker
            defaultCategoryId={defaultCategoryId}
            defaultSubcategoryId={defaultSubcategoryId}
            defaultAttributes={defaultAttributes}
          />
        </div>
        <div className="flex-1">
          <ConditionPicker
            defaultCondition={defaultCondition ?? undefined}
            defaultSlug={defaultCategorySlug}
            required
          />
        </div>
      </div>
      <MediaUpload
        defaultImages={defaultImages}
        defaultOriginalImages={defaultOriginalImages}
        defaultEnhancedImages={defaultEnhancedImages}
        defaultImageThumbnails={defaultImageThumbnails}
        defaultVideoUrl={defaultVideoUrl}
        required
        onStateChange={handleMediaStateChange}
      />

      <div>
        <label className="label">Available quantity / Stock</label>
        <input
          name="inventory"
          type="number"
          min="1"
          max="9999"
          className="input"
          defaultValue={defaultInventory}
        />
      </div>

      <fieldset
        className={`border rounded-xl p-4 space-y-3 ${
          shippingSetupIncomplete ? 'border-yellow-300 bg-yellow-50/60' : 'border-slate-200'
        }`}
      >
        <legend className="text-sm font-semibold text-slate-700 px-1">Shipping &amp; Package Details</legend>
        <p className="text-xs text-slate-500">
          Required for reliable Shippo rate calculation and publishing this product.
        </p>
        {shippingSetupIncomplete && (
          <p className="text-xs text-yellow-800 bg-yellow-100 border border-yellow-200 rounded-lg px-3 py-2">
            Shipping setup incomplete. Suggested defaults have been filled in so you can update and save this listing.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Weight</label>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <input
                name="weight"
                type="number"
                step="0.01"
                min="0.01"
                className="input"
                defaultValue={defaultWeight ?? ''}
                required
              />
              <select name="weightUnit" className="input" defaultValue={defaultWeightUnit ?? 'lb'}>
                <option value="lb">lb</option>
                <option value="oz">oz</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Package type</label>
            <select name="packageType" className="input" defaultValue={defaultPackageType ?? 'PACKAGE'}>
              <option value="PACKAGE">Package / Parcel</option>
              <option value="LETTER">Letter</option>
              <option value="FLAT_RATE_ENVELOPE">Flat Rate Envelope</option>
              <option value="FLAT_RATE_BOX">Flat Rate Box</option>
              <option value="SMALL_FLAT_RATE_BOX">Small Flat Rate Box</option>
              <option value="MEDIUM_FLAT_RATE_BOX">Medium Flat Rate Box</option>
              <option value="LARGE_FLAT_RATE_BOX">Large Flat Rate Box</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Shipping class (optional)</label>
          <input
            name="shippingClass"
            className="input"
            placeholder="e.g. Standard parcel"
            defaultValue={defaultShippingClass ?? ''}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Length (in)</label>
            <input
              name="length"
              type="number"
              step="0.01"
              min="0.01"
              className="input"
              defaultValue={defaultLength ?? ''}
              required
            />
          </div>
          <div>
            <label className="label">Width (in)</label>
            <input
              name="width"
              type="number"
              step="0.01"
              min="0.01"
              className="input"
              defaultValue={defaultWidth ?? ''}
              required
            />
          </div>
          <div>
            <label className="label">Height (in)</label>
            <input
              name="height"
              type="number"
              step="0.01"
              min="0.01"
              className="input"
              defaultValue={defaultHeight ?? ''}
              required
            />
          </div>
          <div>
            <label className="label">Dimension unit</label>
            <input
              name="packageDimensionUnit"
              value="in"
              className="input bg-slate-50 text-slate-500"
              readOnly
            />
          </div>
        </div>
      </fieldset>

      {/* Pickup section */}
      <fieldset className="border border-slate-200 rounded-xl p-4 space-y-3">
        <legend className="text-sm font-semibold text-slate-700 px-1">Local Pickup (optional)</legend>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="pickupAvailable"
            value="true"
            defaultChecked={defaultPickupAvailable}
            className="rounded"
          />
          <span className="text-sm text-slate-700">This item is available for local pickup</span>
        </label>
        <p className="text-xs text-slate-500">
          Only your city and state will be shown publicly — your exact address is never displayed.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">City</label>
            <input
              name="pickupCity"
              className="input"
              placeholder="e.g. Brooklyn"
              defaultValue={defaultPickupCity ?? ''}
            />
          </div>
          <div>
            <label className="label">State</label>
            <input
              name="pickupState"
              className="input"
              placeholder="e.g. NY"
              maxLength={2}
              defaultValue={defaultPickupState ?? ''}
            />
          </div>
        </div>
        <div>
          <label className="label">ZIP / Postal code</label>
          <input
            name="pickupPostalCode"
            className="input"
            placeholder="e.g. 11201"
            defaultValue={defaultPickupPostalCode ?? ''}
          />
        </div>
      </fieldset>

      <div className="flex gap-3">
        <a href="/seller" className="btn-outline flex-1 text-center">
          Cancel
        </a>
        <button className="btn-primary flex-1" type="submit" disabled={submitting || deleting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      {canDelete && (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-2">
          <h2 className="font-semibold text-red-700">Danger zone</h2>
          <p className="text-sm text-slate-600">
            Permanently delete this listing. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting || deleting}
            className="btn bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {deleting ? 'Processing…' : 'Delete listing'}
          </button>
        </div>
      )}
      <p className="text-xs text-slate-500 text-center">
        Your listing will return to &quot;Pending&quot; status and be re-reviewed by an admin.
      </p>
    </form>
  );
}
