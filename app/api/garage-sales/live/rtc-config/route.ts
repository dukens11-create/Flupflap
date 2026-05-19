import { NextResponse } from 'next/server';
import { GARAGE_SALE_LIVE_RTC_CONFIG, parseGarageSaleLiveRtcUrls } from '@/lib/garage-sale-live-rtc';

export const dynamic = 'force-dynamic';

export async function GET() {
  const turnUrls = parseGarageSaleLiveRtcUrls(process.env.GARAGE_SALE_LIVE_TURN_URLS);
  const turnUsername = process.env.GARAGE_SALE_LIVE_TURN_USERNAME?.trim() ?? '';
  const turnCredential = process.env.GARAGE_SALE_LIVE_TURN_CREDENTIAL?.trim() ?? '';

  const iceServers: RTCIceServer[] = [...(GARAGE_SALE_LIVE_RTC_CONFIG.iceServers ?? [])];
  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return NextResponse.json({
    iceServers,
    iceCandidatePoolSize: GARAGE_SALE_LIVE_RTC_CONFIG.iceCandidatePoolSize ?? 10,
  });
}
