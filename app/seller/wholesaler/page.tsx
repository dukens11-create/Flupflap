import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function SellerWholesalerCatalogPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');

  const products = await prisma.supplierProduct.findMany({
    where: {
      quantity: { gt: 0 },
      isAvailable: true,
      supplier: { status: 'APPROVED' },
    },
    include: {
      supplier: {
        select: {
          displayName: true,
          userId: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <h1 className="text-3xl font-black">Wholesaler Catalog</h1>
      <p className="text-sm text-slate-600">Browse approved wholesaler products and add them to your store.</p>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {products.map((product) => (
          <article key={product.id} className="card p-4 space-y-3">
            <p className="text-xs text-slate-500">Supplier: {product.supplier.displayName}</p>
            <h2 className="font-bold text-lg leading-tight">{product.title}</h2>
            <p className="text-sm text-slate-600 line-clamp-3">{product.description}</p>
            <p className="text-sm">Wholesale: <strong>{dollars(product.wholesalePriceCents)}</strong></p>
            <p className="text-sm">Retail default: <strong>{dollars(product.retailPriceCents)}</strong></p>
            <p className="text-sm">Stock: {product.quantity}</p>
            <form action="/api/seller/wholesaler/listings" method="post" className="space-y-2">
              <input type="hidden" name="supplierProductId" value={product.id} />
              <label className="block text-xs text-slate-600">Override retail price (cents)
                <input name="priceCents" defaultValue={product.retailPriceCents} className="mt-1 w-full border rounded px-2 py-1" />
              </label>
              <button type="submit" className="w-full px-3 py-2 rounded bg-slate-900 text-white text-sm">List in my store</button>
            </form>
          </article>
        ))}
      </div>

      {products.length === 0 && <p className="text-sm text-slate-500">No approved wholesaler products are available.</p>}
    </main>
  );
}
