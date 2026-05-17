import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { SellerListingItem } from '@/components/SellerListingsGrid';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import type { SellerListingsSection } from '@/lib/seller-listings-config';
import {
  formatPackageDisplay,
  getEffectivePackageDetails,
  hasStoredPackageDetails,
} from '@/lib/product-package';

function calcConversionRate(orders: number, views: number): string | null {
  if (views <= 0) return null;
  return ((orders / views) * 100).toFixed(1);
}

export function isSellerRestricted(sellerStatus?: string | null) {
  return sellerStatus === 'SUSPENDED' || sellerStatus === 'BANNED' || sellerStatus === 'RESTRICTED';
}

export async function getSellerListingsPageData() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');
  const sellerId = session.user.id;
  if (!sellerId) redirect('/login');

  const [dbUser, products, soldItems] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sellerId },
      select: { sellerStatus: true },
    }),
    prisma.product.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      include: {
        promotions: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
        cartInterest: {
          select: {
            totalAdds: true,
          },
        },
      },
    }),
    prisma.orderItem.findMany({
      where: {
        product: { sellerId },
        order: { status: { in: ['PAID', 'SHIPPED', 'DELIVERED', 'PICKED_UP'] } },
      },
      select: {
        productId: true,
        order: { select: { id: true } },
      },
    }),
  ]);

  if (!dbUser) redirect('/login');

  const isRestricted = isSellerRestricted(dbUser.sellerStatus);

  const orderCountByProductId = soldItems.reduce((acc, item) => {
    if (!acc.has(item.productId)) acc.set(item.productId, new Set<string>());
    acc.get(item.productId)?.add(item.order.id);
    return acc;
  }, new Map<string, Set<string>>());

  const listings: SellerListingItem[] = products.map((product) => {
    const activePromo = product.promotions[0] ?? null;
    const cartAdds = product.cartInterest?.totalAdds ?? 0;
    const viewCount = product.viewCount ?? 0;
    const soldQty = product.soldQty ?? 0;
    const productOrders = orderCountByProductId.get(product.id)?.size ?? 0;
    const conversionRate = calcConversionRate(productOrders, viewCount);
    const shippingSetupIncomplete = !hasStoredPackageDetails(product);
    const packageDetails = getEffectivePackageDetails(product);

    return {
      id: product.id,
      title: product.title,
      category: product.category,
      condition: product.condition,
      priceCents: product.priceCents,
      status: product.status,
      inventory: product.inventory,
      viewCount,
      soldQty,
      imageUrl: product.imageUrl ?? null,
      cartAdds,
      isPromoted: !!activePromo,
      promotionLabel: activePromo
        ? `⭐ Promoted until ${activePromo.expiresAt ? activePromo.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}`
        : null,
      conversionRate,
      shippingIncomplete: shippingSetupIncomplete,
      packageSummary: packageDetails
        ? formatPackageDisplay(packageDetails, shippingSetupIncomplete)
        : null,
    };
  });

  return {
    isRestricted,
    listings,
  };
}
