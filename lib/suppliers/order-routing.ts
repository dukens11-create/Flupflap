import type { Prisma, SupplierProvider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSupplierAdapter } from '@/lib/suppliers/providers';
import { persistSupplierErrorLog } from '@/lib/suppliers/logging';

type RouteSupplierOrderInput = {
  provider: SupplierProvider;
  orderId: string;
  submitToSupplier?: boolean;
};

export async function routeSupplierOrder(input: RouteSupplierOrderInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: {
        select: {
          id: true,
          quantity: true,
          productId: true,
        },
      },
    },
  });

  if (!order) {
    return { routedCount: 0, submittedCount: 0, routings: [] };
  }

  const productIds = order.items.map((item) => item.productId);
  if (productIds.length === 0) {
    return { routedCount: 0, submittedCount: 0, routings: [] };
  }

  const catalogItems = await prisma.supplierCatalogItem.findMany({
    where: {
      provider: input.provider,
      mappedProductId: { in: productIds },
    },
    select: {
      id: true,
      externalProductId: true,
      mappedProductId: true,
    },
  });
  const catalogByProduct = new Map(catalogItems.map((item) => [item.mappedProductId, item]));

  let submittedCount = 0;
  const routings = [];
  for (const item of order.items) {
    const mapped = catalogByProduct.get(item.productId);
    if (!mapped) continue;

    const routing = await prisma.supplierOrderRouting.upsert({
      where: {
        provider_platformOrderId_orderItemId: {
          provider: input.provider,
          platformOrderId: order.id,
          orderItemId: item.id,
        },
      },
      create: {
        provider: input.provider,
        platformOrderId: order.id,
        orderItemId: item.id,
        supplierCatalogItemId: mapped.id,
        status: input.submitToSupplier ? 'PENDING_SUBMISSION' : 'SUBMISSION_SKIPPED',
        submissionEnabled: Boolean(input.submitToSupplier),
        requestPayload: {
          orderId: order.id,
          lines: [{ externalProductId: mapped.externalProductId, quantity: item.quantity }],
        },
      },
      update: {
        supplierCatalogItemId: mapped.id,
        submissionEnabled: Boolean(input.submitToSupplier),
        status: input.submitToSupplier ? 'PENDING_SUBMISSION' : 'SUBMISSION_SKIPPED',
        requestPayload: {
          orderId: order.id,
          lines: [{ externalProductId: mapped.externalProductId, quantity: item.quantity }],
        },
      },
    });

    if (input.submitToSupplier) {
      try {
        const adapter = getSupplierAdapter(input.provider);
        if (!adapter.submitOrder) {
          await prisma.supplierOrderRouting.update({
            where: { id: routing.id },
            data: {
              status: 'SUBMISSION_SKIPPED',
              errorCode: 'SUPPLIER_ORDER_SUBMISSION_NOT_ENABLED',
              errorMessage: 'Provider order submission is not enabled yet for this integration.',
            },
          });
        } else {
          const result = await adapter.submitOrder({
            platformOrderId: order.id,
            routingId: routing.id,
            lines: [{ externalProductId: mapped.externalProductId, quantity: item.quantity }],
            shippingAddress: {
              name: order.shippingName,
              line1: order.shippingLine1,
              line2: order.shippingLine2,
              city: order.shippingCity,
              state: order.shippingState,
              postalCode: order.shippingPostalCode,
              country: order.shippingCountry,
            },
          });
          await prisma.supplierOrderRouting.update({
            where: { id: routing.id },
            data: {
              status: 'SUBMITTED',
              supplierOrderId: result.supplierOrderId,
              responsePayload: (result.responsePayload ?? undefined) as Prisma.InputJsonValue | undefined,
              errorCode: null,
              errorMessage: null,
            },
          });
          submittedCount += 1;
        }
      } catch (error) {
        await prisma.supplierOrderRouting.update({
          where: { id: routing.id },
          data: {
            status: 'FAILED',
            errorCode: (error as { code?: string })?.code ?? 'SUPPLIER_ORDER_SUBMISSION_FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
        await persistSupplierErrorLog({
          provider: input.provider,
          operation: 'ORDER_ROUTING',
          error,
          requestContext: { orderId: order.id, orderItemId: item.id },
          orderRoutingId: routing.id,
        });
      }
    }

    routings.push(routing);
  }

  return {
    routedCount: routings.length,
    submittedCount,
    routings,
  };
}
