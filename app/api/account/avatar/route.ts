import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const DATA_URL_IMAGE_REGEX = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;
const AVATAR_UPLOAD_TEMPORARILY_DISABLED_MESSAGE =
  'Profile picture uploads are temporarily unavailable while we resolve a login stability issue.';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true },
  });

  if (!user?.image) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const dataUrlMatch = DATA_URL_IMAGE_REGEX.exec(user.image);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const base64Payload = dataUrlMatch[2];
    try {
      const buffer = Buffer.from(base64Payload, 'base64');
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      });
    } catch {
      return NextResponse.json({ error: 'Invalid avatar image.' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Emergency mitigation: temporarily block new avatar uploads while login stability is investigated.
  return NextResponse.json(
    { error: AVATAR_UPLOAD_TEMPORARILY_DISABLED_MESSAGE },
    { status: 503 },
  );
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/account/avatar DELETE]', err);
    return NextResponse.json({ error: 'Failed to remove photo.' }, { status: 500 });
  }
}
