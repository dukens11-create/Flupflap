import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import type { SupplierProvider } from '@prisma/client';

type SupplierOperation = 'products' | 'orders' | 'inventory-sync' | 'order-routing';

export async function requireSupplierAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (session.user.role !== 'ADMIN') return null;
  if (!session.user.id) return null;
  return session;
}

export function supplierErrorResponse(params: {
  status: number;
  provider: SupplierProvider;
  operation: SupplierOperation;
  code: string;
  message: string;
}) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: params.code,
        message: params.message,
        provider: params.provider,
        operation: params.operation,
      },
    },
    { status: params.status },
  );
}

export function supplierSuccessResponse<T>(
  data: T,
  provider: SupplierProvider,
  operation: SupplierOperation,
) {
  return NextResponse.json({
    ok: true,
    provider,
    operation,
    data,
  });
}
