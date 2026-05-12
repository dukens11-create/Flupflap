export async function readApiMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: unknown; message?: unknown };
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
    return fallback;
  } catch {
    return fallback;
  }
}
