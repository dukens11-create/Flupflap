import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth-options';
import { PATCH as patchRefundRequest } from '@/app/api/admin/refund-requests/[id]/route';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const { id } = await params;
  const forwardUrl = new URL(`/api/admin/refund-requests/${id}`, req.url).toString();

  const forwardedRequest = new Request(forwardUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      action: 'deny',
    }),
  });

  return patchRefundRequest(forwardedRequest, { params });
}
