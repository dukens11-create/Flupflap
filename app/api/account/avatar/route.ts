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
const DATA_URL_IMAGE_REGEX = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

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
      return new NextResponse(new Uint8Array(buffer), {
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

  if (!/^https?:\/\//i.test(user.image)) {
    return NextResponse.json({ error: 'Invalid avatar image.' }, { status: 500 });
  }

  return NextResponse.redirect(user.image, {
    headers: {
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    let imageUrl: string;

    if (isCloudinaryConfigured()) {
      // Upload to Cloudinary when credentials are available.
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
      imageUrl = result.secure_url;
    } else {
      // Cloudinary is not configured — store the image as a base64 data URL
      // directly in the database. This works for all deployment environments
      // without requiring additional storage infrastructure, though Cloudinary
      // is recommended for production to keep database sizes manageable.
      imageUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: imageUrl },
    });

    return NextResponse.json({ url: imageUrl });
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
