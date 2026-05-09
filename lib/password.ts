import bcrypt from 'bcryptjs';

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function looksLikeBcryptHash(value: unknown): value is string {
  return typeof value === 'string' && BCRYPT_HASH_REGEX.test(value);
}

export async function safeComparePassword(
  plainPassword: string,
  storedHash: unknown,
  context: string,
): Promise<boolean> {
  if (!looksLikeBcryptHash(storedHash)) {
    console.warn(`[password] invalid stored hash (${context})`);
    return false;
  }

  try {
    return await bcrypt.compare(plainPassword, storedHash);
  } catch (error) {
    console.error(`[password] compare failed (${context})`, error);
    return false;
  }
}
