import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_UPLOAD_BYTES, uploadImageToCloudinary } from '@/lib/image-upload';

const UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'flupflap/products';

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

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Please upload a JPEG, PNG, WebP, or GIF.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'File is too large. Maximum size is 10 MB.' },
      { status: 400 }
    );
  }

  try {
    const result = await uploadImageToCloudinary(file, UPLOAD_FOLDER);
    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    console.error('[api/upload]', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
