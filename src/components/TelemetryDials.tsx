import type { CSSProperties } from "react";
import { evaluateFlightEnvelope, highestSeverityForKeys } from "../engine/flightEnvelope";
import type { AlertSeverity } from "../types";
import type { ReplayState } from "../types";

interface TelemetryDialsProps {
  replayState: ReplayState;
  visible: boolean;
}

interface DialProps {
  label: string;
  value: string;
  angle: number;
  tone?: Exclude<AlertSeverity, "normal"> | "standard" | "accent";
}

export function TelemetryDials({ replayState, visible }: TelemetryDialsProps) {
  if (!visible) {
    return null;
  }

  const altitude = replayState.altitudeFeet;
  const heading = replayState.yawDeg ?? replayState.headingDeg;
  const pathBearing = replayState.pathBearingDeg ?? replayState.trackDeg;
  const pitch = replayState.pitchDeg;
  const roll = replayState.visualRollDeg ?? replayState.rollDeg;
  const speed = replayState.groundSpeedKt;
  const computedAirspeed = replayState.computedAirspeedKt;
  const verticalSpeed = replayState.verticalSpeedFpm;
  const warnings = evaluateFlightEnvelope(replayState);

  return (
    <div className="chase-telemetry" aria-label="Chase mode telemetry">
      <TelemetryDial
        label="ALT"
        value={formatNumber(altitude, "ft")}
        angle={scaleAngle(altitude, 0, 7000, -130, 130)}
      />
      <TelemetryDial
        label="HDG/TRK"
        value={formatHeadingPair(heading, pathBearing)}
        angle={Number.isFinite(pathBearing) ? (pathBearing as number) : Number.isFinite(heading) ? (heading as number) : 0}
      />
      <TelemetryDial
        label="PITCH"
        value={formatSigned(pitch, "deg")}
        angle={scaleAngle(pitch, -20, 20, -82, 82)}
        tone={dialTone(highestSeverityForKeys(warnings, ["pitch"]))}
      />
      <TelemetryDial
        label="ROLL"
        value={formatSigned(roll, "deg")}
        angle={scaleAngle(roll, -45, 45, -92, 92)}
        tone={dialTone(highestSeverityForKeys(warnings, ["roll"]))}
      />
      <TelemetryDial
        label="VS"
        value={formatSigned(verticalSpeed, "fpm", 0)}
        angle={scaleAngle(verticalSpeed, -5000, 5000, -110, 110)}
        tone={dialTone(highestSeverityForKeys(warnings, ["verticalSpeed"]))}
      />
      <TelemetryDial
        label="CAS/GS"
        value={formatSpeedPair(computedAirspeed, speed)}
        angle={scaleAngle(computedAirspeed ?? speed, 0, 520, -128, 128)}
        tone={dialTone(highestSeverityForKeys(warnings, ["computedAirspeed", "mach", "overspeed"]))}
      />
    </div>
  );
}

function TelemetryDial({ label, value, angle, tone = "standard" }: DialProps) {
  return (
    <div className={`telemetry-dial telemetry-dial-${tone}`}>
      <div className="dial-face" style={{ "--dial-angle": `${angle}deg` } as CSSProperties}>
        <div className="dial-tick dial-tick-left" />
        <div className="dial-tick dial-tick-right" />
        <div className="dial-needle" />
        <div className="dial-hub" />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatNumber(value: number | null | undefined, unit: string) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value as number).toLocaleString()} ${unit}`;
}

function formatSigned(value: number | null | undefined, unit: string, decimals = 1) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const number = value as number;
  const formatted = decimals === 0 ? Math.round(number).toLocaleString() : number.toFixed(decimals);
  return `${number > 0 ? "+" : ""}${formatted} ${unit}`;
}

function formatHeading(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value as number).toString().padStart(3, "0")} deg`;
}

function formatHeadingPair(heading: number | null | undefined, pathBearing: number | null | undefined) {
  if (!Number.isFinite(heading) && !Number.isFinite(pathBearing)) {
    return "--";
  }

  if (!Number.isFinite(pathBearing)) {
    return formatHeading(heading);
  }

  if (!Number.isFinite(heading)) {
    return `${formatHeadingValue(pathBearing)} trk`;
  }

  return `${formatHeadingValue(heading)}/${formatHeadingValue(pathBearing)} deg`;
}

function formatSpeedPair(computedAirspeed: number | null | undefined, groundSpeed: number | null | undefined) {
  if (!Number.isFinite(computedAirspeed) && !Number.isFinite(groundSpeed)) {
    return "--";
  }

  if (!Number.isFinite(computedAirspeed)) {
    return `${Math.round(groundSpeed as number)} gs`;
  }

  if (!Number.isFinite(groundSpeed)) {
    return `${Math.round(computedAirspeed as number)} cas`;
  }

  return `${Math.round(computedAirspeed as number)}/${Math.round(groundSpeed as number)} kt`;
}

function formatHeadingValue(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return Math.round(value as number).toString().padStart(3, "0");
}

function dialTone(severity: AlertSeverity) {
  return severity === "normal" ? "standard" : severity;
}

function scaleAngle(value: number | null | undefined, min: number, max: number, outMin: number, outMax: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const clamped = Math.min(Math.max(value as number, min), max);
  return outMin + ((clamped - min) / (max - min)) * (outMax - outMin);
}
