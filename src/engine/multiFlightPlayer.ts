import * as THREE from "three";
import osmPentagonFootprint from "../data/osmPentagonFootprint.generated.json";
import { publicFlightPathDefinitions, type PublicFlightWaypoint } from "../data/publicFlightPaths";
import { wtcImpactAttitudeDefinitions } from "../data/siteDefinitions";
import { replayStartClock } from "../data/trajectoryLocked";
import type { FlightId, ReplayInterpolationMode, ReplayState } from "../types";
import { approximateWgs84ToLocalEnu } from "./coordinateTransforms";
import { getReplayState, replayDuration } from "./trajectoryPlayer";

interface FlightReplayStateOptions {
  interpolationMode?: ReplayInterpolationMode;
}

type PublicFlightId = Exclude<FlightId, "aa77">;

interface PublicFlightSample {
  replayTime: number;
  position: THREE.Vector3;
  waypoint: PublicFlightWaypoint;
}

const feetToMeters = 0.3048;
const metersPerSecondToKnots = 1 / 0.514444;
const replayStartSeconds = secondsOfDay(replayStartClock);
const publicPositionSmoothingHalfWindowSeconds: Record<PublicFlightId, number> = {
  aa11: 36,
  ua175: 36,
  ua93: 7
};

const publicFlightSamples = Object.fromEntries(
  Object.entries(publicFlightPathDefinitions).map(([flightId, definition]) => [
    flightId,
    definition.waypoints.map((waypoint) => ({
      replayTime: secondsOfDay(waypoint.clock) - replayStartSeconds,
      position: localVectorFromWaypoint(waypoint),
      waypoint
    }))
  ])
) as Record<PublicFlightId, PublicFlightSample[]>;

const publicVisualPositions = Object.fromEntries(
  (Object.keys(publicFlightSamples) as PublicFlightId[]).map((flightId) => [
    flightId,
    publicFlightSamples[flightId].map((_, index) => visualPositionRegressionAtIndex(flightId, index))
  ])
) as Record<PublicFlightId, THREE.Vector3[]>;

export function getFlightReplayState(
  flightId: FlightId,
  t: number,
  options: FlightReplayStateOptions = {}
): ReplayState {
  if (flightId === "aa77") {
    return getReplayState(t, options);
  }

  return getPublicFlightReplayState(flightId, t, options);
}

export function flightReplayDataWindow(flightId: FlightId) {
  if (flightId === "aa77") {
    return { start: 0, end: replayDuration };
  }

  const samples = publicFlightSamples[flightId];
  return {
    start: samples[0].replayTime,
    end: samples[samples.length - 1].replayTime
  };
}

export function isFlightReplayDataVisible(flightId: FlightId, t: number) {
  const window = flightReplayDataWindow(flightId);
  return t >= window.start - 0.001 && t <= window.end + 0.001;
}

export function publicFlightPathWorldPoints(
  flightId: PublicFlightId,
  samplesPerLeg = 64,
  interpolationMode: ReplayInterpolationMode = "linear"
) {
  const samples = publicFlightSamples[flightId];
  const points: THREE.Vector3[] = [];
  const effectiveSamplesPerLeg = Math.min(samplesPerLeg, samples.length > 600 ? 1 : 8);
  const smooth = interpolationMode === "smooth";

  for (let index = 0; index < samples.length - 1; index += 1) {
    const current = samples[index];
    const next = samples[index + 1];
    for (let step = 0; step < effectiveSamplesPerLeg; step += 1) {
      const localT = step / effectiveSamplesPerLeg;
      points.push(
        smooth
          ? publicCatmullRomSegment(flightId, index, localT, true).position
          : current.position.clone().lerp(next.position, localT)
      );
    }
  }

  points.push(samples[samples.length - 1].position.clone());
  return points;
}

export function allPublicFlightPathWorldPoints() {
  return (Object.keys(publicFlightPathDefinitions) as PublicFlightId[]).flatMap((flightId) =>
    publicFlightPathWorldPoints(flightId, 16)
  );
}

