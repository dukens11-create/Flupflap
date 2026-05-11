import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { getCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import { getCloudinaryThumbnailsFolder } from '@/lib/product-media';

const schema = z.object({
  originalUrl: z.string().url(),
  publicId: z.string().min(1),
  resourceType: z.enum(['image', 'video']),
  version: z.number().int().positive().optional(),
});

function isTrustedCloudinaryUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.cloudinary.com');
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['SELLER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { success: false, message: 'Cloudinary uploads are not configured on this server.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid finalize payload.' },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? 'Invalid finalize payload.' },
      { status: 400 },
    );
  }

  const { originalUrl, publicId, resourceType, version } = parsed.data;
  if (!isTrustedCloudinaryUrl(originalUrl)) {
    return NextResponse.json(
      { success: false, message: 'Invalid Cloudinary upload URL.' },
      { status: 400 },
    );
  }

  try {
    const cloudinary = getCloudinary();

    const optimizedUrl =
      resourceType === 'video'
        ? cloudinary.url(publicId, {
            secure: true,
            resource_type: 'video',
            type: 'upload',
            version,
            transformation: [{ quality: 'auto:good' }],
            format: 'webm',
          })
        : cloudinary.url(publicId, {
            secure: true,
            resource_type: 'image',
            type: 'upload',
            version,
            transformation: [
              { effect: 'improve' },
              { effect: 'sharpen' },
              { quality: 'auto:good' },
              { fetch_format: 'webp' },
            ],
          });

    if (resourceType !== 'image') {
      return NextResponse.json({
        success: true,
        media: {
          publicId,
          resourceType,
          originalUrl,
          optimizedUrl,
          thumbnailUrl: null,
        },
      });
    }

    const enhancedUrl = cloudinary.url(publicId, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      version,
      transformation: [
        { effect: 'improve' },
        { effect: 'sharpen' },
        { effect: 'brightness:20' },
        { effect: 'contrast:20' },
        { quality: 'auto:good' },
        { fetch_format: 'webp' },
      ],
    });

    const thumbPublicId = `${publicId.split('/').pop() ?? 'image'}-thumb`;
    const thumbnail = await cloudinary.uploader.upload(originalUrl, {
      resource_type: 'image',
      folder: getCloudinaryThumbnailsFolder(),
      public_id: thumbPublicId,
      overwrite: true,
      backup: true,
      transformation: [
        { crop: 'fill', gravity: 'auto', width: 480, height: 480 },
        { effect: 'improve' },
        { quality: 'auto:eco' },
        { fetch_format: 'webp' },
      ],
    });

    return NextResponse.json({
      success: true,
      media: {
        publicId,
        resourceType,
        originalUrl,
        optimizedUrl,
        enhancedUrl,
        thumbnailUrl: thumbnail.secure_url,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[api/upload/product-media/finalize] failed:', message);
    return NextResponse.json(
      { success: false, message: 'Unable to finalize uploaded media.' },
      { status: 500 },
    );
  }
}
