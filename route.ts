import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { z } from 'zod';
const schema=z.object({title:z.string().min(3),description:z.string().min(10),price:z.string(),condition:z.string(),category:z.string(),imageUrl:z.string().url(),sellerEmail:z.string().email(),shipping:z.string().optional(),inventory:z.string().optional()});
export async function POST(req:Request){const form=await req.formData();const data=schema.parse(Object.fromEntries(form.entries()));let seller=await prisma.user.findUnique({where:{email:data.sellerEmail.toLowerCase()}});if(!seller){seller=await prisma.user.create({data:{name:data.sellerEmail.split('@')[0],email:data.sellerEmail.toLowerCase(),password:'',role:'SELLER'}})}const product=await prisma.product.create({data:{title:data.title,description:data.description,priceCents:cents(data.price),condition:data.condition,category:data.category,imageUrl:data.imageUrl,sellerId:seller.id,shippingCents:cents(data.shipping||0),inventory:Number(data.inventory||1)}});return NextResponse.redirect(new URL(`/seller?created=${product.id}`, req.url));}
