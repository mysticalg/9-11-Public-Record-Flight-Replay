export type Confidence = "high" | "medium" | "low";
export type ReplayInterpolationMode = "linear" | "smooth";
export type AlertSeverity = "normal" | "warning" | "critical";
export type FlightId = "aa11" | "ua175" | "aa77" | "ua93";
export type SiteId = "pentagon" | "wtc" | "shanksville";

export type CameraMode =
  | "free_orbit"
  | "full_path"
  | "top_down"
  | "side_elevation"
  | "chase_locked"
  | "wide_aerial"
  | "ground_reference"
  | "security_cam_01"
  | "security_cam_02"
  | "split_screen";

export interface ReplayPoint {
  t: number;
  x: number;
  y: number;
  z: number;
  utc?: string | null;
  lat?: number;
  lon?: number;
  altitudeFeet?: number;
  altitudeSource?: string;
  headingDeg?: number | null;
  trackDeg?: number | null;
  pitchDeg?: number | null;
  rollDeg?: number | null;
  visualRollDeg?: number | null;
  groundSpeedKt?: number | null;
  computedAirspeedKt?: number | null;
  trueAirspeedKt?: number | null;
  mach?: number | null;
  verticalAccelG?: number | null;
  lateralAccelG?: number | null;
  longitudinalAccelG?: number | null;
  leftAileronDeg?: number | null;
  rightAileronDeg?: number | null;
  rudderDeg?: number | null;
  rudderPedalDeg?: number | null;
  flapHandleDeg?: number | null;
  overspeed?: string | null;
  nav?: FdrNavSnapshot | null;
  confidence: Confidence;
  sourceRef: string;
}

export interface ReplayState {
  t: number;
  position: [number, number, number];
  tangent: [number, number, number];
  confidence: Confidence;
  sourceRef: string;
  interpolation: "documented" | "inferred";
  altitudeFeet?: number | null;
  altitudeSource?: string;
  yawDeg?: number | null;
  headingDeg?: number | null;
  trackDeg?: number | null;
  pathBearingDeg?: number | null;
  pitchDeg?: number | null;
  rollDeg?: number | null;
  visualRollDeg?: number | null;
  groundSpeedKt?: number | null;
  computedAirspeedKt?: number | null;
  trueAirspeedKt?: number | null;
  mach?: number | null;
  verticalAccelG?: number | null;
  lateralAccelG?: number | null;
  longitudinalAccelG?: number | null;
  leftAileronDeg?: number | null;
  rightAileronDeg?: number | null;
  rudderDeg?: number | null;
  rudderPedalDeg?: number | null;
  flapHandleDeg?: number | null;
  speedRateKtPerSec?: number | null;
  overspeed?: string | null;
  nav?: FdrNavSnapshot | null;
  verticalSpeedFpm?: number | null;
  interpolationMode?: ReplayInterpolationMode;
}

export interface FdrNavSnapshot {
  autopilot?: {
    hud?: string | null;
    command?: FdrChannelSnapshot;
    cws?: FdrChannelSnapshot;
    engageDetent?: FdrChannelSnapshot;
    warning?: FdrChannelSnapshot;
    caution?: FdrChannelSnapshot;
  };
  autothrottle?: {
    engagedHud?: string | null;
    disconnect?: string | null;
    throttleHoldAnnun?: string | null;
    thrustMode?: string | null;
  };
  flightDirector?: {
    captain?: string | null;
    firstOfficer?: string | null;
  };
  modes?: {
    vnavLeft?: string | null;
    vnavCenter?: string | null;
    vnavRight?: string | null;
    ias?: string | null;
    mach?: string | null;
    altHold?: FdrChannelSnapshot;
    flightLevelChange?: FdrChannelSnapshot;
    verticalSpeed?: FdrChannelSnapshot;
    glideSlope?: FdrChannelSnapshot;
    takeoff?: FdrChannelSnapshot;
    rollout?: FdrChannelSnapshot;
    iasEngaged?: FdrChannelSnapshot;
    machEngaged?: FdrChannelSnapshot;
    iasLimit?: FdrChannelSnapshot;
    machLimit?: FdrChannelSnapshot;
    conMode?: string | null;
  };
  radioNav?: {
    vorLeftMhz?: number | null;
    vorRightMhz?: number | null;
    dmeLeftNm?: number | null;
    dmeRightNm?: number | null;
  };
  airData?: {
    altitudeReporting?: string | null;
    adcSelectCaptain?: string | null;
    adcSelectFirstOfficer?: string | null;
    adcSelectSwitchCaptain?: string | null;
  };
  performance?: {
    eprTargetFmc?: number | null;
  };
  mcpTargets?: {
    selectedHeadingDeg?: number | null;
    selectedAltitudeFeet?: number | null;
    selectedAirspeedKt?: number | null;
    selectedVerticalSpeedFpm?: number | null;
    caveat?: string;
  };
}

export interface FdrChannelSnapshot {
  left?: string | null;
  center?: string | null;
  right?: string | null;
}

export interface EventMarker {
  t: number;
  timeLabel: string;
  title: string;
  description: string;
  source: string;
  confidence: Confidence;
  timelineOnly?: boolean;
}

export interface SourceRecord {
  id: string;
  title: string;
  type: string;
  reference: string;
  confidence: Confidence;
  role: "documented" | "inferred" | "artistic_interpolation";
}
