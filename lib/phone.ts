/**
 * Phone number utilities.
 *
 * Normalizes user-supplied phone numbers to E.164 format required by SMS
 * providers (e.g. Twilio).  E.164: +[country code][subscriber number], up to
 * 15 digits total, no spaces or formatting characters.
 *
 * Normalization rules (applied in order):
 *  1. Strip formatting characters (spaces, dashes, parentheses, dots).
 *  2. Extract only digits from the result.
 *  3. If the original had a leading "+", keep the full E.164 form as-is.
 *  4. 10-digit number (US/Canada local):  prepend "+1".
 *  5. 11-digit number starting with "1" (US/Canada with country code, no +):
 *     prepend "+".
 *  6. Any other length with 7–15 digits: prepend "+" and let the provider
 *     validate the destination country.
 *  7. Fewer than 7 or more than 15 digits → return null (invalid).
 */

/**
 * Normalize a raw phone number string to E.164 format.
 * Returns the normalized string, or null if the number is clearly invalid.
 */
export function normalizePhone(raw: string): string | null {
  // Remove common formatting characters but preserve '+' for later check
  const stripped = raw.replace(/[\s\-().]/g, '');

  // Check whether the user supplied a leading '+' (international prefix)
  const hasPlus = stripped.startsWith('+');

  // Work with digits only
  const digits = stripped.replace(/\D/g, '');

  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  // Already has a '+' prefix → reconstruct as proper E.164
  if (hasPlus) {
    return `+${digits}`;
  }

  // 10-digit US/Canada number (no country code)
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // 11-digit number starting with '1' (US/Canada with country code, no '+')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // For other lengths assume the user supplied an international number
  // without the leading '+'; prepend it and let the SMS provider validate.
  return `+${digits}`;
}

/**
 * Return true if the supplied string is a plausibly valid phone number
 * (passes the same criteria used by normalizePhone).
 */
export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}
