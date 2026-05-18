import { PATCH as patchRefundRequest } from '@/app/api/admin/refund-requests/[id]/route';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const { id } = await params;

  const forwardedRequest = new Request(req.url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      action: 'deny',
    }),
  });

  return patchRefundRequest(forwardedRequest, { params: Promise.resolve({ id }) });
}
