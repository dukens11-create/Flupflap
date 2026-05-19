const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

function parseUrls(value?: string) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const configuredStunUrls = parseUrls(process.env.NEXT_PUBLIC_GARAGE_SALE_LIVE_STUN_URLS);
const configuredTurnUrls = parseUrls(process.env.NEXT_PUBLIC_GARAGE_SALE_LIVE_TURN_URLS);
const configuredTurnUsername = process.env.NEXT_PUBLIC_GARAGE_SALE_LIVE_TURN_USERNAME?.trim() ?? '';
const configuredTurnCredential = process.env.NEXT_PUBLIC_GARAGE_SALE_LIVE_TURN_CREDENTIAL?.trim() ?? '';

export const GARAGE_SALE_LIVE_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: configuredStunUrls.length > 0 ? configuredStunUrls : DEFAULT_STUN_URLS,
    },
    ...(
      configuredTurnUrls.length > 0
      && configuredTurnUsername.length > 0
      && configuredTurnCredential.length > 0
        ? [{
          urls: configuredTurnUrls,
          username: configuredTurnUsername,
          credential: configuredTurnCredential,
        }]
        : []
    ),
  ],
  iceCandidatePoolSize: 10,
};
