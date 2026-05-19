const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

export function parseGarageSaleLiveRtcUrls(value?: string) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const configuredStunUrls = parseGarageSaleLiveRtcUrls(process.env.NEXT_PUBLIC_GARAGE_SALE_LIVE_STUN_URLS);

export const GARAGE_SALE_LIVE_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: configuredStunUrls.length > 0 ? configuredStunUrls : DEFAULT_STUN_URLS,
    },
  ],
  iceCandidatePoolSize: 10,
};
