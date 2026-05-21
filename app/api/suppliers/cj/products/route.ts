import { runSupplierProductSync, SupplierConfigError } from '@/lib/suppliers';
import { requireSupplierAdminSession, supplierErrorResponse, supplierSuccessResponse } from '@/lib/suppliers/api';

export async function GET(req: Request) {
  const session = await requireSupplierAdminSession();
  if (!session) {
    return supplierErrorResponse({
      status: 403,
      provider: 'CJ',
      operation: 'products',
      code: 'FORBIDDEN',
      message: 'Admin access required.',
    });
  }

  try {
    const result = await runSupplierProductSync('CJ', {
      userId: session.user.id,
      path: new URL(req.url).pathname,
      method: 'GET',
    });
    return supplierSuccessResponse(result, 'CJ', 'products');
  } catch (error) {
    if (error instanceof SupplierConfigError) {
      return supplierErrorResponse({
        status: 500,
        provider: 'CJ',
        operation: 'products',
        code: error.code,
        message: error.message,
      });
    }
    return supplierErrorResponse({
      status: 502,
      provider: 'CJ',
      operation: 'products',
      code: (error as { code?: string })?.code ?? 'SUPPLIER_PRODUCTS_SYNC_FAILED',
      message: error instanceof Error ? error.message : 'Failed to sync CJ products.',
    });
  }
}
