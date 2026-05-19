/**
 * Shared WebRTC peer-connection configuration.
 *
 * STUN servers are always included so peers can discover their public address.
 * A TURN relay server is required for peers behind carrier-grade NAT or
 * symmetric NAT — which is the norm on mobile networks.  Without TURN,
 * WebRTC connections will silently fail for most mobile callers.
 *
 * Set all three environment variables to enable TURN:
 *   NEXT_PUBLIC_TURN_URL        e.g. "turn:turn.example.com:3478?transport=tcp"
 *                               (also accepts a comma-separated list of URLs)
 *   NEXT_PUBLIC_TURN_USERNAME   static or time-limited TURN username
 *   NEXT_PUBLIC_TURN_CREDENTIAL static or time-limited TURN password
 *
 * Recommended providers: Twilio Network Traversal Service, Metered.ca,
 * Cloudflare Calls, or a self-hosted coturn instance.
 *
 * For maximum security generate short-lived TURN credentials server-side and
 * pass them as component props — this file covers the common static-credential
 * case that is sufficient for most deployments.
 */
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
      ],
    },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    // Accept a comma-separated list of TURN URLs (e.g. UDP + TCP variants).
    const urls = turnUrl.split(',').map((u) => u.trim()).filter(Boolean);
    servers.push({ urls, username: turnUsername, credential: turnCredential });
  }

  return servers;
}

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 10,
};
