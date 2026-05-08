import { createHmac } from 'crypto';
import { prisma } from './db';

type RequestLike =
  | Request
  | {
      headers?: Headers | Map<string, string> | Record<string, string | string[] | undefined>;
    }
  | undefined
  | null;

const RAPID_CHANGE_WINDOW_MS = 1000 * 60 * 60 * 24;

function getHeader(request: RequestLike, name: string) {
  if (!request) return null;
  const headers = request.headers;
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  if (typeof (headers as Map<string, string>).get === 'function') {
    return (headers as Map<string, string>).get(name) ?? (headers as Map<string, string>).get(name.toLowerCase()) ?? null;
  }

  const value =
    (headers as Record<string, string | string[] | undefined>)[name] ??
    (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];

  return Array.isArray(value) ? (value[0] ?? null) : value ?? null;
}

function pickIpAddress(request: RequestLike) {
  const forwardedFor = getHeader(request, 'x-forwarded-for');
  const realIp = getHeader(request, 'x-real-ip');
  const cloudflareIp = getHeader(request, 'cf-connecting-ip');
  const raw = forwardedFor ?? realIp ?? cloudflareIp;
  if (!raw) return null;
  return raw.split(',')[0]?.trim() || null;
}

function maskIpAddress(ipAddress: string | null) {
  if (!ipAddress) return 'Unknown network';
  if (ipAddress.includes(':')) {
    const parts = ipAddress.split(':').filter(Boolean);
    return `${parts.slice(0, 3).join(':') || 'ipv6'}:*`;
  }
  const parts = ipAddress.split('.');
  if (parts.length !== 4) return 'Unknown network';
  return `${parts[0]}.${parts[1]}.x.x`;
}

function getDeviceLabel(userAgent: string | null) {
  if (!userAgent) return 'Unknown device';

  const browser =
    /edg/i.test(userAgent) ? 'Edge' :
    /chrome/i.test(userAgent) ? 'Chrome' :
    /firefox/i.test(userAgent) ? 'Firefox' :
    /safari/i.test(userAgent) ? 'Safari' :
    /iphone|ipad|ios/i.test(userAgent) ? 'iOS browser' :
    'Browser';

  const platform =
    /windows/i.test(userAgent) ? 'Windows' :
    /mac os/i.test(userAgent) ? 'macOS' :
    /android/i.test(userAgent) ? 'Android' :
    /iphone|ipad|ios/i.test(userAgent) ? 'iPhone/iPad' :
    /linux/i.test(userAgent) ? 'Linux' :
    'device';

  return `${browser} on ${platform}`;
}

function fingerprint(value: string | null) {
  if (!value) return null;
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) return null;

  return createHmac('sha256', secret).update(value).digest('hex');
}

export function describeSuspiciousReason(reason: string) {
  switch (reason) {
    case 'new_device':
      return 'New device';
    case 'new_network':
      return 'New network';
    case 'rapid_change':
      return 'Different network from a recent sign-in';
    default:
      return reason;
  }
}

export async function recordLoginActivity(userId: string, request: RequestLike) {
  const ipAddress = pickIpAddress(request);
  const userAgent = getHeader(request, 'user-agent');
  const ipHash = fingerprint(ipAddress);
  const deviceHash = fingerprint(userAgent);
  const ipLabel = maskIpAddress(ipAddress);
  const deviceLabel = getDeviceLabel(userAgent);

  const previousActivities = await prisma.loginActivity.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      ipHash: true,
      deviceHash: true,
      createdAt: true,
    },
  });

  const prior = previousActivities[0];
  const hasSeenDevice = deviceHash ? previousActivities.some((activity) => activity.deviceHash === deviceHash) : false;
  const hasSeenNetwork = ipHash ? previousActivities.some((activity) => activity.ipHash === ipHash) : false;

  const reasons: string[] = [];
  if (previousActivities.length > 0 && deviceHash && !hasSeenDevice) {
    reasons.push('new_device');
  }
  if (previousActivities.length > 0 && ipHash && !hasSeenNetwork) {
    reasons.push('new_network');
  }
  if (
    previousActivities.length > 0 &&
    prior?.createdAt &&
    ipHash &&
    prior.ipHash &&
    prior.ipHash !== ipHash &&
    prior.createdAt.getTime() >= Date.now() - RAPID_CHANGE_WINDOW_MS
  ) {
    reasons.push('rapid_change');
  }

  const suspicious =
    reasons.includes('rapid_change') ||
    (reasons.includes('new_device') && reasons.includes('new_network'));

  await prisma.loginActivity.create({
    data: {
      userId,
      ipHash,
      ipLabel,
      deviceHash,
      deviceLabel,
      suspicious,
      suspiciousReasons: suspicious ? reasons : [],
    },
  });

  return { suspicious, reasons };
}
