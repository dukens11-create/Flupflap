import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';

const PRODUCT_MEDIA_UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'flupflap/products';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['SELLER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Image upload is not configured on this server.' },
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

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Please upload a JPEG, PNG, WebP, GIF image or MP4, MOV, WebM video.' },
      { status: 400 }
    );
  }

  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File is too large. Maximum size is ${isVideo ? '200' : '10'} MB.` },
      { status: 400 }
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const cloudinary = getCloudinary();

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: PRODUCT_MEDIA_UPLOAD_FOLDER, resource_type: 'auto' }, (err, res) => {
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
