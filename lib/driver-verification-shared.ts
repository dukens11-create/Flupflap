export const DRIVER_REJECTION_REASONS = [
  'Blurry document',
  'Expired license',
  'Face not clearly visible',
  'Document not fully in frame',
  'Suspicious document',
  'Age requirement not met',
  'Additional documents required',
] as const;

export type DriverVerificationDocumentKind = 'selfie' | 'front' | 'back';

export type DriverLicenseData = {
  licenseNumber: string | null;
  driverName: string | null;
  dateOfBirth: string | null;
  expirationDate: string | null;
  issuingRegion: string | null;
  vehicleClass: string | null;
};

export type DriverLicenseConfidence = Record<keyof DriverLicenseData, number>;

export type DriverVerificationValidationResult = {
  formatValid: boolean;
  ageValid: boolean;
  expired: boolean;
  completenessValid: boolean;
  nameValid: boolean;
  crossReferenceMatches: boolean;
  confidenceAverage: number;
  issues: string[];
  suspiciousFlags: string[];
  requiresManualReview: boolean;
};

export type DriverVerificationSummary = {
  rawText: string;
  extractedData: DriverLicenseData;
  correctedData: DriverLicenseData;
  finalData: DriverLicenseData;
  confidence: DriverLicenseConfidence;
  validation: DriverVerificationValidationResult;
};

const EMPTY_LICENSE_DATA: DriverLicenseData = {
  licenseNumber: null,
  driverName: null,
  dateOfBirth: null,
  expirationDate: null,
  issuingRegion: null,
  vehicleClass: null,
};

const EMPTY_CONFIDENCE: DriverLicenseConfidence = {
  licenseNumber: 0,
  driverName: 0,
  dateOfBirth: 0,
  expirationDate: 0,
  issuingRegion: 0,
  vehicleClass: 0,
};

const KEYWORDS_TO_SKIP = new Set([
  'DRIVER',
  'LICENSE',
  'LICENCE',
  'CLASS',
  'ADDRESS',
  'DOB',
  'EXP',
  'EXPIRES',
  'SEX',
  'HEIGHT',
  'WEIGHT',
  'STATE',
  'COUNTRY',
]);

export function normalizeOcrText(rawText: string) {
  return rawText
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseLabeledValue(rawText: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\s*[:#-]?\\s*([^\\n]+)`, 'i');
    const match = rawText.match(regex);
    if (match?.[1]) {
      return normalizeOptionalString(match[1].replace(/[|]/g, ' ').trim());
    }
  }
  return null;
}

function parseDateCandidate(value: string | null) {
  if (!value) return null;
  const match = value.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/);
  return match?.[1] ?? null;
}

