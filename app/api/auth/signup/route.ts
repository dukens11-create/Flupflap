import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CUSTOMER', 'SELLER']).default('CUSTOMER'),
  phone: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = schema.parse(body);

    if (data.role === 'SELLER' && !data.phone?.trim()) {
      return NextResponse.json(
        { error: 'A mobile phone number is required for seller accounts.' },
        { status: 400 },
      );
    }

    const normalizedPhone = data.role === 'SELLER'
      ? normalizePhone(data.phone ?? '')
      : null;

    if (data.role === 'SELLER' && !normalizedPhone) {
      return NextResponse.json(
        { error: 'Enter a valid phone number. US/Canada numbers can be entered with or without +1.' },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const password = await bcrypt.hash(data.password, 12);
    await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        password,
        role: data.role,
        phone: normalizedPhone,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Signup failed.' }, { status: 500 });
  }
}