function getPublicFlightReplayState(
  flightId: PublicFlightId,
  t: number,
  options: FlightReplayStateOptions
): ReplayState {
  const definition = publicFlightPathDefinitions[flightId];
  const samples = publicFlightSamples[flightId];

  if (t <= samples[0].replayTime) {
    return stateFromPublicSample(flightId, definition.label, samples[0], samples[1], t, true, options);
  }

  const index = sampleIndexAtOrBefore(samples, t);
  if (index < samples.length - 1) {
    const current = samples[index];
    const next = samples[index + 1];
    const duration = Math.max(next.replayTime - current.replayTime, 0.001);
    const localT = (t - current.replayTime) / duration;
    const smoothVisuals = options.interpolationMode === "smooth" && canSmoothPublicSegment(flightId, index);
    const curve = smoothVisuals ? publicCatmullRomSegment(flightId, index, localT, true) : null;
    const position = curve?.position ?? current.position.clone().lerp(next.position, localT);
    const tangent = curve?.tangent ?? next.position.clone().sub(current.position);
    const horizontalDistanceMeters = Math.hypot(tangent.x, tangent.z);
    const verticalFeet = next.waypoint.altitudeFeet - current.waypoint.altitudeFeet;
    const groundSpeedKt = (horizontalDistanceMeters / duration) * metersPerSecondToKnots;
    const verticalSpeedFpm = (verticalFeet / duration) * 60;
    const confidence = current.waypoint.confidence === "medium" && next.waypoint.confidence === "medium" ? "medium" : "low";
    const pathBearingDeg = headingFromWorldVector(tangent);
    const pathPitchDeg = (Math.atan2(tangent.y, horizontalDistanceMeters) * 180) / Math.PI;
    const attitude = publicTerminalAttitudeForFlight(
      flightId,
      t,
      pathBearingDeg,
      pathPitchDeg,
      groundSpeedKt,
      verticalSpeedFpm
    );

    return {
      t,
      position: [position.x, position.y, position.z],
      tangent: normalizedTuple(tangent),
      confidence,
      sourceRef: `${definition.label}: ${current.waypoint.clock} ${current.waypoint.label} to ${next.waypoint.clock} ${next.waypoint.label}; ${definition.caveat}${attitude.sourceSuffix}`,
      interpolation: "inferred",
      altitudeFeet: current.waypoint.altitudeFeet + verticalFeet * localT,
      altitudeSource: flightId === "ua93" ? "public_ua93_black_box_kml" : "public_dcc_radar_kml",
      yawDeg: attitude.headingDeg,
      headingDeg: attitude.headingDeg,
      trackDeg: pathBearingDeg,
      pathBearingDeg,
      pitchDeg: attitude.pitchDeg,
      rollDeg: attitude.rollDeg,
      visualRollDeg: attitude.rollDeg,
      groundSpeedKt: attitude.groundSpeedKt,
      computedAirspeedKt: null,
      trueAirspeedKt: null,
      mach: null,
      verticalAccelG: null,
      lateralAccelG: null,
      longitudinalAccelG: null,
      leftAileronDeg: null,
      rightAileronDeg: null,
      rudderDeg: null,
      rudderPedalDeg: null,
      flapHandleDeg: null,
      speedRateKtPerSec: null,
      overspeed: null,
      nav: null,
      verticalSpeedFpm: attitude.verticalSpeedFpm,
      interpolationMode: options.interpolationMode
    };
  }

  return stateFromPublicSample(
    flightId,
    definition.label,
    samples[samples.length - 1],
    samples[samples.length - 2],
    t,
    false,
    options
  );
}

function stateFromPublicSample(
  flightId: PublicFlightId,
  label: string,
  sample: PublicFlightSample,
  neighbor: PublicFlightSample,
  t: number,
  beforeFirst: boolean,
  options: FlightReplayStateOptions
): ReplayState {
  const tangent = beforeFirst
    ? neighbor.position.clone().sub(sample.position)
    : sample.position.clone().sub(neighbor.position);
  const bearing = headingFromWorldVector(tangent);
  const derivedVerticalSpeedFpm = beforeFirst
    ? 0
    : ((sample.waypoint.altitudeFeet - neighbor.waypoint.altitudeFeet) /
        Math.max(Math.abs(sample.replayTime - neighbor.replayTime), 0.001)) *
      60;
  const attitude = publicTerminalAttitudeForFlight(
    flightId,
    sample.replayTime,
    bearing,
    0,
    beforeFirst ? 0 : null,
    derivedVerticalSpeedFpm
  );
  return {
    t,
    position: [sample.position.x, sample.position.y, sample.position.z],
    tangent: normalizedTuple(tangent),
    confidence: sample.waypoint.confidence,
    sourceRef: `${label}: ${sample.waypoint.clock} ${sample.waypoint.label}; ${sample.waypoint.source}. ${publicFlightPathDefinitions[flightId].caveat}${attitude.sourceSuffix}`,
    interpolation: "documented",
    altitudeFeet: sample.waypoint.altitudeFeet,
    altitudeSource: flightId === "ua93" ? "public_ua93_black_box_kml" : "public_dcc_radar_kml",
    yawDeg: attitude.headingDeg,
    headingDeg: attitude.headingDeg,
    trackDeg: bearing,
    pathBearingDeg: bearing,
    pitchDeg: attitude.pitchDeg,
    rollDeg: attitude.rollDeg,
    visualRollDeg: attitude.rollDeg,
    groundSpeedKt: beforeFirst ? 0 : attitude.groundSpeedKt,
    computedAirspeedKt: null,
    trueAirspeedKt: null,
    mach: null,
    verticalAccelG: null,
    lateralAccelG: null,
    longitudinalAccelG: null,
    leftAileronDeg: null,
    rightAileronDeg: null,
    rudderDeg: null,
    rudderPedalDeg: null,
    flapHandleDeg: null,
    speedRateKtPerSec: null,
    overspeed: null,
    nav: null,
    verticalSpeedFpm: attitude.verticalSpeedFpm,
    interpolationMode: options.interpolationMode
  };
}

