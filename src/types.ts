export interface BoundingBox {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
  areaSqDeg: number;
}

export type ErrorType =
  | 'TIMEOUT'
  | 'HTTP_429'
  | 'EMPTY_RESPONSE'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | null;

export interface FetchAttemptInfo {
  timestamp: string;
  status: 'ok' | 'error';
  httpStatus: number | null;
  errorType: ErrorType;
  message: string;
}

export interface AircraftState {
  icao24: string;
  callsign: string;
  originCountry: string;
  longitude: number;
  latitude: number;
  baroAltitudeM: number | null;
  geoAltitudeM: number | null;
  onGround: boolean;
  velocityMs: number | null;
  velocityKmh: number | null;
  velocityKnots: number | null;
  trueTrackDeg: number;
  verticalRateMs: number;
  lastContact: number;
  timePosition: number | null;
  squawk: string | null;
}

export interface LatestFlightData {
  source: 'opensky-live' | 'demo-fallback';
  isDemo: boolean;
  demoNotice?: string | null;
  fetchedAt: string;
  apiTimestamp: number;
  bbox: BoundingBox;
  aircraftCount: number;
  airborneCount: number;
  onGroundCount: number;
  avgAltitudeM: number;
  avgVelocityKmh: number;
  lastAttempt: FetchAttemptInfo;
  aircraft: AircraftState[];
}

export interface SnapshotEntry {
  timestamp: string;
  unixTime: number;
  aircraftCount: number;
  airborneCount: number;
  avgAltitudeM: number;
  avgVelocityKmh: number;
  source: 'opensky-live' | 'demo-fallback';
  isDemo: boolean;
  status: string;
}

export interface SnapshotsDocument {
  updatedAt: string;
  isDemo: boolean;
  bbox: BoundingBox;
  totalSnapshots: number;
  lastAttempt?: FetchAttemptInfo;
  snapshots: SnapshotEntry[];
}

export type UiStateMode = 'auto' | 'loading' | 'empty' | 'stale' | 'error';
