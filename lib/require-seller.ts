import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { sessionHasRole } from '@/lib/user-roles';

export async function requireSeller() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (!sessionHasRole(session.user, 'SELLER')) redirect('/');
  const sellerId = session.user.id;
  if (!sellerId) redirect('/login');
  return {
    session,
    sellerId,
  };
}
