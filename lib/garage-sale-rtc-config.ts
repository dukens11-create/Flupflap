const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

function parseTurnUrls(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getGarageSaleRtcConfig(): RTCConfiguration {
  const turnUrls = parseTurnUrls(
    process.env.NEXT_PUBLIC_GARAGE_SALE_TURN_URLS
    ?? process.env.NEXT_PUBLIC_GARAGE_SALE_TURN_URL
    ?? process.env.NEXT_PUBLIC_TURN_URL,
  );
  const turnUsername = process.env.NEXT_PUBLIC_GARAGE_SALE_TURN_USERNAME ?? process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_GARAGE_SALE_TURN_CREDENTIAL ?? process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  const iceServers: RTCIceServer[] = [{ urls: DEFAULT_STUN_URLS }];

  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return { iceServers };
}
