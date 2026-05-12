import { NextResponse } from 'next/server';

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    details === undefined
      ? { error: message }
      : { error: message, details },
    { status },
  );
}
