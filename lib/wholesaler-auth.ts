import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function requireSupplierSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'SELLER' || !session.user.id) {
    return null;
  }

  const profile = await prisma.supplierProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return null;

  return { session, profile };
}

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN' || !session.user.id) {
    return null;
  }
  return session;
}
