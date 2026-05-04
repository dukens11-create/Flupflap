"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Signup(){
 const router=useRouter(); const [error,setError]=useState('');
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault(); setError(''); const form=new FormData(e.currentTarget); const payload=Object.fromEntries(form.entries()); const res=await fetch('/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!res.ok){setError((await res.json()).error||'Signup failed');return;} await signIn('credentials',{email:payload.email,password:payload.password,redirect:false}); router.push(payload.role==='SELLER'?'/seller':'/products');}
 return <main className="mx-auto max-w-md px-4 py-10"><h1 className="text-4xl font-black">Create account</h1><form onSubmit={submit} className="card p-6 mt-6 space-y-3"><input name="name" className="input" placeholder="Full name" required/><input name="email" type="email" className="input" placeholder="Email" required/><input name="password" type="password" className="input" placeholder="Password minimum 8 characters" required/><select name="role" className="input"><option value="CUSTOMER">Customer</option><option value="SELLER">Seller</option></select>{error&&<p className="text-red-600 text-sm">{error}</p>}<button className="btn-primary w-full">Create account</button></form></main>
}
