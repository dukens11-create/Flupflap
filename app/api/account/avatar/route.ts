import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { getCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';

const AVATAR_FOLDER = 'flupflap/avatars';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const AVATAR_WIDTH = 400;
const AVATAR_HEIGHT = 400;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Image upload is not configured on this server.' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Please upload a JPEG, PNG, WebP, or GIF.' },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'File is too large. Maximum size is 5 MB.' },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const cloudinary = getCloudinary();

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: AVATAR_FOLDER,
            resource_type: 'image',
            // Crop to a square, centered on the face if detected.
            transformation: [{ width: AVATAR_WIDTH, height: AVATAR_HEIGHT, crop: 'fill', gravity: 'auto' }],
          },
          (err, res) => {
            if (err || !res) reject(err ?? new Error('No result from Cloudinary'));
            else resolve(res as { secure_url: string });
          },
        )
        .end(buffer);
    });

    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: result.secure_url },
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    console.error('[api/account/avatar]', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
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