export function parseDateToIso(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split(/[/-]/).map(Number);
    if (!year || !month || !day) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parts = trimmed.split(/[/-]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [first, second, third] = parts;
  const year = third < 100 ? 2000 + third : third;
  return `${String(year).padStart(4, '0')}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
}

function normalizeName(value: string | null | undefined) {
  return (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseName(rawText: string) {
  const labeled = parseLabeledValue(rawText, ['NAME', 'DRIVER NAME', 'FULL NAME']);
  if (labeled) return { value: labeled, confidence: 0.96 };

  const lines = normalizeOcrText(rawText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const heuristic = lines.find((line) => {
    const upper = line.toUpperCase();
    if (upper.length < 5 || upper.length > 60) return false;
    if ([...KEYWORDS_TO_SKIP].some((keyword) => upper.includes(keyword))) return false;
    const words = upper.split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.every((word) => /^[A-Z][A-Z'-]{1,}$/.test(word));
  });

  return { value: heuristic ?? null, confidence: heuristic ? 0.62 : 0 };
}

export function extractDriverLicenseData(rawText: string): {
  data: DriverLicenseData;
  confidence: DriverLicenseConfidence;
} {
  const text = normalizeOcrText(rawText);
  if (!text) {
    return { data: { ...EMPTY_LICENSE_DATA }, confidence: { ...EMPTY_CONFIDENCE } };
  }

  const name = parseName(text);

  const labeledLicenseNumber = parseLabeledValue(text, ['LICENSE NO', 'LICENCE NO', 'LICENSE NUMBER', 'DL', 'DLN']);
  const licenseFallback = text.match(/\b[A-Z0-9-]{6,20}\b/g)?.find((candidate) => /\d/.test(candidate) && /[A-Z]/i.test(candidate)) ?? null;
  const licenseNumber = normalizeOptionalString(labeledLicenseNumber ?? licenseFallback);

  const dob = parseDateCandidate(parseLabeledValue(text, ['DOB', 'DATE OF BIRTH', 'BIRTH DATE']) ?? text.match(/DOB[^\n]*?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1] ?? null);
  const expirationDate = parseDateCandidate(parseLabeledValue(text, ['EXP', 'EXPIRY', 'EXPIRATION', 'EXPIRES']) ?? null);
  const issuingRegion = normalizeOptionalString(parseLabeledValue(text, ['ISSUING STATE', 'STATE', 'ISSUING COUNTRY', 'COUNTRY', 'JURISDICTION']));
  const vehicleClass = normalizeOptionalString(parseLabeledValue(text, ['CLASS', 'VEHICLE CLASS', 'TYPE']));

  return {
    data: {
      licenseNumber,
      driverName: name.value,
      dateOfBirth: dob,
      expirationDate,
      issuingRegion,
      vehicleClass,
    },
    confidence: {
      licenseNumber: labeledLicenseNumber ? 0.94 : licenseNumber ? 0.58 : 0,
      driverName: name.confidence,
      dateOfBirth: dob ? 0.88 : 0,
      expirationDate: expirationDate ? 0.84 : 0,
      issuingRegion: issuingRegion ? 0.78 : 0,
      vehicleClass: vehicleClass ? 0.74 : 0,
    },
  };
}

function calculateAge(dateIso: string | null) {
  if (!dateIso) return null;
  const dob = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function validateDriverLicenseData(input: {
  data: DriverLicenseData;
  confidence?: Partial<DriverLicenseConfidence> | null;
  providedName?: string | null;
  providedDateOfBirth?: string | null;
  minimumAge?: number;
}): DriverVerificationValidationResult {
  const data = {
    ...EMPTY_LICENSE_DATA,
    ...input.data,
  };
  const confidence = {
    ...EMPTY_CONFIDENCE,
    ...(input.confidence ?? {}),
  };
  const issues: string[] = [];
  const suspiciousFlags: string[] = [];
  const minimumAge = input.minimumAge ?? 18;

  const licenseFormat = /^[A-Z0-9-]{5,20}$/i.test(data.licenseNumber ?? '');
  if (!licenseFormat) {
    issues.push('License number format looks invalid.');
  }

  const nameValid = /^[A-Za-z][A-Za-z .'-]{1,120}$/.test(data.driverName ?? '');
  if (!nameValid) {
    issues.push('Driver name is missing or invalid.');
  }

  const dobIso = parseDateToIso(data.dateOfBirth);
  const expirationIso = parseDateToIso(data.expirationDate);
  const age = calculateAge(dobIso);
  const ageValid = typeof age === 'number' && age >= minimumAge;
  if (!ageValid) {
    issues.push(`Driver must be at least ${minimumAge}.`);
  }

  const expired = expirationIso ? new Date(`${expirationIso}T23:59:59.999Z`) < new Date() : true;
  if (expired) {
    issues.push('License is expired or expiration date could not be verified.');
  }

  const completenessValid = Object.values(data).every((value) => Boolean(normalizeOptionalString(value)));
  if (!completenessValid) {
    issues.push('Extracted data is incomplete.');
  }

  const normalizedProvidedName = normalizeName(input.providedName);
  const normalizedDriverName = normalizeName(data.driverName);
  const crossReferenceMatches =
    !normalizedProvidedName ||
    !normalizedDriverName ||
    normalizedDriverName.includes(normalizedProvidedName) ||
    normalizedProvidedName.includes(normalizedDriverName);
  if (!crossReferenceMatches) {
    suspiciousFlags.push('Provided account name does not match extracted license name.');
  }

  const normalizedProvidedDob = parseDateToIso(input.providedDateOfBirth ?? null);
  if (normalizedProvidedDob && dobIso && normalizedProvidedDob !== dobIso) {
    suspiciousFlags.push('Provided birth date does not match extracted license birth date.');
  }

  const confidenceValues = Object.values(confidence).filter((value) => typeof value === 'number' && value > 0);
  const confidenceAverage = confidenceValues.length
    ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(2))
    : 0;

  if (confidenceAverage < 0.7) {
    suspiciousFlags.push('OCR confidence is low and should be manually reviewed.');
  }
  if ((data.issuingRegion ?? '').length > 40) {
    suspiciousFlags.push('Issuing jurisdiction looks unusually long.');
  }

  const requiresManualReview =
    suspiciousFlags.length > 0 ||
    !licenseFormat ||
    !ageValid ||
    expired ||
    !completenessValid ||
    !nameValid;

  return {
    formatValid: licenseFormat,
    ageValid,
    expired,
    completenessValid,
    nameValid,
    crossReferenceMatches,
    confidenceAverage,
    issues,
    suspiciousFlags,
    requiresManualReview,
  };
}

export function buildDriverVerificationSummary(input: {
  rawText: string;
  correctedData?: Partial<DriverLicenseData> | null;
  providedName?: string | null;
  providedDateOfBirth?: string | null;
}): DriverVerificationSummary {
  const { data: extractedData, confidence } = extractDriverLicenseData(input.rawText);
  const correctedData: DriverLicenseData = {
    ...EMPTY_LICENSE_DATA,
    ...(input.correctedData ?? {}),
  };
  const finalData: DriverLicenseData = {
    licenseNumber: correctedData.licenseNumber || extractedData.licenseNumber,
    driverName: correctedData.driverName || extractedData.driverName,
    dateOfBirth: correctedData.dateOfBirth || extractedData.dateOfBirth,
    expirationDate: correctedData.expirationDate || extractedData.expirationDate,
    issuingRegion: correctedData.issuingRegion || extractedData.issuingRegion,
    vehicleClass: correctedData.vehicleClass || extractedData.vehicleClass,
  };

  const validation = validateDriverLicenseData({
    data: finalData,
    confidence,
    providedName: input.providedName,
    providedDateOfBirth: input.providedDateOfBirth,
  });

  return {
    rawText: normalizeOcrText(input.rawText),
    extractedData,
    correctedData,
    finalData,
    confidence,
    validation,
  };
}
