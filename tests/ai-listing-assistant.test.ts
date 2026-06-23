import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAiListingApiPayload, sanitizeMediaUploadState } from '@/lib/ai-listing-assistant';

test('sanitizeMediaUploadState returns safe defaults for nullish state', () => {
  const sanitized = sanitizeMediaUploadState(undefined);
  assert.deepEqual(sanitized.uploadedImageUrls, []);
  assert.equal(sanitized.imageCount, 0);
  assert.equal(sanitized.canSubmit, false);
});

test('sanitizeMediaUploadState strips invalid image URLs', () => {
  const sanitized = sanitizeMediaUploadState({
    imageCount: 3,
    uploadedImageCount: 3,
    isUploading: false,
    isEnhancing: false,
    hasErrors: false,
    canSubmit: true,
    message: '',
    uploadedImageUrls: ['https://example.com/a.jpg', '', '  '],
  });

  assert.deepEqual(sanitized.uploadedImageUrls, ['https://example.com/a.jpg']);
});

test('parseAiListingApiPayload rejects null data to prevent first-tap crashes', () => {
  const parsed = parseAiListingApiPayload({ data: null, error: 'Bad payload' });

  assert.equal(parsed.data, null);
  assert.equal(parsed.errorMessage, 'Bad payload');
});

test('parseAiListingApiPayload returns object data when valid', () => {
  const parsed = parseAiListingApiPayload({ data: { title: 'Sample' } });

  assert.deepEqual(parsed.data, { title: 'Sample' });
  assert.equal(parsed.errorMessage, undefined);
});
