type CloudinaryCropMode = 'fill' | 'fit' | 'limit' | 'pad' | 'scale';

type ImageTransformOptions = {
  width?: number;
  height?: number;
  crop?: CloudinaryCropMode;
};

const CLOUDINARY_UPLOAD_SEGMENT = '/image/upload/';

export function getOptimizedImageUrl(url: string, options: ImageTransformOptions = {}) {
  if (!url || url.startsWith('/')) {
    return url;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.includes(CLOUDINARY_UPLOAD_SEGMENT)) {
    return url;
  }

  const transformations = ['f_auto', 'q_auto:good'];
  if (options.crop) transformations.push(`c_${options.crop}`);
  if (options.width) transformations.push(`w_${Math.round(options.width)}`);
  if (options.height) transformations.push(`h_${Math.round(options.height)}`);

  parsed.pathname = parsed.pathname.replace(
    CLOUDINARY_UPLOAD_SEGMENT,
    `${CLOUDINARY_UPLOAD_SEGMENT}${transformations.join(',')}/`,
  );

  return parsed.toString();
}
