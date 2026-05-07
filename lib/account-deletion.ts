export const ACCOUNT_DELETION_REASONS = [
  'not_using',
  'too_expensive',
  'privacy_concerns',
  'found_alternative',
  'bad_experience',
  'other',
] as const;

export type AccountDeletionReason = (typeof ACCOUNT_DELETION_REASONS)[number];

export const ACCOUNT_DELETION_REASON_LABELS: Record<AccountDeletionReason, string> = {
  not_using: 'I no longer use FlupFlap',
  too_expensive: 'Fees or pricing are too expensive',
  privacy_concerns: 'I have privacy or security concerns',
  found_alternative: 'I found a better alternative',
  bad_experience: 'I had a poor experience',
  other: 'Other',
};
