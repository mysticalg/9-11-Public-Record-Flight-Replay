import * as THREE from "three";
import { trajectoryPoints } from "../data/trajectoryLocked";
import { evidenceImpactReferencePoint } from "./impactReference";
import type { Confidence, ReplayInterpolationMode, ReplayPoint, ReplayState } from "../types";

export const fdrReplayDuration = trajectoryPoints[trajectoryPoints.length - 1].t;
const terminalLastPoint = trajectoryPoints[trajectoryPoints.length - 1];
const terminalPreviousPoint = trajectoryPoints[Math.max(0, trajectoryPoints.length - 2)];
const evidenceImpactReference = evidenceImpactReferencePoint();
const terminalStartReference = vectorFromReplayPoint(terminalLastPoint);
const terminalStartVelocity = terminalVelocityFromLastRows(terminalLastPoint, terminalPreviousPoint);
const terminalDistanceMeters = terminalStartReference.distanceTo(evidenceImpactReference);
const terminalVisualRightRollDeg = 20;
const terminalVisualRollLeadSeconds = 6;
export const terminalImpactSeconds = THREE.MathUtils.clamp(
  terminalDistanceMeters / Math.max(terminalStartVelocity.length(), 1),
  1.05,
  1.75
);
export const replayDuration = fdrReplayDuration + terminalImpactSeconds;
const terminalEndVelocity = terminalEndVelocityFromImpactReference();
const verticalSpeedWindowSeconds = 20;
const speedRateWindowSeconds = 12;
const positionSmoothingHalfWindowSeconds = 6;
const verticalSpeedByPoint = trajectoryPoints.map((_, index) => verticalSpeedRegressionAtIndex(index));
const speedRateByPoint = trajectoryPoints.map((_, index) => speedRateRegressionAtIndex(index));
const visualPositionByPoint = trajectoryPoints.map((_, index) => visualPositionRegressionAtIndex(index));

interface ReplayStateOptions {
  interpolationMode?: ReplayInterpolationMode;
}

export function clampReplayTime(t: number) {
  return Math.min(Math.max(t, 0), replayDuration);
}

