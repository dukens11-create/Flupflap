export type TurnDirection = 'left' | 'right' | 'straight' | 'uturn';
export type TrafficSpeed = 'fast' | 'moderate' | 'slow';
export type DistanceUnit = 'km' | 'mi';

export type TurnInstruction = {
  id: string;
  direction: TurnDirection;
  streetName: string;
  distanceFromStartMeters: number;
  laneRecommendation?: string;
  exitNumber?: string;
  tollWarning?: boolean;
  sharpTurn?: boolean;
};

export type RouteSegment = {
  id: string;
  startMeters: number;
  endMeters: number;
  traffic: TrafficSpeed;
};

export type Waypoint = {
  id: string;
  label: string;
  completed: boolean;
};

export type AlternativeRoute = {
  id: string;
  name: string;
  distanceMeters: number;
  etaMinutes: number;
};

export type AnnouncementState = {
  turnId: string;
  warned300m: boolean;
  warned100m: boolean;
};

export type NavigationSnapshot = {
  remainingMeters: number;
  completionPercent: number;
  etaMinutes: number;
  arrivalTimeLabel: string;
  earlyLateMinutes: number;
  nextTurn: TurnInstruction | null;
  distanceToNextTurnMeters: number;
  upcomingTurns: TurnInstruction[];
  currentSegmentIndex: number;
  arrived: boolean;
};

const MILES_PER_METER = 0.000621371;