function publicTerminalAttitudeForFlight(
  flightId: PublicFlightId,
  replayTime: number,
  pathBearingDeg: number,
  pathPitchDeg: number,
  groundSpeedKt: number | null,
  verticalSpeedFpm: number | null
) {
  const terminal = flightId === "aa11" || flightId === "ua175" ? wtcImpactAttitudeDefinitions[flightId] : null;
  if (!terminal) {
    return {
      headingDeg: normalizeHeadingDeg(pathBearingDeg),
      pitchDeg: pathPitchDeg,
      rollDeg: null,
      groundSpeedKt,
      verticalSpeedFpm,
      sourceSuffix: ""
    };
  }

  const samples = publicFlightSamples[flightId];
  const endTime = samples[samples.length - 1].replayTime;
  const startTime = Math.max(samples[0].replayTime, endTime - terminal.blendLeadSeconds);
  const blend =
    replayTime <= startTime
      ? 0
      : smoothstep(THREE.MathUtils.clamp((replayTime - startTime) / Math.max(endTime - startTime, 0.001), 0, 1));
  const sourceImpactPitchDeg = terminal.verticalApproachDeg + terminal.fuselageNoseUpRelativeDeg;
  const sourceRollDeg = -terminal.leftWingDownRollDeg;
  const impactSpeedKt = terminal.impactSpeedMph * 0.868976;
  const impactVerticalSpeedFpm = impactSpeedKt * 101.269 * Math.sin(degToRad(terminal.verticalApproachDeg));

  return {
    headingDeg: normalizeHeadingDeg(pathBearingDeg + terminal.yawOffsetRelativeToPathDeg * blend),
    pitchDeg: THREE.MathUtils.lerp(pathPitchDeg, sourceImpactPitchDeg, blend),
    rollDeg: sourceRollDeg * blend,
    groundSpeedKt: groundSpeedKt === null ? impactSpeedKt * blend : THREE.MathUtils.lerp(groundSpeedKt, impactSpeedKt, blend),
    verticalSpeedFpm:
      verticalSpeedFpm === null
        ? impactVerticalSpeedFpm * blend
        : THREE.MathUtils.lerp(verticalSpeedFpm, impactVerticalSpeedFpm, blend),
    sourceSuffix:
      blend > 0.001
        ? ` Terminal attitude is blended toward ${terminal.label}; ${terminal.source}`
        : ""
  };
}

function sampleIndexAtOrBefore(samples: PublicFlightSample[], t: number) {
  let low = 0;
  let high = samples.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].replayTime <= t) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(0, Math.min(high, samples.length - 1));
}

function canSmoothPublicSegment(flightId: PublicFlightId, index: number) {
  return Boolean(publicFlightSamples[flightId][index] && publicFlightSamples[flightId][index + 1]);
}

function publicCatmullRomSegment(flightId: PublicFlightId, index: number, t: number, visual = false) {
  const samples = publicFlightSamples[flightId];
  const p0 = vectorForPublicSample(flightId, Math.max(0, index - 1), visual);
  const p1 = vectorForPublicSample(flightId, index, visual);
  const p2 = vectorForPublicSample(flightId, Math.min(samples.length - 1, index + 1), visual);
  const p3 = vectorForPublicSample(flightId, Math.min(samples.length - 1, index + 2), visual);
  const t2 = t * t;
  const t3 = t2 * t;

  const position = p1
    .clone()
    .multiplyScalar(2)
    .add(p2.clone().sub(p0).multiplyScalar(t))
    .add(
      p0
        .clone()
        .multiplyScalar(2)
        .add(p1.clone().multiplyScalar(-5))
        .add(p2.clone().multiplyScalar(4))
        .sub(p3)
        .multiplyScalar(t2)
    )
    .add(
      p0
        .clone()
        .multiplyScalar(-1)
        .add(p1.clone().multiplyScalar(3))
        .add(p2.clone().multiplyScalar(-3))
        .add(p3)
        .multiplyScalar(t3)
    )
    .multiplyScalar(0.5);

  const tangent = p2
    .clone()
    .sub(p0)
    .add(
      p0
        .clone()
        .multiplyScalar(2)
        .add(p1.clone().multiplyScalar(-5))
        .add(p2.clone().multiplyScalar(4))
        .sub(p3)
        .multiplyScalar(2 * t)
    )
    .add(
      p0
        .clone()
        .multiplyScalar(-1)
        .add(p1.clone().multiplyScalar(3))
        .add(p2.clone().multiplyScalar(-3))
        .add(p3)
        .multiplyScalar(3 * t2)
    )
    .multiplyScalar(0.5);

  return { position, tangent };
}

