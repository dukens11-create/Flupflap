"use client";
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';

export default function AuthButtons(){
  const { data: session } = useSession();
  if(!session?.user) return <><Link href="/login">Login</Link><Link href="/signup">Sign up</Link></>;
  return <><Link href="/account">Account</Link><button onClick={()=>signOut()} className="font-semibold">Logout</button></>;
}
