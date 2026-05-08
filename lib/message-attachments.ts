export const MESSAGE_ATTACHMENT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
export const MESSAGE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MESSAGE_UPLOAD_FOLDER =
  process.env.CLOUDINARY_MESSAGE_UPLOAD_FOLDER ?? 'flupflap/message-attachments';
export const MESSAGE_ATTACHMENT_HELP_TEXT = 'JPEG, PNG, WebP, or GIF · up to 5 MB';

function getAttachmentAssetPathSegments(pathSegments: string[]) {
  if (
    pathSegments.length < 4 ||
    pathSegments[1] !== 'image' ||
    pathSegments[2] !== 'upload'
  ) {
    return null;
  }

  return /^v\d+$/.test(pathSegments[3] ?? '')
    ? pathSegments.slice(4)
    : pathSegments.slice(3);
}

export function isSafeMessageAttachmentUrl(
  attachmentUrl?: string | null,
  cloudName?: string,
) {
  if (!attachmentUrl) return false;

  try {
    const url = new URL(attachmentUrl);
    const folderSegments = MESSAGE_UPLOAD_FOLDER.split('/').filter(Boolean);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const assetPathSegments = getAttachmentAssetPathSegments(pathSegments);

    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'res.cloudinary.com' ||
      !assetPathSegments
    ) {
      return false;
    }

    if (cloudName) {
      if (pathSegments[0] !== cloudName) {
        return false;
      }
    }

    return folderSegments.every(
      (segment, index) => assetPathSegments[index] === segment,
    );
  } catch {
    return false;
  }
}

export function isAllowedMessageAttachmentUrl(
  attachmentUrl: string,
  cloudName = process.env.CLOUDINARY_CLOUD_NAME,
) {
  if (!cloudName) return false;
  return isSafeMessageAttachmentUrl(attachmentUrl, cloudName);
}
