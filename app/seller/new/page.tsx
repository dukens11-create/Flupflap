import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import ImageUpload from '@/components/ImageUpload';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'List a New Item' };

const CATEGORIES = ['Electronics', 'Clothing', 'Furniture', 'Books', 'Toys', 'Sports', 'Collectibles', 'Other'];
const CONDITIONS = ['New', 'Like New', 'Used', 'For Parts'];

export default async function SellerNewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');

  // Block restricted sellers from creating new listings
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED') {
    redirect('/seller');
  }

  return (
    <main className="max-w-xl mx-auto">
      <h1 className="text-3xl font-black mb-6">List a new item</h1>
      <form action="/api/seller/products" method="POST" className="card p-6 space-y-4">
        <div>
          <label className="label">Title</label>
          <input name="title" className="input" placeholder="e.g. Used iPhone 13" required minLength={3} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea name="description" className="input h-28 resize-none" placeholder="Describe the item in detail…" required minLength={10} />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label">Price ($)</label>
            <input name="price" type="number" step="0.01" min="0.01" className="input" placeholder="0.00" required />
          </div>
          <div className="flex-1">
            <label className="label">Shipping ($)</label>
            <input name="shipping" type="number" step="0.01" min="0" className="input" placeholder="0.00" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label">Category</label>
            <select name="category" className="input" required>
              <option value="">Select…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="label">Condition</label>
            <select name="condition" className="input" required>
              <option value="">Select…</option>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <ImageUpload required />
        <div>
          <label className="label">Inventory (qty)</label>
          <input name="inventory" type="number" min="1" defaultValue="1" className="input" />
        </div>

        {/* Pickup section */}
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

        <button className="btn-primary w-full" type="submit">Submit for review</button>
        <p className="text-xs text-slate-500 text-center">Your listing will be reviewed by an admin before it goes live.</p>
      </form>
    </main>
  );
}
