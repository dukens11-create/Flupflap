'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import CategoryPicker, { type SelectedCategoryState } from '@/components/CategoryPicker';
import ConditionPicker from '@/components/ConditionPicker';
import MediaUpload, { type MediaUploadState } from '@/components/MediaUpload';
import { readApiMessage } from '@/lib/read-api-message';

type FormErrors = {
  title?: string;
  price?: string;
  inventoryQty?: string;
  category?: string;
  condition?: string;
  images?: string;
  shippingPackage?: string;
  submit?: string;
};

const INVALID_CATEGORY_MESSAGE = 'Please select a valid category before submitting.';
const EMPTY_SELECTED_CATEGORY: SelectedCategoryState = {
  categoryId: '',
  categoryName: '',
  categorySlug: '',
  categoryPath: '',
  leafCategoryId: '',
  parentCategoryId: '',
  subcategoryId: '',
  stale: false,
};

export default function NewListingForm() {
  const router = useRouter();
  const minScheduleDate = new Date().toISOString().slice(0, 16);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [shippingMode, setShippingMode] = useState<'CALCULATED' | 'FREE' | 'FLAT'>('CALCULATED');
  const [mediaState, setMediaState] = useState<MediaUploadState>({
    imageCount: 0,
    uploadedImageCount: 0,
    isUploading: false,
    isEnhancing: false,
    hasErrors: false,
    canSubmit: false,
    message: 'Please upload at least one image.',
  });
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategoryState>(EMPTY_SELECTED_CATEGORY);

  const handleMediaStateChange = useCallback((nextState: MediaUploadState) => {
    setMediaState(nextState);
    setErrors((current) => {
      if (!current.images) return current;
      if (nextState.isUploading || nextState.hasErrors || !nextState.canSubmit) {
        return { ...current, images: nextState.message || current.images };
      }
      const nextErrors = { ...current };
      delete nextErrors.images;
      return nextErrors;
    });
  }, []);
  const handleCategoryChange = useCallback((nextCategory: SelectedCategoryState) => {
    setSelectedCategory(nextCategory);
    if (!nextCategory.categoryId || nextCategory.stale) return;
    setErrors((current) => {
      if (!current.category) return current;
      const nextErrors = { ...current };
      delete nextErrors.category;
      return nextErrors;
    });
  }, []);
  const shippingPackageInputClass = `input ${errors.shippingPackage ? 'border-red-300 ring-1 ring-red-100' : ''}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const nativeSubmitEvent = event.nativeEvent as SubmitEvent;
    const submitter = nativeSubmitEvent.submitter as HTMLButtonElement | null;
    const submitAction = (submitter?.value as 'SAVE_DRAFT' | 'SCHEDULE' | 'PUBLISH_NOW' | undefined) ?? 'PUBLISH_NOW';
    formData.set('submitAction', submitAction);

    const nextErrors: FormErrors = {};
    const title = String(formData.get('title') ?? '').trim();
    const categoryId = String(formData.get('categoryId') ?? '').trim();
    const categoryPath = String(formData.get('categoryPath') ?? '').trim();
    const categoryName = String(formData.get('categoryName') ?? formData.get('category') ?? '').trim();
    const categorySlug = String(formData.get('categorySlug') ?? '').trim();
    const categoryStale = String(formData.get('categoryStale') ?? '').trim() === 'true';
    const condition = String(formData.get('condition') ?? '').trim();
    const priceRaw = String(formData.get('price') ?? '').trim();
    const inventoryRaw = String(formData.get('inventoryQty') ?? '').trim();
    const packageWeightRaw = String(formData.get('weight') ?? '').trim();
    const packageLengthRaw = String(formData.get('length') ?? '').trim();
    const packageWidthRaw = String(formData.get('width') ?? '').trim();
    const packageHeightRaw = String(formData.get('height') ?? '').trim();
    const packageInputs = [packageWeightRaw, packageLengthRaw, packageWidthRaw, packageHeightRaw];
    const images = formData.getAll('images').map(String).filter(Boolean);
    const fallbackImage = String(formData.get('imageUrl') ?? '').trim();
    const resolvedImages = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);

    const isDraft = submitAction === 'SAVE_DRAFT';
    const isScheduled = submitAction === 'SCHEDULE';
    if (!isDraft) {
      if (!title) nextErrors.title = 'Please enter a product title.';
      if (!categoryId || categoryStale) nextErrors.category = INVALID_CATEGORY_MESSAGE;
      if (!condition) nextErrors.condition = 'Please select an item condition.';
    }

    const price = Number(priceRaw);
    if (!isDraft && (!priceRaw || Number.isNaN(price) || price <= 0)) {
      nextErrors.price = 'Please enter a valid price.';
    }

    const inventoryQty = Number(inventoryRaw);
    if (!isDraft && (!inventoryRaw || Number.isNaN(inventoryQty) || !Number.isInteger(inventoryQty) || inventoryQty < 1 || inventoryQty > 9999)) {
      nextErrors.inventoryQty = 'Please enter an inventory quantity between 1 and 9999.';
    }
    if (!isDraft && shippingMode === 'FLAT') {
      const shippingRaw = String(formData.get('shipping') ?? '').trim();
      const shippingPrice = Number(shippingRaw);
      if (!shippingRaw || Number.isNaN(shippingPrice) || shippingPrice < 0) {
        nextErrors.submit = 'Please enter a valid flat shipping amount.';
      }
    }

    const packageValues = packageInputs.map(Number);
    if (!isDraft && (
      packageInputs.some((value) => !value)
      || packageValues.some((value) => Number.isNaN(value) || value <= 0)
    )) {
      nextErrors.shippingPackage = 'Shipping package details are required.';
    }

    if (!isDraft && resolvedImages.length < 1) {
      nextErrors.images = 'Please upload at least 1 product image.';
    } else if (!isDraft && resolvedImages.length > 6) {
      nextErrors.images = 'You can upload up to 6 product images.';
    } else if (!isDraft && !mediaState.canSubmit) {
      nextErrors.images = mediaState.message || 'Please wait for media uploads to finish before submitting.';
    }
    if (isScheduled) {
      const scheduledFor = String(formData.get('scheduledFor') ?? '').trim();
      if (!scheduledFor) {
        nextErrors.submit = 'Choose a future date/time to schedule this listing.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const payload = {
      ...Object.fromEntries(formData.entries()),
      categoryId,
      categoryName,
      categorySlug,
      categoryPath,
      subcategoryId: String(formData.get('subcategoryId') ?? '').trim(),
      parentCategoryId: String(formData.get('parentCategoryId') ?? '').trim(),
      images: formData.getAll('images').map(String).filter(Boolean),
      originalImages: formData.getAll('originalImages').map(String).filter(Boolean),
      enhancedImages: formData.getAll('enhancedImages').map(String).filter(Boolean),
      imageThumbnails: formData.getAll('imageThumbnails').map(String).filter(Boolean),
    };

    setErrors({});
    setSubmitting(true);
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('selectedCategory', selectedCategory);
        console.log('hiddenCategoryInputs', {
          categoryId,
          subcategoryId: String(formData.get('subcategoryId') ?? '').trim(),
          parentCategoryId: String(formData.get('parentCategoryId') ?? '').trim(),
          leafCategoryId: String(formData.get('leafCategoryId') ?? '').trim(),
        });
        console.log('categoryId', categoryId);
        console.log('categoryPath', categoryPath);
        console.log('payload', payload);
      }
      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      if (!res.ok) {
        const message = await readApiMessage(res, 'Unable to submit listing. Please try again.');
        setErrors({ submit: message });
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      if (!data?.success) {
        setErrors({ submit: data?.message ?? 'Unable to submit listing. Please try again.' });
        setSubmitting(false);
        return;
      }

      router.push(data.redirectTo ?? '/seller/listings/drafts');
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
        <label className="label" htmlFor="scheduledFor">Schedule publish time (optional)</label>
        <input id="scheduledFor" name="scheduledFor" type="datetime-local" className="input" min={minScheduleDate} />
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
          <label className="label">Shipping</label>
          <select
            name="shippingMode"
            value={shippingMode}
            onChange={(e) => setShippingMode(e.target.value as 'CALCULATED' | 'FREE' | 'FLAT')}
            className="input"
          >
            <option value="CALCULATED">Calculated at checkout</option>
            <option value="FREE">Free shipping</option>
            <option value="FLAT">Flat rate</option>
          </select>
        </div>
        {shippingMode === 'FLAT' && (
          <div className="flex-1">
            <label className="label">Flat shipping ($)</label>
            <input name="shipping" type="number" step="0.01" min="0" className="input" placeholder="0.00" />
          </div>
        )}
        {/* When mode is not FLAT, send shipping=0 so the API never receives a stale flat-rate value */}
        {shippingMode !== 'FLAT' && <input type="hidden" name="shipping" value="0" />}
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <CategoryPicker onSelectionChange={handleCategoryChange} />
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
      <div>
        <label className="label">Available quantity / Stock</label>
        <input name="inventoryQty" type="number" min="1" max="9999" defaultValue="1" className={`input ${errors.inventoryQty ? 'border-red-500 ring-1 ring-red-100' : ''}`} />
        {errors.inventoryQty && <p className="mt-1 text-xs text-red-600">{errors.inventoryQty}</p>}
      </div>

      {/* Package Info for shipping calculation */}
      <fieldset className={`border rounded-xl p-4 space-y-3 ${errors.shippingPackage ? 'border-red-300 bg-red-50/40' : 'border-slate-200'}`}>
        <legend className="text-sm font-semibold text-slate-700 px-1">Shipping & Package Details</legend>
        <p className="text-xs text-slate-500">
          Required for reliable Shippo rate calculation. Buyers will see live carrier rates at checkout.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Weight</label>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <input
                name="weight"
                type="number"
                step="0.01"
                min="0.01"
                className={shippingPackageInputClass}
                placeholder="e.g. 1"
                required
              />
              <select name="weightUnit" className={shippingPackageInputClass}>
                <option value="lb">lb</option>
                <option value="oz">oz</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Package type</label>
            <select name="packageType" className={shippingPackageInputClass} defaultValue="PACKAGE">
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
          <input name="shippingClass" className={shippingPackageInputClass} placeholder="e.g. Standard parcel" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Length (in)</label>
            <input name="length" type="number" step="0.01" min="0.01" className={shippingPackageInputClass} placeholder="e.g. 8" required />
          </div>
          <div>
            <label className="label">Width (in)</label>
            <input name="width" type="number" step="0.01" min="0.01" className={shippingPackageInputClass} placeholder="e.g. 6" required />
          </div>
          <div>
            <label className="label">Height (in)</label>
            <input name="height" type="number" step="0.01" min="0.01" className={shippingPackageInputClass} placeholder="e.g. 4" required />
          </div>
          <div>
            <label className="label">Dimension unit</label>
            <input value="in" className={`${shippingPackageInputClass} bg-slate-50 text-slate-500`} readOnly />
          </div>
        </div>
        {errors.shippingPackage && (
          <p className="text-xs text-red-600">
            {errors.shippingPackage} Fill in weight, length, width, and height.
          </p>
        )}
      </fieldset>

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
      {selectedCategory.categoryPath && !selectedCategory.stale && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Selected category: {selectedCategory.categoryPath}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="submit" name="submitAction" value="SAVE_DRAFT" className="btn-outline" disabled={submitting || mediaState.isUploading || mediaState.isEnhancing}>Save Draft</button>
        <button type="submit" name="submitAction" value="SCHEDULE" className="btn-outline" disabled={submitting || mediaState.isUploading || mediaState.isEnhancing}>Schedule</button>
        <button type="submit" name="submitAction" value="PUBLISH_NOW" className="btn-primary" disabled={submitting || mediaState.isUploading || mediaState.isEnhancing}>Publish Now</button>
      </div>
      <p className="text-xs text-slate-500 text-center">
        Draft listings stay private until published. Scheduled listings auto-publish at the selected time.
      </p>
    </form>
  );
}
