export type IceCandidateType = 'host' | 'srflx' | 'relay' | 'prflx' | 'unknown';

export function getIceCandidateType(candidate?: string): IceCandidateType {
  if (!candidate) return 'unknown';
  // ICE candidate strings include "typ <type>" per RFC 5245/8445 candidate attribute format.
  const rawType = candidate.match(/\btyp\s+([a-z]+)/i)?.[1]?.toLowerCase();
  switch (rawType) {
    case 'host':
    case 'srflx':
    case 'relay':
    case 'prflx':
      return rawType;
    default:
      return 'unknown';
  }
}
