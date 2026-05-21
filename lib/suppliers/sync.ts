import type { Prisma, ProductStatus, SupplierProvider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSupplierAdapter } from '@/lib/suppliers/providers';
import { persistSupplierErrorLog } from '@/lib/suppliers/logging';
import type { SupplierProductDTO } from '@/lib/suppliers/types';

type InventorySyncStats = {
  updatedProducts: number;
  markedUnavailable: number;
};

function deriveSupplierBackedStatus(inventory: number | null, currentStatus: ProductStatus) {
  if (inventory === null) return { status: currentStatus, delistedAt: undefined as Date | null | undefined };
  if (inventory <= 0) return { status: 'SOLD' as ProductStatus, delistedAt: new Date() };
  if (currentStatus === 'SOLD') return { status: 'APPROVED' as ProductStatus, delistedAt: null };
  return { status: currentStatus, delistedAt: null };
}

async function syncMappedInventory(products: SupplierProductDTO[]): Promise<InventorySyncStats> {
  let updatedProducts = 0;
  let markedUnavailable = 0;

  for (const product of products) {
    const catalog = await prisma.supplierCatalogItem.findUnique({
      where: {
        provider_externalProductId: {
          provider: product.provider,
          externalProductId: product.externalProductId,
        },
      },
      select: {
        mappedProductId: true,
      },
    });

    if (!catalog?.mappedProductId) continue;

    const local = await prisma.product.findUnique({
      where: { id: catalog.mappedProductId },
      select: { id: true, status: true },
    });
    if (!local) continue;

    const availability = deriveSupplierBackedStatus(product.inventory, local.status);
    await prisma.product.update({
      where: { id: local.id },
      data: {
        inventory: product.inventory ?? undefined,
        status: availability.status,
        delistedAt: availability.delistedAt,
      },
    });

    updatedProducts += 1;
    if (product.inventory !== null && product.inventory <= 0) {
      markedUnavailable += 1;
    }
  }

  return { updatedProducts, markedUnavailable };
}

export async function runSupplierProductSync(provider: SupplierProvider, requestContext?: Record<string, unknown>) {
  const run = await prisma.supplierSyncRun.create({
    data: {
      provider,
      operation: 'PRODUCT_SYNC',
      status: 'STARTED',
      startedAt: new Date(),
    },
  });

  try {
    const adapter = getSupplierAdapter(provider);
    const products = await adapter.fetchProducts();

    let upsertedCount = 0;
    for (const product of products) {
      await prisma.supplierCatalogItem.upsert({
        where: {
          provider_externalProductId: {
            provider,
            externalProductId: product.externalProductId,
          },
        },
        create: {
          provider,
          externalProductId: product.externalProductId,
          sku: product.sku,
          title: product.title,
          description: product.description,
          priceCents: product.priceCents,
          currency: product.currency,
          inventory: product.inventory,
          available: product.available,
          rawPayload: product.rawPayload as Prisma.InputJsonValue,
          lastSyncedAt: new Date(),
        },
        update: {
          sku: product.sku,
          title: product.title,
          description: product.description,
          priceCents: product.priceCents,
          currency: product.currency,
          inventory: product.inventory,
          available: product.available,
          rawPayload: product.rawPayload as Prisma.InputJsonValue,
          lastSyncedAt: new Date(),
        },
      });
      upsertedCount += 1;
    }

    const inventoryStats = await syncMappedInventory(products);

    const completed = await prisma.supplierSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        fetchedCount: products.length,
        upsertedCount,
        failedCount: 0,
        metadata: {
          inventorySync: inventoryStats,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      runId: completed.id,
      provider,
      fetchedCount: products.length,
      upsertedCount,
      inventory: inventoryStats,
    };
  } catch (error) {
    await prisma.supplierSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        completedAt: new Date(),
        errorCode: (error as { code?: string })?.code ?? 'SUPPLIER_SYNC_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    await persistSupplierErrorLog({
      provider,
      operation: 'PRODUCT_SYNC',
      error,
      requestContext,
      syncRunId: run.id,
    });
    throw error;
  }
}
