import { z } from 'zod';
import { prisma } from '@/lib/db';
import { routeSupplierOrder } from '@/lib/suppliers';
import { persistSupplierErrorLog } from '@/lib/suppliers/logging';
import { requireSupplierAdminSession, supplierErrorResponse, supplierSuccessResponse } from '@/lib/suppliers/api';

const routeOrderSchema = z.object({
  orderId: z.string().min(1),
  submitToSupplier: z.boolean().optional().default(false),
});

export async function GET() {
  const session = await requireSupplierAdminSession();
  if (!session) {
    return supplierErrorResponse({
      status: 403,
      provider: 'CJ',
      operation: 'orders',
      code: 'FORBIDDEN',
      message: 'Admin access required.',
    });
  }

  const recentRoutings = await prisma.supplierOrderRouting.findMany({
    where: { provider: 'CJ' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      platformOrderId: true,
      orderItemId: true,
      supplierOrderId: true,
      status: true,
      submissionEnabled: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return supplierSuccessResponse({ routings: recentRoutings }, 'CJ', 'orders');
}

export async function POST(req: Request) {
  const session = await requireSupplierAdminSession();
  if (!session) {
    return supplierErrorResponse({
      status: 403,
      provider: 'CJ',
      operation: 'orders',
      code: 'FORBIDDEN',
      message: 'Admin access required.',
    });
  }

  let parsed: z.infer<typeof routeOrderSchema>;
  try {
    parsed = routeOrderSchema.parse(await req.json());
  } catch {
    return supplierErrorResponse({
      status: 400,
      provider: 'CJ',
      operation: 'orders',
      code: 'INVALID_REQUEST',
      message: 'Invalid order routing payload.',
    });
  }

  try {
    const result = await routeSupplierOrder({
      provider: 'CJ',
      orderId: parsed.orderId,
      submitToSupplier: parsed.submitToSupplier,
    });
    return supplierSuccessResponse(result, 'CJ', 'orders');
  } catch (error) {
    await persistSupplierErrorLog({
      provider: 'CJ',
      operation: 'ORDER_ROUTING',
      error,
      requestContext: {
        orderId: parsed.orderId,
        submitToSupplier: parsed.submitToSupplier,
      },
    });
    return supplierErrorResponse({
      status: 500,
      provider: 'CJ',
      operation: 'orders',
      code: (error as { code?: string })?.code ?? 'SUPPLIER_ORDER_ROUTING_FAILED',
      message: error instanceof Error ? error.message : 'Failed to route CJ supplier order.',
    });
  }
}
