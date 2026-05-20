import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { normalizeCategoryAliases } from '@/lib/category-aliases';
import { z } from 'zod';
import { sessionHasRole } from '@/lib/user-roles';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric words separated by hyphens'),
  parentId: z.string().optional().nullable(),
  icon: z.string().max(10).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  attributeSchema: z.string().optional().nullable(), // JSON string
  aliases: z.union([z.array(z.string()), z.string()]).optional().nullable(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !sessionHasRole(session.user, 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const cats = await prisma.category.findMany({
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    include: { _count: { select: { mainProducts: true, subProducts: true } } },
  });
  return NextResponse.json(cats);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !sessionHasRole(session.user, 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const data = createSchema.parse(body);

    // Determine level based on parent
    let level = 0;
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) return NextResponse.json({ error: 'Parent category not found.' }, { status: 400 });
      level = parent.level + 1;
    }

    let parsedAttributeSchema = null;
    if (data.attributeSchema) {
      try { parsedAttributeSchema = JSON.parse(data.attributeSchema); } catch {
        return NextResponse.json({ error: 'attributeSchema must be valid JSON.' }, { status: 400 });
      }
    }

    const category = await prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        parentId: data.parentId ?? null,
        level,
        icon: data.icon ?? null,
        sortOrder: data.sortOrder,
        attributeSchema: parsedAttributeSchema,
        aliases: normalizeCategoryAliases(data.aliases),
      },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (err: any) {
    if (err?.name === 'ZodError') return NextResponse.json({ error: 'Invalid input.', details: err.errors }, { status: 400 });
    if (err?.code === 'P2002') return NextResponse.json({ error: 'A category with this slug already exists.' }, { status: 409 });
    console.error('[admin/categories POST]', err);
    return NextResponse.json({ error: 'Failed to create category.' }, { status: 500 });
  }
}
