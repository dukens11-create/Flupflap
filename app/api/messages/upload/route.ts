import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import {
  MESSAGE_ATTACHMENT_ALLOWED_TYPES,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_UPLOAD_FOLDER,
} from '@/lib/message-attachments';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Photo upload is not configured on this server.' },
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

  if (!MESSAGE_ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Please upload a JPEG, PNG, WebP, or GIF.' },
      { status: 400 },
    );
  }

  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json(
      { error: 'File is too large. Maximum size is 5 MB.' },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const cloudinary = getCloudinary();

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `${MESSAGE_UPLOAD_FOLDER}/${session.user.id}`,
            resource_type: 'image',
          },
          (err, res) => {
            if (err || !res) reject(err ?? new Error('No result from Cloudinary'));
            else resolve(res as { secure_url: string });
          },
        )
        .end(buffer);
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    console.error('[api/messages/upload]', err);
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 },
    );
  }
}