export function formatDistance(meters: number, unit: DistanceUnit): string {
  const safeMeters = Math.max(0, meters);
  if (unit === 'mi') {
    const miles = safeMeters * MILES_PER_METER;
    return miles >= 0.1 ? `${miles.toFixed(1)} mi` : `${Math.round(miles * 5280)} ft`;
  }

  if (safeMeters >= 1000) {
    return `${(safeMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(safeMeters)} m`;
}

export function formatDurationMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function convertKmhToMps(speedKmh: number): number {
  return (speedKmh * 1000) / 3600;
}

export function formatEarlyLateMinutes(minutes: number): string {
  if (minutes <= 0) return `${Math.abs(minutes)} min early`;
  return `${minutes} min late`;
}

export function getCompletionPercent(totalMeters: number, remainingMeters: number): number {
  if (totalMeters <= 0) return 100;
  const traveled = Math.max(0, totalMeters - Math.max(0, remainingMeters));
  return Math.min(100, Math.max(0, Math.round((traveled / totalMeters) * 100)));
}

export function getUrgencyColor(distanceToNextTurnMeters: number): string {
  if (distanceToNextTurnMeters <= 100) return 'bg-rose-500';
  if (distanceToNextTurnMeters <= 300) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function shouldRecalculateRoute(deviationMeters: number, thresholdMeters = 120): boolean {
  return deviationMeters >= thresholdMeters;
}

export function reorderWaypoints(waypoints: Waypoint[], fromIndex: number, toIndex: number): Waypoint[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= waypoints.length || toIndex >= waypoints.length) {
    return waypoints;
  }

  const updated = [...waypoints];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  return updated;
}

export function getTurnAnnouncement(
  distanceToNextTurnMeters: number,
  turn: TurnInstruction | null,
  state: AnnouncementState,
  unit: DistanceUnit = 'km',
): { message: string | null; nextState: AnnouncementState } {
  if (!turn || turn.id !== state.turnId) {
    const nextState = {
      turnId: turn?.id ?? '',
      warned300m: false,
      warned100m: false,
    };

    return getTurnAnnouncement(distanceToNextTurnMeters, turn, nextState, unit);
  }

  if (!state.warned300m && distanceToNextTurnMeters <= 300 && distanceToNextTurnMeters > 100) {
    return {
      message: `${directionVerb(turn.direction)} in ${formatDistance(distanceToNextTurnMeters, unit)} on ${turn.streetName}`,
      nextState: { ...state, warned300m: true },
    };
  }

  if (!state.warned100m && distanceToNextTurnMeters <= 100) {
    return {
      message: `Approaching turn: ${directionVerb(turn.direction)} now on ${turn.streetName}`,
      nextState: { ...state, warned100m: true },
    };
  }

  return { message: null, nextState: state };
}

export function calculateNavigationSnapshot(input: {
  totalDistanceMeters: number;
  traveledMeters: number;
  currentSpeedKmh: number;
  trafficDelayMinutes: number;
  baselineEtaMinutes: number;
  turns: TurnInstruction[];
  segments: RouteSegment[];
  now?: Date;
}): NavigationSnapshot {
  const totalDistanceMeters = Math.max(0, input.totalDistanceMeters);
  const traveledMeters = Math.min(totalDistanceMeters, Math.max(0, input.traveledMeters));
  const remainingMeters = Math.max(0, totalDistanceMeters - traveledMeters);
  const speedMps = Math.max(4, convertKmhToMps(input.currentSpeedKmh));
  const travelMinutes = remainingMeters / speedMps / 60;
  const etaMinutes = Math.max(0, Math.round(travelMinutes + Math.max(0, input.trafficDelayMinutes)));
  const nextTurn = input.turns.find((turn) => turn.distanceFromStartMeters > traveledMeters) ?? null;
  const distanceToNextTurnMeters = nextTurn
    ? Math.max(0, Math.round(nextTurn.distanceFromStartMeters - traveledMeters))
    : 0;
  const upcomingTurns = input.turns
    .filter((turn) => turn.distanceFromStartMeters > traveledMeters)
    .slice(0, 5);

  let currentSegmentIndex = input.segments.findIndex(
    (segment) => traveledMeters >= segment.startMeters && traveledMeters < segment.endMeters,
  );
  if (currentSegmentIndex === -1) {
    currentSegmentIndex = Math.max(0, input.segments.length - 1);
  }

  const now = input.now ?? new Date();
  const arrivalTime = new Date(now.getTime() + etaMinutes * 60_000);
  const arrivalTimeLabel = arrivalTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return {
    remainingMeters,
    completionPercent: getCompletionPercent(totalDistanceMeters, remainingMeters),
    etaMinutes,
    arrivalTimeLabel,
    earlyLateMinutes: etaMinutes - Math.max(0, Math.round(input.baselineEtaMinutes)),
    nextTurn,
    distanceToNextTurnMeters,
    upcomingTurns,
    currentSegmentIndex,
    arrived: remainingMeters <= 10,
  };
}

export function directionIcon(direction: TurnDirection): string {
  switch (direction) {
    case 'left':
      return '⬅️';
    case 'right':
      return '➡️';
    case 'uturn':
      return '↩️';
    default:
      return '⬆️';
  }
}

export function directionVerb(direction: TurnDirection): string {
  switch (direction) {
    case 'left':
      return 'Turn left';
    case 'right':
      return 'Turn right';
    case 'uturn':
      return 'Make a U-turn';
    default:
      return 'Continue straight';
  }
}

export const DEFAULT_TURNS: TurnInstruction[] = [
  {
    id: 't-1',
    direction: 'right',
    streetName: 'Main St',
    distanceFromStartMeters: 500,
    laneRecommendation: 'Use right lane',
    sharpTurn: false,
  },
  {
    id: 't-2',
    direction: 'left',
    streetName: 'Broadway Ave',
    distanceFromStartMeters: 1400,
    laneRecommendation: 'Stay in middle lane',
  },
  {
    id: 't-3',
    direction: 'straight',
    streetName: 'I-80 E',
    distanceFromStartMeters: 2600,
    exitNumber: 'Exit 22B',
    tollWarning: true,
  },
  {
    id: 't-4',
    direction: 'uturn',
    streetName: 'River Rd',
    distanceFromStartMeters: 4200,
    sharpTurn: true,
  },
  {
    id: 't-5',
    direction: 'right',
    streetName: 'Oak Valley Ln',
    distanceFromStartMeters: 5600,
  },
];

export const DEFAULT_SEGMENTS: RouteSegment[] = [
  { id: 's-1', startMeters: 0, endMeters: 1200, traffic: 'fast' },
  { id: 's-2', startMeters: 1200, endMeters: 2600, traffic: 'moderate' },
  { id: 's-3', startMeters: 2600, endMeters: 4300, traffic: 'slow' },
  { id: 's-4', startMeters: 4300, endMeters: 6000, traffic: 'fast' },
];

export const DEFAULT_WAYPOINTS: Waypoint[] = [
  { id: 'w-1', label: 'Pickup · 221B Baker Street', completed: false },
  { id: 'w-2', label: 'Dropoff · 85 King Street', completed: false },
  { id: 'w-3', label: 'Final Destination · Terminal 2', completed: false },
];

export const DEFAULT_ALTERNATIVE_ROUTES: AlternativeRoute[] = [
  { id: 'r-fast', name: 'Fastest', distanceMeters: 6000, etaMinutes: 14 },
  { id: 'r-balanced', name: 'Balanced', distanceMeters: 6500, etaMinutes: 16 },
  { id: 'r-scenic', name: 'Scenic', distanceMeters: 7800, etaMinutes: 19 },
];
