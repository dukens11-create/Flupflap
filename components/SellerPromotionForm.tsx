import Link from 'next/link';
import type {
  SalesPromotionStatus,
  SellerDiscountType,
  SellerPromotionTriggerType,
} from '@prisma/client';
import {
  formatDateTimeLocalValue,
  getPromotionRouteLabel,
  getPromotionFieldDescription,
  type PromotionRouteKind,
} from '@/lib/seller-promotions';

type ProductOption = {
  id: string;
  title: string;
  priceCents: number;
};

type InitialValues = {
  name?: string | null;
  description?: string | null;
  status?: SalesPromotionStatus | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  applicableProductIds?: string[];
  totalUsageLimit?: number | null;
  perCustomerLimit?: number | null;
  discountType?: SellerDiscountType | null;
  discountValue?: number | null;
  triggerType?: SellerPromotionTriggerType | null;
  triggerValue?: number | null;
  rewardProductId?: string | null;
  rewardQuantity?: number | null;
};

type Props = {
  kind: PromotionRouteKind;
  action: string;
  products: ProductOption[];
  submitLabel: string;
  cancelHref: string;
  initialValues?: InitialValues;
};

function normalizeFormStatus(status?: SalesPromotionStatus | null) {
  if (status === 'DRAFT' || status === 'ARCHIVED') return status;
  return 'ACTIVE';
}

export default function SellerPromotionForm({
  kind,
  action,
  products,
  submitLabel,
  cancelHref,
  initialValues,
}: Props) {
  const isDiscount = kind === 'discounts';
  const routeLabel = getPromotionRouteLabel(kind);
  return (
    <form action={action} method="POST" className="card p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{submitLabel}</h2>
        <p className="mt-2 text-sm text-slate-500">{getPromotionFieldDescription(kind)}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label" htmlFor="promotion-name">Name</label>
          <input
            id="promotion-name"
            name="name"
            className="input"
            placeholder={`Spring ${routeLabel}`}
            defaultValue={initialValues?.name ?? ''}
            required
          />
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="promotion-description">Description</label>
          <textarea
            id="promotion-description"
            name="description"
            className="input min-h-28 resize-y"
            placeholder="Explain what shoppers will get and which listings qualify."
            defaultValue={initialValues?.description ?? ''}
          />
        </div>

        <div>
          <label className="label" htmlFor="promotion-status">Save as</label>
          <select
            id="promotion-status"
            name="status"
            className="input"
            defaultValue={normalizeFormStatus(initialValues?.status)}
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Ready for schedule / activation</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <p className="mt-1 text-xs text-slate-400">Choose Active to let the start and end dates control scheduled and active status.</p>
        </div>

        <div>
          <label className="label" htmlFor="promotion-total-usage-limit">Total usage cap</label>
          <input
            id="promotion-total-usage-limit"
            name="totalUsageLimit"
            type="number"
            min="1"
            className="input"
            placeholder="Optional"
            defaultValue={initialValues?.totalUsageLimit ?? ''}
          />
        </div>

        <div>
          <label className="label" htmlFor="promotion-starts-at">Starts at</label>
          <input
            id="promotion-starts-at"
            name="startsAt"
            type="datetime-local"
            className="input"
            defaultValue={formatDateTimeLocalValue(initialValues?.startsAt)}
          />
        </div>

        <div>
          <label className="label" htmlFor="promotion-ends-at">Ends at</label>
          <input
            id="promotion-ends-at"
            name="endsAt"
            type="datetime-local"
            className="input"
            defaultValue={formatDateTimeLocalValue(initialValues?.endsAt)}
          />
        </div>

        <div>
          <label className="label" htmlFor="promotion-per-customer-limit">Per-customer limit</label>
          <input
            id="promotion-per-customer-limit"
            name="perCustomerLimit"
            type="number"
            min="1"
            className="input"
            placeholder="Optional"
            defaultValue={initialValues?.perCustomerLimit ?? ''}
          />
        </div>

        <div>
          <label className="label" htmlFor="promotion-applicable-products">Applicable listings</label>
          <select
            id="promotion-applicable-products"
            name="applicableProductIds"
            multiple
            className="input min-h-44"
            defaultValue={initialValues?.applicableProductIds ?? []}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Leave everything unselected to apply the promotion to all of your current listings.</p>
        </div>

        {isDiscount ? (
          <>
            <div>
              <label className="label" htmlFor="promotion-discount-type">Discount type</label>
              <select
                id="promotion-discount-type"
                name="discountType"
                className="input"
                defaultValue={initialValues?.discountType ?? 'PERCENTAGE'}
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED_AMOUNT">Fixed amount</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="promotion-discount-value">Discount value</label>
              <input
                id="promotion-discount-value"
                name="discountValue"
                type="number"
                min="1"
                step="0.01"
                className="input"
                placeholder={initialValues?.discountType === 'FIXED_AMOUNT' ? '5.00' : '10'}
                defaultValue={initialValues?.discountType === 'FIXED_AMOUNT' && initialValues?.discountValue ? (initialValues.discountValue / 100).toFixed(2) : (initialValues?.discountValue ?? '')}
                required
              />
              <p className="mt-1 text-xs text-slate-400">Percentage discounts use whole percentages. Fixed amount discounts use dollars.</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="promotion-trigger-type">Trigger rule</label>
              <select
                id="promotion-trigger-type"
                name="triggerType"
                className="input"
                defaultValue={initialValues?.triggerType ?? 'ANY_PURCHASE'}
              >
                <option value="ANY_PURCHASE">Any purchase</option>
                <option value="MIN_SPEND">Minimum spend</option>
                <option value="MIN_QUANTITY">Minimum quantity</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="promotion-trigger-value">Trigger value</label>
              <input
                id="promotion-trigger-value"
                name="triggerValue"
                type="number"
                min="1"
                step="1"
                className="input"
                placeholder="Leave blank for any purchase"
                defaultValue={initialValues?.triggerValue ?? ''}
              />
            </div>

            <div>
              <label className="label" htmlFor="promotion-reward-product">Free item</label>
              <select
                id="promotion-reward-product"
                name="rewardProductId"
                className="input"
                defaultValue={initialValues?.rewardProductId ?? ''}
                required
              >
                <option value="">Select a reward item</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="promotion-reward-quantity">Reward quantity</label>
              <input
                id="promotion-reward-quantity"
                name="rewardQuantity"
                type="number"
                min="1"
                step="1"
                className="input"
                defaultValue={initialValues?.rewardQuantity ?? 1}
                required
              />
              <input type="hidden" name="rewardType" value="FREE_ITEM" />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary">{submitLabel}</button>
        <Link href={cancelHref} className="btn-outline">Cancel</Link>
      </div>
    </form>
  );
}
