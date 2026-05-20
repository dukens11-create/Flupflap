import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { isCloudinaryConfigured, logCloudinaryConfigStatus } from '@/lib/cloudinary';
import { buildCloudinaryImageVariants } from '@/lib/cloudinary-media';
import { sessionHasRole } from '@/lib/user-roles';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(sessionHasRole(session.user, 'SELLER') || sessionHasRole(session.user, 'ADMIN'))) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }

  logCloudinaryConfigStatus();
  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { success: false, message: 'Cloudinary is not configured.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid request body.' },
      { status: 400 },
    );
  }

  const imageUrl =
    body && typeof body === 'object' && 'imageUrl' in body && typeof body.imageUrl === 'string'
      ? body.imageUrl.trim()
      : '';
  const hdUpscale =
    body && typeof body === 'object' && 'hdUpscale' in body && typeof body.hdUpscale === 'boolean'
      ? body.hdUpscale
      : false;

  if (!imageUrl) {
    return NextResponse.json(
      { success: false, message: 'imageUrl is required.' },
      { status: 400 },
    );
  }

  try {
    const variants = buildCloudinaryImageVariants(imageUrl, { hdUpscale });
    if (!variants) {
      return NextResponse.json(
        { success: false, message: 'Unable to create Cloudinary media variants for this image.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      ...variants,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[api/upload/product-media/enhance] failed:', message);
    return NextResponse.json(
      { success: false, message: 'Failed to generate enhanced media.' },
      { status: 500 },
    );
  }
}
