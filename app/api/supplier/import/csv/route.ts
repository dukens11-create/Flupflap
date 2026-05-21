import { NextResponse } from 'next/server';
import { requireSupplierSession } from '@/lib/wholesaler-auth';
import { importSupplierCatalogCsv } from '@/lib/wholesaler';

export async function POST(req: Request) {
  const auth = await requireSupplierSession();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData();
  const fileValue = form.get('file');
  const textValue = form.get('csv');
  let content = '';
  let fileName = 'catalog.csv';

  if (fileValue instanceof File) {
    content = await fileValue.text();
    fileName = fileValue.name || fileName;
  } else if (typeof textValue === 'string') {
    content = textValue;
  }

  if (!content.trim()) {
    return NextResponse.json({ error: 'CSV content is required.' }, { status: 400 });
  }

  const summary = await importSupplierCatalogCsv({
    supplierUserId: auth.session.user.id,
    csvContent: content,
    fileName,
  });

  return NextResponse.json({ success: true, summary });
}
