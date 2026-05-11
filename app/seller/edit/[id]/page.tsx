import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import CategoryPicker from '@/components/CategoryPicker';
import ConditionPicker from '@/components/ConditionPicker';
import MediaUpload from '@/components/MediaUpload';
import type { Metadata } from 'next';
import { isSellerVerificationApproved } from '@/lib/seller-verification';

export const metadata: Metadata = { title: 'Edit Listing' };

export default async function SellerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');

  // Block restricted sellers from editing listings
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
    redirect('/seller');
  }

  const verification = await prisma.sellerVerification.findUnique({
    where: { sellerId: session.user.id },
    select: { status: true },
  });
  if (!isSellerVerificationApproved(verification?.status)) {
    redirect('/seller?verification=required');
  }

  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, sellerId: session.user.id },
    include: {
      subcategoryRef: { select: { slug: true } },
      categoryRef: { select: { slug: true } },
    },
  });

  if (!product) notFound();

  const priceDollars = (product.priceCents / 100).toFixed(2);
  const shippingDollars = (product.shippingCents / 100).toFixed(2);
  const defaultImages = product.images?.length
    ? product.images
    : product.imageUrl
      ? [product.imageUrl]
      : [];
  // Use the most specific category slug for the condition picker seed value.
  const defaultCategorySlug =
    product.subcategoryRef?.slug ?? product.categoryRef?.slug ?? undefined;

  return (
    <main className="max-w-xl mx-auto">
      <h1 className="text-3xl font-black mb-2">Edit listing</h1>
      <p className="text-sm text-slate-500 mb-6">
        Changes will require re-approval by an admin before going live.
      </p>
      <form action={`/api/seller/products/${id}`} method="POST" className="card p-6 space-y-4">
        <div>
          <label className="label">Title</label>
          <input
            name="title"
            className="input"
            defaultValue={product.title}
            required
            minLength={3}
          />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            name="description"
            className="input h-28 resize-none"
            defaultValue={product.description}
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
              defaultValue={priceDollars}
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
              defaultValue={shippingDollars}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <CategoryPicker
              defaultCategoryId={product.categoryId}
              defaultSubcategoryId={product.subcategoryId}
              defaultAttributes={(product.productAttributes as Record<string, string> | null) ?? undefined}
            />
          </div>
          <div className="flex-1">
            <ConditionPicker
              defaultCondition={product.condition}
              defaultSlug={defaultCategorySlug}
              required
            />
          </div>
        </div>
        <MediaUpload
          defaultImages={defaultImages}
          defaultVideoUrl={product.videoUrl ?? ''}
          required
        />
        <div>
          <label className="label">Available quantity / Stock</label>
          <input
            name="inventory"
            type="number"
            min="1"
            max="9999"
            className="input"
            defaultValue={product.inventory}
          />
        </div>

        {/* Pickup section */}
        <fieldset className="border border-slate-200 rounded-xl p-4 space-y-3">
          <legend className="text-sm font-semibold text-slate-700 px-1">Local Pickup (optional)</legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="pickupAvailable"
              value="true"
              defaultChecked={product.pickupAvailable}
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
                defaultValue={product.pickupCity ?? ''}
              />
            </div>
            <div>
              <label className="label">State</label>
              <input
                name="pickupState"
                className="input"
                placeholder="e.g. NY"
                maxLength={2}
                defaultValue={product.pickupState ?? ''}
              />
            </div>
          </div>
          <div>
            <label className="label">ZIP / Postal code</label>
            <input
              name="pickupPostalCode"
              className="input"
              placeholder="e.g. 11201"
              defaultValue={product.pickupPostalCode ?? ''}
            />
          </div>
        </fieldset>

        <div className="flex gap-3">
          <a href="/seller" className="btn-outline flex-1 text-center">Cancel</a>
          <button className="btn-primary flex-1" type="submit">Save changes</button>
        </div>
        <p className="text-xs text-slate-500 text-center">
          Your listing will return to &quot;Pending&quot; status and be re-reviewed by an admin.
        </p>
      </form>

      {product.status !== 'SOLD' && (
        <div className="mt-6 card p-4 border-red-200">
          <h2 className="font-bold text-red-700 mb-2">Danger zone</h2>
          <p className="text-sm text-slate-500 mb-3">
            Permanently delete this listing. This cannot be undone.
          </p>
          <form action={`/api/seller/products/${id}`} method="POST">
            <input type="hidden" name="_method" value="delete" />
            <button
              type="submit"
              className="btn bg-red-600 hover:bg-red-700 text-white text-sm"
            >
              Delete listing
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
