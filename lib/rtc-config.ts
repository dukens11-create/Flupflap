/**
 * Shared WebRTC peer-connection configuration.
 *
 * STUN servers are always included so peers can discover their public address.
 * A TURN relay server is required for peers behind carrier-grade NAT or
 * symmetric NAT — which is the norm on mobile networks.  Without TURN,
 * WebRTC connections will silently fail for most mobile callers.
 *
 * Metered TURN configuration uses these browser-exposed environment variables:
 *   NEXT_PUBLIC_TURN_URL        comma-separated TURN/TURNS URLs from Metered
 *   NEXT_PUBLIC_TURN_USERNAME   Metered TURN username
 *   NEXT_PUBLIC_TURN_CREDENTIAL Metered TURN credential
 *
 * When Metered is not configured, the app falls back to Google's public STUN
 * server so local/LAN testing still works in development.
 */
const STUN_FALLBACK_URL = 'stun:stun.l.google.com:19302';

function parseTurnUrls(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

const turnUrls = parseTurnUrls(process.env.NEXT_PUBLIC_TURN_URL);
const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME?.trim();
const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim();
const missingTurnEnvVars = [
  ...(turnUrls.length === 0 ? ['NEXT_PUBLIC_TURN_URL'] : []),
  ...(!turnUsername ? ['NEXT_PUBLIC_TURN_USERNAME'] : []),
  ...(!turnCredential ? ['NEXT_PUBLIC_TURN_CREDENTIAL'] : []),
];

if (missingTurnEnvVars.length > 0) {
  console.warn(
    `[RTC] Metered TURN is not fully configured; using STUN fallback only. Missing: ${missingTurnEnvVars.join(', ')}`,
  );
}

if (process.env.NODE_ENV === 'production' && missingTurnEnvVars.length === 0) {
  console.info('[RTC] Metered TURN relay configuration detected.');
}

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: [STUN_FALLBACK_URL] },
  ];

  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    servers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
  }

  return servers;
}
export const HAS_TURN_CONFIG = turnUrls.length > 0 && Boolean(turnUsername && turnCredential);

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 10,
};
