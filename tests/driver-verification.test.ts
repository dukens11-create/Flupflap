import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDriverVerificationSummary,
  extractDriverLicenseData,
  validateDriverLicenseData,
} from '@/lib/driver-verification';

test('extractDriverLicenseData parses labeled OCR fields', () => {
  const rawText = [
    'DRIVER LICENSE',
    'NAME: Jane Example',
    'LICENSE NUMBER: EXA-1234-5678',
    'DOB: 02/14/1990',
    'EXP: 12/31/2030',
    'STATE: California',
    'CLASS: C',
  ].join('\n');

  const { data, confidence } = extractDriverLicenseData(rawText);

  assert.equal(data.driverName, 'Jane Example');
  assert.equal(data.licenseNumber, 'EXA-1234-5678');
  assert.equal(data.dateOfBirth, '02/14/1990');
  assert.equal(data.expirationDate, '12/31/2030');
  assert.equal(data.issuingRegion, 'California');
  assert.equal(data.vehicleClass, 'C');
  assert.ok(confidence.licenseNumber >= 0.9);
  assert.ok(confidence.driverName >= 0.9);
});

test('validateDriverLicenseData flags expired and underage drivers', () => {
  const result = validateDriverLicenseData({
    data: {
      licenseNumber: 'YOUTH-12345',
      driverName: 'Young Driver',
      dateOfBirth: '01/01/2012',
      expirationDate: '01/01/2020',
      issuingRegion: 'Nevada',
      vehicleClass: 'D',
    },
    confidence: {
      licenseNumber: 0.9,
      driverName: 0.9,
      dateOfBirth: 0.9,
      expirationDate: 0.9,
      issuingRegion: 0.9,
      vehicleClass: 0.9,
    },
    providedName: 'Young Driver',
  });

  assert.equal(result.ageValid, false);
  assert.equal(result.expired, true);
  assert.equal(result.requiresManualReview, true);
  assert.ok(result.issues.some((issue) => issue.includes('at least 18')));
  assert.ok(result.issues.some((issue) => issue.includes('expired')));
});

test('buildDriverVerificationSummary keeps manual corrections and surfaces mismatches', () => {
  const summary = buildDriverVerificationSummary({
    rawText: [
      'DRIVER LICENSE',
      'NAME: Janet Example',
      'LICENSE NUMBER: ZXCVB-99887',
      'DOB: 05/10/1992',
      'EXP: 06/15/2031',
      'STATE: Texas',
      'CLASS: C',
    ].join('\n'),
    correctedData: {
      driverName: 'Jane Example',
    },
    providedName: 'Alice Example',
    providedDateOfBirth: '1992-05-10',
  });

  assert.equal(summary.extractedData.driverName, 'Janet Example');
  assert.equal(summary.finalData.driverName, 'Jane Example');
  assert.equal(summary.validation.crossReferenceMatches, false);
  assert.ok(
    summary.validation.suspiciousFlags.some((flag) =>
      flag.includes('Provided account name does not match'),
    ),
  );
  assert.equal(summary.validation.expired, false);
});
