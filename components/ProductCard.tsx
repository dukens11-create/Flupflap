import Link from 'next/link';
import Image from 'next/image';
import { dollars } from '@/lib/money';
export default function ProductCard({p}:{p:any}){return <div className="card overflow-hidden"><div className="relative h-52 bg-slate-100"><Image src={p.imageUrl} alt={p.title} fill className="object-cover"/></div><div className="p-4"><p className="text-xs uppercase text-slate-500">{p.condition} • {p.category}</p><h3 className="font-bold text-lg line-clamp-1">{p.title}</h3><p className="font-black text-blue-700">{dollars(p.priceCents)}</p><p className="text-xs text-slate-500">Shipping {dollars(p.shippingCents||0)}</p><Link className="mt-3 inline-block btn-primary" href={`/products/${p.id}`}>View item</Link></div></div>}
