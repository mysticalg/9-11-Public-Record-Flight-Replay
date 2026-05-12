import type { AlertSeverity, ReplayState } from "../types";

export interface FlightEnvelopeWarning {
  key: string;
  label: string;
  value: string;
  severity: Exclude<AlertSeverity, "normal">;
  detail: string;
}

export const envelopeThresholds = {
  verticalSpeedWarningFpm: 3000,
  verticalSpeedCriticalFpm: 5000,
  rollWarningDeg: 30,
  rollCriticalDeg: 45,
  pitchWarningDeg: 15,
  pitchCriticalDeg: 22,
  computedAirspeedWarningKt: 330,
  computedAirspeedCriticalKt: 350,
  machWarning: 0.84,
  machCritical: 0.86,
  verticalAccelLowWarningG: 0.5,
  verticalAccelHighWarningG: 1.5,
  verticalAccelLowCriticalG: 0.35,
  verticalAccelHighCriticalG: 1.65,
  lateralAccelWarningG: 0.08,
  lateralAccelCriticalG: 0.12,
  longitudinalAccelWarningG: 0.25,
  longitudinalAccelCriticalG: 0.35,
  speedRateWarningKtPerSec: 3.5,
  speedRateCriticalKtPerSec: 5
};

export function evaluateFlightEnvelope(state: ReplayState): FlightEnvelopeWarning[] {
  const warnings: FlightEnvelopeWarning[] = [];
  const airborneOrMovingFast = (state.groundSpeedKt ?? 0) > 120 || (state.altitudeFeet ?? 0) > 400;

  addAbsWarning(
    warnings,
    "verticalSpeed",
    "Vertical speed",
    state.verticalSpeedFpm,
    "fpm",
    envelopeThresholds.verticalSpeedWarningFpm,
    envelopeThresholds.verticalSpeedCriticalFpm,
    "Comfort/monitoring threshold exceeded"
  );
  addAbsWarning(
    warnings,
    "roll",
    "Roll",
    state.rollDeg,
    "deg",
    envelopeThresholds.rollWarningDeg,
    envelopeThresholds.rollCriticalDeg,
    "Large bank angle"
  );
  addAbsWarning(
    warnings,
    "pitch",
    "Pitch",
    state.pitchDeg,
    "deg",
    envelopeThresholds.pitchWarningDeg,
    envelopeThresholds.pitchCriticalDeg,
    "Large pitch attitude"
  );
  addAbsWarning(
    warnings,
    "speedRate",
    "Speed rate",
    state.speedRateKtPerSec,
    "kt/s",
    envelopeThresholds.speedRateWarningKtPerSec,
    envelopeThresholds.speedRateCriticalKtPerSec,
    "Rapid groundspeed change"
  );
  addRangeWarning(
    warnings,
    "verticalAccel",
    "Vertical G",
    state.verticalAccelG,
    "g",
    envelopeThresholds.verticalAccelLowWarningG,
    envelopeThresholds.verticalAccelHighWarningG,
    envelopeThresholds.verticalAccelLowCriticalG,
    envelopeThresholds.verticalAccelHighCriticalG,
    "Vertical acceleration outside typical passenger comfort band"
  );
  addAbsWarning(
    warnings,
    "lateralAccel",
    "Lateral G",
    state.lateralAccelG,
    "g",
    envelopeThresholds.lateralAccelWarningG,
    envelopeThresholds.lateralAccelCriticalG,
    "Lateral acceleration outside normal comfort band"
  );
  addAbsWarning(
    warnings,
    "longitudinalAccel",
    "Longitudinal G",
    state.longitudinalAccelG,
    "g",
    envelopeThresholds.longitudinalAccelWarningG,
    envelopeThresholds.longitudinalAccelCriticalG,
    "Longitudinal acceleration outside normal comfort band"
  );

  if (state.overspeed === "OVERSPEED") {
    warnings.push({
      key: "overspeed",
      label: "Overspeed",
      value: "FDR flag",
      severity: "critical",
      detail: "Decoded FDR overspeed discrete is active"
    });
  }

  if (airborneOrMovingFast) {
    addHighWarning(
      warnings,
      "computedAirspeed",
      "Computed airspeed",
      state.computedAirspeedKt,
      "kt",
      envelopeThresholds.computedAirspeedWarningKt,
      envelopeThresholds.computedAirspeedCriticalKt,
      "Above the app's 757 reference speed threshold"
    );
    addHighWarning(
      warnings,
      "mach",
      "Mach",
      state.mach,
      "",
      envelopeThresholds.machWarning,
      envelopeThresholds.machCritical,
      "Near or above the app's MMO reference threshold"
    );
  }

  return warnings;
}

export function highestSeverityForKeys(warnings: FlightEnvelopeWarning[], keys: string[]) {
  if (warnings.some((warning) => keys.includes(warning.key) && warning.severity === "critical")) {
    return "critical";
  }

  if (warnings.some((warning) => keys.includes(warning.key))) {
    return "warning";
  }

  return "normal";
}

function addAbsWarning(
  warnings: FlightEnvelopeWarning[],
  key: string,
  label: string,
  value: number | null | undefined,
  unit: string,
  warningLimit: number,
  criticalLimit: number,
  detail: string
) {
  if (!Number.isFinite(value)) {
    return;
  }

  const absolute = Math.abs(value as number);
  if (absolute > criticalLimit) {
    warnings.push({ key, label, value: formatValue(value as number, unit), severity: "critical", detail });
  } else if (absolute > warningLimit) {
    warnings.push({ key, label, value: formatValue(value as number, unit), severity: "warning", detail });
  }
}

function addHighWarning(
  warnings: FlightEnvelopeWarning[],
  key: string,
  label: string,
  value: number | null | undefined,
  unit: string,
  warningLimit: number,
  criticalLimit: number,
  detail: string
) {
  if (!Number.isFinite(value)) {
    return;
  }

  if ((value as number) > criticalLimit) {
    warnings.push({ key, label, value: formatValue(value as number, unit), severity: "critical", detail });
  } else if ((value as number) > warningLimit) {
    warnings.push({ key, label, value: formatValue(value as number, unit), severity: "warning", detail });
  }
}

function addRangeWarning(
  warnings: FlightEnvelopeWarning[],
  key: string,
  label: string,
  value: number | null | undefined,
  unit: string,
  warningLow: number,
  warningHigh: number,
  criticalLow: number,
  criticalHigh: number,
  detail: string
) {
  if (!Number.isFinite(value)) {
    return;
  }

  const numeric = value as number;
  if (numeric < criticalLow || numeric > criticalHigh) {
    warnings.push({ key, label, value: formatValue(numeric, unit), severity: "critical", detail });
  } else if (numeric < warningLow || numeric > warningHigh) {
    warnings.push({ key, label, value: formatValue(numeric, unit), severity: "warning", detail });
  }
}

function formatValue(value: number, unit: string) {
  const decimals = Math.abs(value) < 10 && !Number.isInteger(value) ? 2 : 0;
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}
