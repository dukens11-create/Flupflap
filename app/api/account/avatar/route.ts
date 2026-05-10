import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Profile pictures are temporarily disabled.' }, { status: 410 });
}

export async function POST(_req: Request) {
  return NextResponse.json({ error: 'Profile pictures are temporarily disabled.' }, { status: 410 });
}

export async function DELETE(_req: Request) {
  return NextResponse.json({ error: 'Profile pictures are temporarily disabled.' }, { status: 410 });
}
