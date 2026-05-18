export function getGarageSaleTimeValidationError(start: Date, end: Date): string | null {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Start and end date/time are required.';
  }
  if (end.getTime() === start.getTime()) {
    return 'Start and end times cannot be the same.';
  }
  if (end < start) {
    return 'End time must be after start time.';
  }
  return null;
}
