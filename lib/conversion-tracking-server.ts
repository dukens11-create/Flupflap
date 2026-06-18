import { isConversionEventName, type ConversionEventName } from '@/lib/conversion-events';
import { logInfo } from '@/lib/logger';

type ServerConversionPayload = Record<string, unknown>;

export async function trackServerConversionEvent(
  event: ConversionEventName,
  payload?: ServerConversionPayload,
) {
  if (!isConversionEventName(event)) return;

  logInfo('Conversion event tracked', {
    tag: 'analytics/conversion',
    event,
    ...(payload ? { payload } : {}),
  });
}
