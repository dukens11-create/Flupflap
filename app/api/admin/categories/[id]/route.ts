import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  icon: z.string().max(10).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  attributeSchema: z.string().optional().nullable(), // JSON string or null to clear
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') return null;
  return session;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  try {
    const body = await req.json();
    const data = updateSchema.parse(body);

    let parsedAttributeSchema: unknown = undefined;
    if ('attributeSchema' in data) {
      if (data.attributeSchema === null || data.attributeSchema === '') {
        parsedAttributeSchema = null;
      } else if (data.attributeSchema) {
        try { parsedAttributeSchema = JSON.parse(data.attributeSchema); } catch {
          return NextResponse.json({ error: 'attributeSchema must be valid JSON.' }, { status: 400 });
        }
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(parsedAttributeSchema !== undefined && { attributeSchema: parsedAttributeSchema as any }),
      },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.name === 'ZodError') return NextResponse.json({ error: 'Invalid input.', details: err.errors }, { status: 400 });
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Slug already in use.' }, { status: 409 });
    console.error('[admin/categories PATCH]', err);
    return NextResponse.json({ error: 'Failed to update category.' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  try {
    // Prevent deleting categories that have products linked
    const productCount = await prisma.product.count({
      where: { OR: [{ categoryId: id }, { subcategoryId: id }] },
    });
    if (productCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${productCount} product(s) use this category. Re-assign them first.` },
        { status: 409 },
      );
    }
    // Prevent deleting if it has children
    const childCount = await prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: this category has ${childCount} subcategory/ies. Delete them first.` },
        { status: 409 },
      );
    }
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    console.error('[admin/categories DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete category.' }, { status: 500 });
  }
}