export function getReplayState(t: number, options: ReplayStateOptions = {}): ReplayState {
  const clamped = clampReplayTime(t);
  const interpolationMode = options.interpolationMode ?? "linear";

  if (clamped > fdrReplayDuration) {
    return getTerminalImpactState(clamped, interpolationMode);
  }

  const segment = findSegment(clamped);
  const segmentDuration = Math.max(segment.next.t - segment.current.t, 0.001);
  const localT = (clamped - segment.current.t) / segmentDuration;
  const smoothVisuals = interpolationMode === "smooth" && canSmoothSegment(segment.index);
  const visualT = smoothVisuals ? smoothstep(localT) : localT;
  const curve = smoothVisuals ? catmullRomSegment(segment.index, localT, true) : null;
  const position =
    curve?.position ??
    new THREE.Vector3(segment.current.x, segment.current.y, segment.current.z).lerp(
      new THREE.Vector3(segment.next.x, segment.next.y, segment.next.z),
      localT
    );
  const tangent =
    curve?.tangent ??
    new THREE.Vector3(
      segment.next.x - segment.current.x,
      segment.next.y - segment.current.y,
      segment.next.z - segment.current.z
    );

  if (tangent.lengthSq() < 0.000001) {
    tangent.set(1, 0, 0);
  } else {
    tangent.normalize();
  }

  const pathBearingDeg = headingFromWorldVector(tangent);
  const isBetweenDocumentedRows = localT > 0.05 && localT < 0.95;
  const sourceRollDeg = lerpNumber(segment.current.rollDeg, segment.next.rollDeg, visualT);
  const visualRollDeg = terminalVisualRollAt(clamped, sourceRollDeg);

  return {
    t: clamped,
    position: [position.x, position.y, position.z],
    tangent: [tangent.x, tangent.y, tangent.z],
    confidence: confidenceForSegment(segment.current, segment.next, localT),
    sourceRef: localT < 0.5 ? segment.current.sourceRef : segment.next.sourceRef,
    interpolation: isBetweenDocumentedRows ? "inferred" : "documented",
    altitudeFeet: lerpNumber(segment.current.altitudeFeet, segment.next.altitudeFeet, localT),
    altitudeSource: localT < 0.5 ? segment.current.altitudeSource : segment.next.altitudeSource,
    yawDeg: lerpAngleDegrees(segment.current.headingDeg, segment.next.headingDeg, visualT),
    headingDeg: lerpAngleDegrees(segment.current.headingDeg, segment.next.headingDeg, visualT),
    trackDeg: lerpAngleDegrees(segment.current.trackDeg, segment.next.trackDeg, visualT),
    pathBearingDeg,
    pitchDeg: lerpNumber(segment.current.pitchDeg, segment.next.pitchDeg, visualT),
    rollDeg: sourceRollDeg,
    visualRollDeg,
    groundSpeedKt: lerpNumber(segment.current.groundSpeedKt, segment.next.groundSpeedKt, localT),
    computedAirspeedKt: lerpNumber(segment.current.computedAirspeedKt, segment.next.computedAirspeedKt, localT),
    trueAirspeedKt: lerpNumber(segment.current.trueAirspeedKt, segment.next.trueAirspeedKt, localT),
    mach: lerpNumber(segment.current.mach, segment.next.mach, localT),
    verticalAccelG: lerpNumber(segment.current.verticalAccelG, segment.next.verticalAccelG, localT),
    lateralAccelG: lerpNumber(segment.current.lateralAccelG, segment.next.lateralAccelG, localT),
    longitudinalAccelG: lerpNumber(segment.current.longitudinalAccelG, segment.next.longitudinalAccelG, localT),
    leftAileronDeg: lerpNumber(segment.current.leftAileronDeg, segment.next.leftAileronDeg, localT),
    rightAileronDeg: lerpNumber(segment.current.rightAileronDeg, segment.next.rightAileronDeg, localT),
    rudderDeg: lerpNumber(segment.current.rudderDeg, segment.next.rudderDeg, localT),
    rudderPedalDeg: lerpNumber(segment.current.rudderPedalDeg, segment.next.rudderPedalDeg, localT),
    flapHandleDeg: lerpNumber(segment.current.flapHandleDeg, segment.next.flapHandleDeg, localT),
    speedRateKtPerSec: speedRateForSegment(segment.index, localT),
    overspeed: localT < 0.5 ? segment.current.overspeed : segment.next.overspeed,
    nav: localT < 0.5 ? segment.current.nav : segment.next.nav,
    verticalSpeedFpm: verticalSpeedForSegment(segment.index, localT),
    interpolationMode
  };
}

export function sampleTrajectory(steps = 160, interpolationMode: ReplayInterpolationMode = "linear") {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = (index / steps) * replayDuration;
    const state = getReplayState(t, { interpolationMode });
    return new THREE.Vector3(...state.position);
  });
}

function vectorFromReplayPoint(point: ReplayPoint) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function terminalVelocityFromLastRows(last: ReplayPoint, previous: ReplayPoint) {
  const elapsed = Math.max(last.t - previous.t, 0.001);
  const velocity = vectorFromReplayPoint(last).sub(vectorFromReplayPoint(previous)).divideScalar(elapsed);
  const recordedSpeedMetersPerSecond = knotsToMetersPerSecond(last.groundSpeedKt ?? last.computedAirspeedKt ?? null);

  if (velocity.lengthSq() < 0.000001) {
    const heading = Number.isFinite(last.headingDeg) ? (last.headingDeg as number) : 61;
    const pitch = Number.isFinite(last.pitchDeg) ? (last.pitchDeg as number) : 0;
    return velocityFromHeadingPitch(heading, pitch, recordedSpeedMetersPerSecond ?? 230);
  }

  if (recordedSpeedMetersPerSecond) {
    velocity.setLength(recordedSpeedMetersPerSecond);
  }

  return velocity;
}

function terminalEndVelocityFromImpactReference() {
  const fallbackVelocity = terminalStartVelocity.clone();
  const direction = evidenceImpactReference.clone().sub(terminalStartReference);
  const speed =
    knotsToMetersPerSecond(terminalLastPoint.groundSpeedKt ?? terminalLastPoint.computedAirspeedKt ?? null) ??
    Math.max(fallbackVelocity.length(), 1);

  if (direction.lengthSq() < 0.000001) {
    return fallbackVelocity.lengthSq() < 0.000001 ? new THREE.Vector3(speed, 0, 0) : fallbackVelocity.setLength(speed);
  }

  return direction.normalize().multiplyScalar(speed);
}

