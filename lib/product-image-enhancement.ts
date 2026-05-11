export const PRODUCT_IMAGE_ENHANCEMENT_OPTIONS = [
  'keep_original',
  'auto_enhance',
  'remove_background',
  'hd_upscale',
  'auto_crop_product',
] as const;

export type ProductImageEnhancementOption = (typeof PRODUCT_IMAGE_ENHANCEMENT_OPTIONS)[number];

export const PRODUCT_IMAGE_ENHANCEMENT_LABELS: Record<ProductImageEnhancementOption, string> = {
  keep_original: 'Keep original',
  auto_enhance: 'Auto enhance',
  remove_background: 'Remove background',
  hd_upscale: 'HD upscale',
  auto_crop_product: 'Auto crop product',
};

const PRODUCT_IMAGE_TRANSFORMATIONS: Record<ProductImageEnhancementOption, string> = {
  keep_original: 'c_limit,w_1600,f_auto,q_auto',
  auto_enhance: 'e_enhance,c_limit,w_1600,f_auto,q_auto',
  remove_background: 'e_background_removal,c_limit,w_1600,f_auto,q_auto',
  hd_upscale: 'e_upscale,c_limit,w_1600,f_auto,q_auto',
  auto_crop_product: 'c_fill,g_auto,w_1600,h_1600,f_auto,q_auto',
};

const PRODUCT_IMAGE_THUMBNAIL_TRANSFORMATIONS: Record<ProductImageEnhancementOption, string> = {
  keep_original: 'c_fill,g_auto,w_320,h_320,f_auto,q_auto',
  auto_enhance: 'e_enhance,c_fill,g_auto,w_320,h_320,f_auto,q_auto',
  remove_background: 'e_background_removal,c_fill,g_auto,w_320,h_320,f_auto,q_auto',
  hd_upscale: 'e_upscale,c_fill,g_auto,w_320,h_320,f_auto,q_auto',
  auto_crop_product: 'c_fill,g_auto,w_320,h_320,f_auto,q_auto',
};

function transformCloudinaryUploadUrl(url: string, transformation: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
      return url;
    }

    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const uploadIndex = pathSegments.indexOf('upload');
    if (uploadIndex < 0) {
      return url;
    }

    const afterUpload = pathSegments.slice(uploadIndex + 1);
    const versionOffset = afterUpload.findIndex((segment) => /^v\d+$/.test(segment));
    const versionIndex = versionOffset >= 0 ? uploadIndex + 1 + versionOffset : -1;
    const assetSegments =
      versionIndex >= 0
        ? pathSegments.slice(versionIndex)
        : pathSegments.slice(uploadIndex + 1);

    if (!assetSegments.length) {
      return url;
    }

    parsed.pathname = `/${[
      ...pathSegments.slice(0, uploadIndex + 1),
      transformation,
      ...assetSegments,
    ].join('/')}`;

    return parsed.toString();
  } catch {
    return url;
  }
}

export function getOptimizedProductImageUrl(
  url: string,
  enhancement: ProductImageEnhancementOption
) {
  return transformCloudinaryUploadUrl(url, PRODUCT_IMAGE_TRANSFORMATIONS[enhancement]);
}

export function getProductImageThumbnailUrl(
  url: string,
  enhancement: ProductImageEnhancementOption
) {
  return transformCloudinaryUploadUrl(url, PRODUCT_IMAGE_THUMBNAIL_TRANSFORMATIONS[enhancement]);
}
