import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';
import AdminCategoryManager from './AdminCategoryManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Manage Categories' };

export default async function AdminCategoriesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const categories = await prisma.category.findMany({
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      level: true,
      icon: true,
      sortOrder: true,
      attributeSchema: true,
      _count: { select: { mainProducts: true, subProducts: true } },
    },
  });

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Categories</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage the multi-level category hierarchy. Products link to categories for
            hierarchical browsing and filtering.
          </p>
        </div>
        <a href="/admin" className="btn-outline text-sm">← Admin</a>
      </div>
      <AdminCategoryManager initialCategories={categories} />
    </main>
  );
}
