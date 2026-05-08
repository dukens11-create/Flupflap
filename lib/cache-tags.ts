import { revalidateTag } from 'next/cache';

export const PRODUCTS_CACHE_TAG = 'products';

export function productCacheTag(productId: string) {
  return `product:${productId}`;
}

export function revalidateProductsCache(productId?: string) {
  revalidateTag(PRODUCTS_CACHE_TAG, 'max');
  if (productId) {
    revalidateTag(productCacheTag(productId), 'max');
  }
}
