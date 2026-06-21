import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { isCloudinaryConfigured, logCloudinaryConfigStatus } from '@/lib/cloudinary';
import { buildCloudinaryVideoEnhancedUrl } from '@/lib/cloudinary-media';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['SELLER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }

  logCloudinaryConfigStatus();
  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { success: false, message: 'Cloudinary is not configured on this server.' },
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

  const videoUrl =
    body && typeof body === 'object' && 'videoUrl' in body && typeof body.videoUrl === 'string'
      ? body.videoUrl.trim()
      : '';

  if (!videoUrl) {
    return NextResponse.json(
      { success: false, message: 'videoUrl is required.' },
      { status: 400 },
    );
  }

  try {
    const enhancedUrl = buildCloudinaryVideoEnhancedUrl(videoUrl);
    if (!enhancedUrl) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Unable to generate AI-enhanced video URL. Make sure the video was uploaded to Cloudinary.',
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, enhancedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[api/upload/product-media/enhance-video] failed:', message);
    return NextResponse.json(
      { success: false, message: 'Unable to enhance video. Please try again.' },
      { status: 500 },
    );
  }
}
