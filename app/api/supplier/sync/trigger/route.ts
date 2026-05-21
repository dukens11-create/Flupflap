import { NextResponse } from 'next/server';
import { requireSupplierSession } from '@/lib/wholesaler-auth';
import { runSupplierSync } from '@/lib/wholesaler';

export async function POST(req: Request) {
  const auth = await requireSupplierSession();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let trigger: 'MANUAL' | 'SCHEDULED' = 'MANUAL';
  try {
    const body = await req.json() as { trigger?: 'MANUAL' | 'SCHEDULED' };
    if (body?.trigger === 'SCHEDULED') trigger = 'SCHEDULED';
  } catch {
    const form = await req.formData().catch(() => null);
    const formTrigger = form?.get('trigger');
    if (formTrigger === 'SCHEDULED') trigger = 'SCHEDULED';
  }

  const summary = await runSupplierSync({
    supplierUserId: auth.session.user.id,
    trigger,
  });

  return NextResponse.json({ success: true, summary });
}
