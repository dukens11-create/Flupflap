import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { getCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import {
  getProfileImageValidationError,
  PROFILE_IMAGE_UPLOAD_FOLDER,
} from '@/lib/profile-image';

async function getSessionUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileImageUrl: true, image: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  return NextResponse.json({ profileImageUrl: user.profileImageUrl ?? user.image ?? null });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Profile photo upload is not configured on this server.' },
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

  const validationError = getProfileImageValidationError(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const cloudinary = getCloudinary();

    const result = await new Promise<{ secure_url: string; public_id: string; version?: number }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `${PROFILE_IMAGE_UPLOAD_FOLDER}/${userId}`,
            resource_type: 'image',
            transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
          },
          (err, res) => {
            if (err || !res) reject(err ?? new Error('No result from Cloudinary'));
            else resolve(res as { secure_url: string; public_id: string; version?: number });
          },
        )
        .end(buffer);
    });

    const optimizedUrl = cloudinary.url(result.public_id, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      version: result.version,
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }, { quality: 'auto:good' }, { fetch_format: 'webp' }],
    });

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        profileImageUrl: optimizedUrl,
        image: optimizedUrl,
      },
      select: { profileImageUrl: true, image: true },
    });

    return NextResponse.json({ profileImageUrl: user.profileImageUrl ?? user.image ?? null });
  } catch (error) {
    console.error('[account/avatar POST]', error);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      profileImageUrl: null,
      image: null,
    },
  });

  return NextResponse.json({ ok: true });
}
