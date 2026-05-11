import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getCloudinary, isCloudinaryConfigured, logCloudinaryConfigStatus } from '@/lib/cloudinary';
import {
  getProductMediaKind,
  getProductMediaFolder,
  getProductMediaMaxBytes,
} from '@/lib/product-media';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['SELLER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  logCloudinaryConfigStatus();

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Product media uploads are not configured on this server.' },
      { status: 503 }
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

  const mediaKind = getProductMediaKind(file.type);
  if (!mediaKind) {
    return NextResponse.json(
      { error: 'Unsupported file type. Please upload a JPEG, PNG, WebP, GIF image or MP4, MOV, WebM video.' },
      { status: 400 }
    );
  }

  if (file.size > getProductMediaMaxBytes(file.type)) {
    return NextResponse.json(
      { error: `File is too large. Maximum size is ${mediaKind === 'video' ? '200' : '10'} MB.` },
      { status: 400 }
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const cloudinary = getCloudinary();
    const folder = getProductMediaFolder();

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder, resource_type: 'auto' }, (err, res) => {
          if (err || !res) reject(err ?? new Error('No result from Cloudinary'));
          else resolve(res as { secure_url: string });
        })
        .end(buffer);
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    console.error('[api/upload]', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