function velocityFromHeadingPitch(headingDeg: number, pitchDeg: number, speedMetersPerSecond: number) {
  const heading = (headingDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(heading) * Math.cos(pitch)
  ).multiplyScalar(speedMetersPerSecond);
}

function knotsToMetersPerSecond(value: number | null | undefined) {
  return Number.isFinite(value) ? (value as number) * 0.514444 : null;
}

function hermitePosition(
  t: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startTangent: THREE.Vector3,
  endTangent: THREE.Vector3
) {
  const t2 = t * t;
  const t3 = t2 * t;
  return start
    .clone()
    .multiplyScalar(2 * t3 - 3 * t2 + 1)
    .add(startTangent.clone().multiplyScalar(t3 - 2 * t2 + t))
    .add(end.clone().multiplyScalar(-2 * t3 + 3 * t2))
    .add(endTangent.clone().multiplyScalar(t3 - t2));
}

function hermiteTangent(
  t: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startTangent: THREE.Vector3,
  endTangent: THREE.Vector3
) {
  const t2 = t * t;
  return start
    .clone()
    .multiplyScalar(6 * t2 - 6 * t)
    .add(startTangent.clone().multiplyScalar(3 * t2 - 4 * t + 1))
    .add(end.clone().multiplyScalar(-6 * t2 + 6 * t))
    .add(endTangent.clone().multiplyScalar(3 * t2 - 2 * t));
}

function findSegment(t: number): { current: ReplayPoint; next: ReplayPoint; index: number } {
  for (let index = 0; index < trajectoryPoints.length - 1; index += 1) {
    const current = trajectoryPoints[index];
    const next = trajectoryPoints[index + 1];

    if (t >= current.t && t <= next.t) {
      return { current, next, index };
    }
  }

  const last = trajectoryPoints[trajectoryPoints.length - 1];
  return { current: last, next: last, index: trajectoryPoints.length - 1 };
}

function getTerminalImpactState(t: number, interpolationMode: ReplayInterpolationMode): ReplayState {
  const lastIndex = trajectoryPoints.length - 1;
  const last = trajectoryPoints[lastIndex];
  const previous = trajectoryPoints[Math.max(0, lastIndex - 1)];
  const elapsed = Math.max(0, Math.min(t - fdrReplayDuration, terminalImpactSeconds));
  const localT = THREE.MathUtils.clamp(elapsed / terminalImpactSeconds, 0, 1);
  const start = terminalStartReference;
  const position = hermitePosition(
    localT,
    start,
    evidenceImpactReference,
    terminalStartVelocity.clone().multiplyScalar(terminalImpactSeconds),
    terminalEndVelocity.clone().multiplyScalar(terminalImpactSeconds)
  );
  position.y = Math.max(0, position.y);

  const tangent = hermiteTangent(
    localT,
    start,
    evidenceImpactReference,
    terminalStartVelocity.clone().multiplyScalar(terminalImpactSeconds),
    terminalEndVelocity.clone().multiplyScalar(terminalImpactSeconds)
  );
  if (tangent.lengthSq() < 0.000001) {
    tangent.set(last.x - previous.x, last.y - previous.y, last.z - previous.z);
  }
  if (tangent.lengthSq() < 0.000001) {
    tangent.set(1, 0, 0);
  } else {
    tangent.normalize();
  }
  const altitudeFeet = Number.isFinite(last.altitudeFeet)
    ? Math.max(0, (last.altitudeFeet as number) + (position.y - last.y) * 3.28084)
    : last.altitudeFeet;
  const terminalRollDeg = terminalVisualRollAt(t, last.rollDeg);

  return {
    t,
    position: [position.x, position.y, position.z],
    tangent: [tangent.x, tangent.y, tangent.z],
    confidence: "low",
    sourceRef:
      "ASCE/evidence-aligned impact visualization after final decoded FDR row; tangent-preserving Hermite continuation with visual-only +20 deg right-bank terminal attitude, not a decoded FDR row",
    interpolation: "inferred",
    altitudeFeet,
    altitudeSource: last.altitudeSource,
    yawDeg: last.headingDeg,
    headingDeg: last.headingDeg,
    trackDeg: last.trackDeg,
    pathBearingDeg: headingFromWorldVector(tangent),
    pitchDeg: last.pitchDeg,
    rollDeg: terminalRollDeg,
    visualRollDeg: terminalRollDeg,
    groundSpeedKt: last.groundSpeedKt,
    computedAirspeedKt: last.computedAirspeedKt,
    trueAirspeedKt: last.trueAirspeedKt,
    mach: last.mach,
    verticalAccelG: last.verticalAccelG,
    lateralAccelG: last.lateralAccelG,
    longitudinalAccelG: last.longitudinalAccelG,
    leftAileronDeg: last.leftAileronDeg,
    rightAileronDeg: last.rightAileronDeg,
    rudderDeg: last.rudderDeg,
    rudderPedalDeg: last.rudderPedalDeg,
    flapHandleDeg: last.flapHandleDeg,
    speedRateKtPerSec: speedRateForSegment(lastIndex, 1),
    overspeed: last.overspeed,
    nav: last.nav,
    verticalSpeedFpm: verticalSpeedForSegment(lastIndex, 1),
    interpolationMode
  };
}

