import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import {
  getProductMediaKind,
  getProductMediaFolder,
  getProductMediaMaxBytes,
  getProductMediaUploadError,
} from '@/lib/product-media';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['SELLER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Product media uploads are not configured on this server yet. Please add the Cloudinary environment variables and redeploy.',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid upload request.' },
      { status: 400 },
    );
  }

  const contentType =
    body && typeof body === 'object' && 'contentType' in body && typeof body.contentType === 'string'
      ? body.contentType
      : '';
  const fileSize =
    body && typeof body === 'object' && 'fileSize' in body && typeof body.fileSize === 'number'
      ? body.fileSize
      : 0;

  const mediaKind = getProductMediaKind(contentType);
  if (!mediaKind) {
    return NextResponse.json(
      { success: false, message: getProductMediaUploadError(contentType) },
      { status: 400 },
    );
  }

  if (fileSize > getProductMediaMaxBytes(contentType)) {
    return NextResponse.json(
      {
        success: false,
        message:
          mediaKind === 'video'
            ? 'Video is too large. Maximum size is 200 MB.'
            : 'One or more images are too large. Maximum size is 10 MB each.',
      },
      { status: 400 },
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = getProductMediaFolder();
  const paramsToSign = {
    folder,
    timestamp,
  };

  const cloudinary = getCloudinary();
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET as string,
  );

  return NextResponse.json({
    success: true,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder,
    timestamp,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${mediaKind}/upload`,
  });
}
