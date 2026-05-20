export const SCHEDULING_DISABLED_ERROR =
  'Scheduling functionality is currently disabled. Please save as draft or publish now.';

export type SellerListingAction =
  | 'SAVE_DRAFT'
  | 'SCHEDULE'
  | 'PUBLISH_NOW'
  | 'SUBMIT_REVIEW'
  | 'CANCEL_SCHEDULE'
  | null
  | undefined;

export function getSchedulingDisabledError(action: SellerListingAction): string | null {
  return action === 'SCHEDULE' ? SCHEDULING_DISABLED_ERROR : null;
}