function terminalVisualRollAt(t: number, sourceRollDeg: number | null | undefined) {
  const startTime = fdrReplayDuration - terminalVisualRollLeadSeconds;
  if (t <= startTime) {
    return sourceRollDeg;
  }

  const progress = THREE.MathUtils.clamp((t - startTime) / (terminalVisualRollLeadSeconds + terminalImpactSeconds), 0, 1);
  return lerpNumber(sourceRollDeg, terminalVisualRightRollDeg, smoothstep(progress));
}

function confidenceForSegment(a: ReplayPoint, b: ReplayPoint, localT: number): Confidence {
  if (a.confidence === b.confidence) {
    return a.confidence;
  }

  return localT < 0.5 ? a.confidence : b.confidence;
}

function canSmoothSegment(index: number) {
  const current = trajectoryPoints[index];
  const next = trajectoryPoints[index + 1];
  if (!current || !next) {
    return false;
  }

  return true;
}

function catmullRomSegment(index: number, t: number, visual = false) {
  const p0 = vectorForPoint(Math.max(0, index - 1), visual);
  const p1 = vectorForPoint(index, visual);
  const p2 = vectorForPoint(Math.min(trajectoryPoints.length - 1, index + 1), visual);
  const p3 = vectorForPoint(Math.min(trajectoryPoints.length - 1, index + 2), visual);
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
  position.y = Math.max(0, position.y);

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

function vectorForPoint(index: number, visual = false) {
  const point = trajectoryPoints[index];
  if (visual) {
    return visualPositionByPoint[index].clone();
  }

  return new THREE.Vector3(point.x, point.y, point.z);
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function lerpNumber(a: number | null | undefined, b: number | null | undefined, t: number) {
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return (a as number) + ((b as number) - (a as number)) * t;
  }

  if (Number.isFinite(a)) {
    return a;
  }

  return Number.isFinite(b) ? b : null;
}

function lerpAngleDegrees(a: number | null | undefined, b: number | null | undefined, t: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return lerpNumber(a, b, t);
  }

  const start = a as number;
  const delta = ((((b as number) - start + 540) % 360) - 180) * t;
  return (start + delta + 360) % 360;
}

function verticalSpeedForSegment(index: number, localT: number) {
  const current = verticalSpeedByPoint[index];
  const next = verticalSpeedByPoint[Math.min(index + 1, verticalSpeedByPoint.length - 1)];
  return lerpNumber(current, next, localT);
}

function speedRateForSegment(index: number, localT: number) {
  const current = speedRateByPoint[index];
  const next = speedRateByPoint[Math.min(index + 1, speedRateByPoint.length - 1)];
  return lerpNumber(current, next, localT);
}

function verticalSpeedRegressionAtIndex(index: number) {
  const center = trajectoryPoints[index];
  if (!center || !Number.isFinite(center.t) || !Number.isFinite(center.altitudeFeet)) {
    return null;
  }

  const halfWindow = verticalSpeedWindowSeconds / 2;
  const samples = altitudeSamplesAround(center.t, halfWindow, center.altitudeSource);
  if (samples.length < 2) {
    return null;
  }

  const meanTime = samples.reduce((sum, sample) => sum + sample.t, 0) / samples.length;
  const meanAltitude = samples.reduce((sum, sample) => sum + sample.altitudeFeet, 0) / samples.length;
  const covariance = samples.reduce(
    (sum, sample) => sum + (sample.t - meanTime) * (sample.altitudeFeet - meanAltitude),
    0
  );
  const variance = samples.reduce((sum, sample) => sum + (sample.t - meanTime) ** 2, 0);
  if (variance <= 0) {
    return null;
  }

  return covariance / variance * 60;
}

