import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function GarageSaleMySalesPage() {
  redirect('/seller/garage-sales');
}