function vectorForPublicSample(flightId: PublicFlightId, index: number, visual = false) {
  return visual ? publicVisualPositions[flightId][index].clone() : publicFlightSamples[flightId][index].position.clone();
}

function visualPositionRegressionAtIndex(flightId: PublicFlightId, index: number) {
  const samples = publicFlightSamples[flightId];
  const center = samples[index];
  if (!center || !Number.isFinite(center.replayTime)) {
    return new THREE.Vector3(0, 0, 0);
  }

  const raw = center.position.clone();
  const halfWindow = publicPositionSmoothingHalfWindowSeconds[flightId];
  const windowSamples = samples.filter(
    (sample) =>
      sample.replayTime >= center.replayTime - halfWindow &&
      sample.replayTime <= center.replayTime + halfWindow &&
      Number.isFinite(sample.position.x) &&
      Number.isFinite(sample.position.y) &&
      Number.isFinite(sample.position.z)
  );

  if (windowSamples.length < 5) {
    return raw;
  }

  const fitted = new THREE.Vector3(
    regressionValueAt(windowSamples, "x", center.replayTime),
    regressionValueAt(windowSamples, "y", center.replayTime),
    regressionValueAt(windowSamples, "z", center.replayTime)
  );
  const firstTime = samples[0].replayTime;
  const lastTime = samples[samples.length - 1].replayTime;
  const startWeight = THREE.MathUtils.clamp((center.replayTime - firstTime) / Math.max(halfWindow, 1), 0, 1);
  const endWeight = THREE.MathUtils.clamp((lastTime - center.replayTime) / Math.max(halfWindow, 1), 0, 1);
  const weight = startWeight * endWeight * smoothingWeightForFlight(flightId);

  return raw.lerp(fitted, weight);
}

function smoothingWeightForFlight(flightId: PublicFlightId) {
  return flightId === "ua93" ? 0.42 : 0.56;
}

function regressionValueAt(samples: PublicFlightSample[], axis: "x" | "y" | "z", t: number) {
  const meanTime = samples.reduce((sum, sample) => sum + sample.replayTime, 0) / samples.length;
  const meanValue = samples.reduce((sum, sample) => sum + sample.position[axis], 0) / samples.length;
  const covariance = samples.reduce(
    (sum, sample) => sum + (sample.replayTime - meanTime) * (sample.position[axis] - meanValue),
    0
  );
  const variance = samples.reduce((sum, sample) => sum + (sample.replayTime - meanTime) ** 2, 0);
  if (variance <= 0) {
    return meanValue;
  }

  const slope = covariance / variance;
  return meanValue + slope * (t - meanTime);
}

function localVectorFromWaypoint(waypoint: PublicFlightWaypoint) {
  const local = approximateWgs84ToLocalEnu(
    { lat: waypoint.lat, lon: waypoint.lon, altMeters: waypoint.altitudeFeet * feetToMeters },
    {
      lat: osmPentagonFootprint.coordinateSystem.anchor.lat,
      lon: osmPentagonFootprint.coordinateSystem.anchor.lon,
      altMeters: 0
    }
  );
  return new THREE.Vector3(local.east, local.up, -local.north);
}

function normalizedTuple(vector: THREE.Vector3): [number, number, number] {
  if (vector.lengthSq() < 0.000001) {
    return [1, 0, 0];
  }

  const normal = vector.clone().normalize();
  return [normal.x, normal.y, normal.z];
}

function headingFromWorldVector(vector: THREE.Vector3) {
  return ((Math.atan2(vector.x, -vector.z) * 180) / Math.PI + 360) % 360;
}

function normalizeHeadingDeg(value: number) {
  return ((value % 360) + 360) % 360;
}

function smoothstep(value: number) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function secondsOfDay(clock: string) {
  const [hours, minutes, seconds = 0] = clock.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}