function speedRateRegressionAtIndex(index: number) {
  const center = trajectoryPoints[index];
  if (!center || !Number.isFinite(center.t) || !Number.isFinite(center.groundSpeedKt)) {
    return null;
  }

  const halfWindow = speedRateWindowSeconds / 2;
  const samples = trajectoryPoints
    .filter(
      (point) =>
        point.t >= center.t - halfWindow &&
        point.t <= center.t + halfWindow &&
        Number.isFinite(point.groundSpeedKt)
    )
    .map((point) => ({ t: point.t, speed: point.groundSpeedKt as number }));

  if (samples.length < 2) {
    return null;
  }

  const meanTime = samples.reduce((sum, sample) => sum + sample.t, 0) / samples.length;
  const meanSpeed = samples.reduce((sum, sample) => sum + sample.speed, 0) / samples.length;
  const covariance = samples.reduce((sum, sample) => sum + (sample.t - meanTime) * (sample.speed - meanSpeed), 0);
  const variance = samples.reduce((sum, sample) => sum + (sample.t - meanTime) ** 2, 0);
  if (variance <= 0) {
    return null;
  }

  return covariance / variance;
}

function visualPositionRegressionAtIndex(index: number) {
  const center = trajectoryPoints[index];
  if (!center || !Number.isFinite(center.t)) {
    return new THREE.Vector3(0, 0, 0);
  }

  const raw = new THREE.Vector3(center.x, center.y, center.z);

  const halfWindow = positionSmoothingHalfWindowSeconds;
  const samples = trajectoryPoints.filter(
    (point) =>
      point.t >= center.t - halfWindow &&
      point.t <= center.t + halfWindow &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z)
  );

  if (samples.length < 5) {
    return raw;
  }

  const fitted = new THREE.Vector3(
    regressionValueAt(samples, "x", center.t),
    Math.max(0, regressionValueAt(samples, "y", center.t)),
    regressionValueAt(samples, "z", center.t)
  );
  const startWeight = THREE.MathUtils.clamp(center.t / 12, 0, 1);
  const secondsFromLastFdrRow = fdrReplayDuration - center.t;
  const endWeight = THREE.MathUtils.clamp((secondsFromLastFdrRow - 20) / 30, 0, 1);
  const weight = startWeight * endWeight;

  return raw.lerp(fitted, weight);
}

function regressionValueAt(samples: ReplayPoint[], axis: "x" | "y" | "z", t: number) {
  const meanTime = samples.reduce((sum, sample) => sum + sample.t, 0) / samples.length;
  const meanValue = samples.reduce((sum, sample) => sum + sample[axis], 0) / samples.length;
  const covariance = samples.reduce((sum, sample) => sum + (sample.t - meanTime) * (sample[axis] - meanValue), 0);
  const variance = samples.reduce((sum, sample) => sum + (sample.t - meanTime) ** 2, 0);
  if (variance <= 0) {
    return meanValue;
  }

  const slope = covariance / variance;
  return meanValue + slope * (t - meanTime);
}

function altitudeSamplesAround(t: number, halfWindow: number, altitudeSource?: string) {
  const start = t - halfWindow;
  const end = t + halfWindow;
  const nonTerminalSamples = trajectoryPoints
    .filter(
      (point) =>
        point.t >= start &&
        point.t <= end &&
        Number.isFinite(point.altitudeFeet)
    )
    .map((point) => ({ t: point.t, altitudeFeet: point.altitudeFeet as number, altitudeSource: point.altitudeSource }));

  const sameSourceSamples = nonTerminalSamples.filter((sample) => sample.altitudeSource === altitudeSource);
  return sameSourceSamples.length >= 5 ? sameSourceSamples : nonTerminalSamples;
}

function headingFromWorldVector(vector: THREE.Vector3) {
  return ((Math.atan2(vector.x, -vector.z) * 180) / Math.PI + 360) % 360;
}
