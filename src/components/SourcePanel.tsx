import { BookOpen, MapPin } from "lucide-react";
import { airportTimelineNotice, navSystemsNotice } from "../data/trajectoryLocked";
import { physicalEvidenceNotice, physicalEvidenceSources } from "../data/physicalEvidence";
import { evaluateFlightEnvelope } from "../engine/flightEnvelope";
import { formatHistoricalClock } from "../engine/clock";
import { aircraftReferenceDimensionsForFlight } from "../engine/siteGeometry";
import type { EventMarker, FdrNavSnapshot, FlightId, ReplayState, SourceRecord } from "../types";

interface SourcePanelProps {
  replayState: ReplayState;
  activeFlightId: FlightId;
  activeMarker: EventMarker;
  sources: SourceRecord[];
  trajectoryNotice: string;
}

export function SourcePanel({ replayState, activeFlightId, activeMarker, sources, trajectoryNotice }: SourcePanelProps) {
  const warnings = evaluateFlightEnvelope(replayState);
  const aircraftDimensions = aircraftReferenceDimensionsForFlight(activeFlightId);
  const sourcePrefix = activeFlightId === "aa77" ? "FDR" : activeFlightId === "ua93" ? "Black-box" : "Radar/NIST";

  return (
    <section className="panel source-panel" aria-label="Sources and current replay state">
      <div className="panel-heading">
        <BookOpen size={18} aria-hidden="true" />
        <h2>Sources</h2>
      </div>

      <div className="state-card">
        <div className="state-card-header">
          <MapPin size={16} aria-hidden="true" />
          <span>{formatHistoricalClock(replayState.t)}</span>
        </div>
        <h3>{activeMarker.title}</h3>
        <p>{activeMarker.description}</p>
        <dl className="state-grid">
          <div>
            <dt>Event source</dt>
            <dd>{activeMarker.source}</dd>
          </div>
          <div>
            <dt>Current point</dt>
            <dd>{replayState.sourceRef}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd className={`confidence confidence-${replayState.confidence}`}>{replayState.confidence}</dd>
          </div>
          <div>
            <dt>Visual status</dt>
            <dd>
              {replayState.interpolationMode === "smooth" && replayState.interpolation === "inferred"
                ? "smoothed inferred"
                : replayState.interpolation}
            </dd>
          </div>
          <div>
            <dt>{sourcePrefix} altitude</dt>
            <dd>
              {formatNumber(replayState.altitudeFeet, "ft")}{" "}
              <span className="source-inline">{formatAltitudeSource(replayState.altitudeSource)}</span>
            </dd>
          </div>
          <div>
            <dt>{sourcePrefix} yaw / heading</dt>
            <dd>{formatNumber(replayState.yawDeg ?? replayState.headingDeg, "deg")}</dd>
          </div>
          <div>
            <dt>{sourcePrefix} track</dt>
            <dd>{formatNumber(replayState.trackDeg, "deg")}</dd>
          </div>
          <div>
            <dt>Visual path bearing</dt>
            <dd>{formatNumber(replayState.pathBearingDeg, "deg")}</dd>
          </div>
          <div>
            <dt>Attitude</dt>
            <dd>
              Pitch {formatNumber(replayState.pitchDeg, "deg")} / Roll{" "}
              {formatNumber(replayState.visualRollDeg ?? replayState.rollDeg, "deg")}
              {Number.isFinite(replayState.visualRollDeg) && replayState.visualRollDeg !== replayState.rollDeg
                ? " visual"
                : ""}
            </dd>
          </div>
          <div>
            <dt>{sourcePrefix} speed</dt>
            <dd>
              CAS {formatNumber(replayState.computedAirspeedKt, "kt")} / GS{" "}
              {formatNumber(replayState.groundSpeedKt, "kt")}
            </dd>
          </div>
          <div>
            <dt>Mach / overspeed</dt>
            <dd className={warningClass(warnings, ["mach", "computedAirspeed", "overspeed"])}>
              {formatMach(replayState.mach)} / {replayState.overspeed ?? "not available"}
            </dd>
          </div>
          <div>
            <dt>Smoothed derived VS</dt>
            <dd className={warningClass(warnings, ["verticalSpeed"])}>
              {formatSignedNumber(replayState.verticalSpeedFpm, "fpm")}
            </dd>
          </div>
          <div>
            <dt>{sourcePrefix} accelerations</dt>
            <dd className={warningClass(warnings, ["verticalAccel", "lateralAccel", "longitudinalAccel"])}>
              V {formatNumber(replayState.verticalAccelG, "g")} / Lat {formatSignedNumber(replayState.lateralAccelG, "g", 3)} /
              Long {formatSignedNumber(replayState.longitudinalAccelG, "g", 3)}
            </dd>
          </div>
          <div>
            <dt>Control surfaces</dt>
            <dd>
              Ail L {formatSignedNumber(replayState.leftAileronDeg, "deg")} / R{" "}
              {formatSignedNumber(replayState.rightAileronDeg, "deg")} / Rud{" "}
              {formatSignedNumber(replayState.rudderDeg, "deg")}
            </dd>
          </div>
          <div>
            <dt>Autopilot / modes</dt>
            <dd>{formatAutopilot(replayState)}</dd>
          </div>
          <div>
            <dt>VOR / DME</dt>
            <dd>{formatRadioNav(replayState)}</dd>
          </div>
        </dl>
      </div>

      <div className="notice-box">{trajectoryNotice}</div>
      <div className="notice-box">{airportTimelineNotice}</div>
      <div className="notice-box">{navSystemsNotice}</div>
      {warnings.length > 0 ? (
        <div className="notice-box notice-box-alert">
          Current telemetry alert:{" "}
          {warnings.map((warning) => `${warning.label} ${warning.value} (${warning.severity})`).join("; ")}
        </div>
      ) : null}
      <div className="notice-box">
        Aircraft model scale: {activeFlightId === "aa11" || activeFlightId === "ua175" ? "Boeing 767-200" : "Boeing 757-200"},{" "}
        {aircraftDimensions.lengthMeters.toFixed(1)} m length, {aircraftDimensions.wingspanMeters.toFixed(1)} m wingspan,{" "}
        {aircraftDimensions.tailHeightMeters.toFixed(1)} m tail height.
      </div>
      <div className="notice-box">{physicalEvidenceNotice}</div>
      <div className="notice-box notice-box-alert">
        Security camera positions and FOV are best-fit visual estimates from released footage, not surveyed public
        coordinates. Evidence markers are documentary alignment cues unless the label explicitly states a measured
        coordinate.
      </div>

      <div className="source-list">
        {physicalEvidenceSources.map((source) => (
          <article key={source.label} className="source-item">
            <div>
              <h3>{source.label}</h3>
              <p>{source.reference}</p>
            </div>
            <span className="source-role source-role-documented">documented</span>
          </article>
        ))}
        {sources.map((source) => (
          <article key={source.id} className="source-item">
            <div>
              <h3>{source.title}</h3>
              <p>{source.reference}</p>
            </div>
            <span className={`source-role source-role-${source.role}`}>{source.role.replace("_", " ")}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatNumber(value: number | null | undefined, unit: string) {
  if (!Number.isFinite(value)) {
    return "not available";
  }

  return `${(value as number).toFixed(1)} ${unit}`;
}

function formatSignedNumber(value: number | null | undefined, unit: string, decimals = 0) {
  if (!Number.isFinite(value)) {
    return "not available";
  }

  const number = value as number;
  const formatted = decimals > 0 ? number.toFixed(decimals) : Math.round(number).toLocaleString();
  return `${number > 0 ? "+" : ""}${formatted} ${unit}`;
}

function formatMach(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "not available";
  }

  return `M ${(value as number).toFixed(2)}`;
}

function warningClass(warnings: ReturnType<typeof evaluateFlightEnvelope>, keys: string[]) {
  if (warnings.some((warning) => keys.includes(warning.key) && warning.severity === "critical")) {
    return "telemetry-value-critical";
  }

  if (warnings.some((warning) => keys.includes(warning.key))) {
    return "telemetry-value-warning";
  }

  return undefined;
}

function formatAutopilot(replayState: ReplayState) {
  const nav = replayState.nav;
  if (!nav) {
    return "not available";
  }

  const command = activeChannels(nav.autopilot?.command);
  const cws = activeChannels(nav.autopilot?.cws);
  const vnav = activeModes([nav.modes?.vnavLeft, nav.modes?.vnavCenter, nav.modes?.vnavRight], "VNAV ENG");
  const at = nav.autothrottle?.engagedHud ?? "not available";

  return `CMD ${command || "off"} / CWS ${cws || "off"} / VNAV ${vnav || "off"} / A/T ${at}`;
}

function formatRadioNav(replayState: ReplayState) {
  const radio = replayState.nav?.radioNav;
  if (!radio) {
    return "not available";
  }

  return `VOR L ${formatFixed(radio.vorLeftMhz, 2)} / R ${formatFixed(radio.vorRightMhz, 2)} MHz; DME L ${formatFixed(
    radio.dmeLeftNm,
    2
  )} / R ${formatFixed(radio.dmeRightNm, 2)} NM`;
}

function activeChannels(channels: NonNullable<NonNullable<FdrNavSnapshot["autopilot"]>["command"]> | undefined) {
  if (!channels) {
    return "";
  }

  return ([
    ["L", channels.left],
    ["C", channels.center],
    ["R", channels.right]
  ] as const)
    .filter(([, value]) => value !== null && value !== undefined && !String(value).includes("NOT"))
    .map(([label]) => label)
    .join("/");
}

function activeModes(values: Array<string | null | undefined>, activeValue: string) {
  const labels = ["L", "C", "R"];
  return values
    .map((value, index) => (value === activeValue ? labels[index] : null))
    .filter(Boolean)
    .join("/");
}

function formatFixed(value: number | null | undefined, decimals: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return (value as number).toFixed(decimals);
}

function formatAltitudeSource(source: string | undefined) {
  if (source === "fdr_radio_height") {
    return "radio height";
  }

  if (source === "fdr_pressure_altitude_adjusted" || source === "fdr_pressure_altitude_1013mb_adjusted") {
    return "1013.25mb pressure alt adjusted";
  }

  return "";
}
