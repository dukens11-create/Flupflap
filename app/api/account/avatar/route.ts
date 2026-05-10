import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Profile photos are temporarily disabled.' }, { status: 410 });
}

export async function POST(req: Request) {
  void req;
  return NextResponse.json({ error: 'Profile photos are temporarily disabled.' }, { status: 410 });
}

export async function DELETE(req: Request) {
  void req;
  return NextResponse.json({ error: 'Profile photos are temporarily disabled.' }, { status: 410 });
}
