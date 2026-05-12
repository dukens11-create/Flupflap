import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import {
  getCloudinary,
  getCloudinaryEnvConfig,
  isCloudinaryConfigured,
  logCloudinaryConfigStatus,
} from '@/lib/cloudinary';
import {
  getProductMediaKind,
  getProductMediaFolderByKind,
  getProductMediaMaxBytes,
  getProductMediaUploadError,
} from '@/lib/product-media';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['SELLER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }

  logCloudinaryConfigStatus();

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
      ? body.contentType.trim()
      : '';
  const fileSize =
    body && typeof body === 'object' && 'fileSize' in body && typeof body.fileSize === 'number'
      ? body.fileSize
      : Number.NaN;

  if (!contentType) {
    return NextResponse.json(
      { success: false, message: 'Missing file metadata. Please choose your file again and retry.' },
      { status: 400 },
    );
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json(
      { success: false, message: 'Invalid file size. Please choose your file again and retry.' },
      { status: 400 },
    );
  }

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
  const folder = getProductMediaFolderByKind(mediaKind);
  const cloudinaryEnv = getCloudinaryEnvConfig();
  if (!cloudinaryEnv) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Product media uploads are not configured on this server yet. Please add the Cloudinary environment variables and redeploy.',
      },
      { status: 503 },
    );
  }

  const paramsToSign = {
    backup: 'true',
    folder,
    timestamp,
  };

  try {
    const cloudinary = getCloudinary();
    const signature = cloudinary.utils.api_sign_request(paramsToSign, cloudinaryEnv.apiSecret);

    return NextResponse.json({
      success: true,
      apiKey: cloudinaryEnv.apiKey,
      backup: true,
      folder,
      timestamp,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinaryEnv.cloudName}/${mediaKind}/upload`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[api/upload/product-media] cloudinary init failed:', message);
    return NextResponse.json(
      { success: false, message: 'Upload configuration error. Please try again shortly.' },
      { status: 500 },
    );
  }
}
