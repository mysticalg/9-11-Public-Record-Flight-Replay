import { useMemo, useState } from "react";
import { evaluateFlightEnvelope, highestSeverityForKeys } from "../engine/flightEnvelope";
import { formatHistoricalClock } from "../engine/clock";
import { getReplayState } from "../engine/trajectoryPlayer";
import fdrNavTimeline from "../data/fdrNavTimeline.generated.json";
import { navSystemsNotice, trajectoryPoints } from "../data/trajectoryLocked";
import type { AlertSeverity, FdrChannelSnapshot, FdrNavSnapshot, ReplayState } from "../types";

interface TelemetryPlotsProps {
  currentTime: number;
  duration: number;
}

interface PlotMetric {
  id: string;
  label: string;
  unit: string;
  keys: string[];
  value: (state: ReplayState) => number | null | undefined;
  format?: (value: number) => string;
}

type TelemetryTab = "plots" | "autopilot";

interface NavStatusItem {
  id: string;
  label: string;
  value: string;
  detail: string;
  active?: boolean | null;
}

interface NavEvent {
  id: string;
  t: number;
  label: string;
  value: string;
  detail: string;
  category: "mode" | "heading" | "verticalSpeed" | "radio";
}

interface GeneratedNavTimeline {
  mcpTargetCaveat: string;
  fields: Array<{ id: string; label: string; category: "mode" | "radio" }>;
  events: Array<{
    id: string;
    fieldId: string;
    t: number;
    label: string;
    value: string;
    detail: string;
    active: boolean | null;
    category: "mode" | "radio";
  }>;
}

const navTimeline = fdrNavTimeline as GeneratedNavTimeline;

const plotMetrics: PlotMetric[] = [
  {
    id: "altitude",
    label: "Altitude",
    unit: "ft",
    keys: [],
    value: (state) => state.altitudeFeet,
    format: (value) => `${Math.round(value).toLocaleString()} ft`
  },
  {
    id: "computedAirspeed",
    label: "Computed airspeed",
    unit: "kt",
    keys: ["computedAirspeed", "overspeed"],
    value: (state) => validComputedAirspeed(state),
    format: (value) => `${Math.round(value)} kt`
  },
  {
    id: "groundSpeed",
    label: "Groundspeed",
    unit: "kt",
    keys: [],
    value: (state) => state.groundSpeedKt,
    format: (value) => `${Math.round(value)} kt`
  },
  {
    id: "mach",
    label: "Mach",
    unit: "M",
    keys: ["mach", "overspeed"],
    value: (state) => validMach(state),
    format: (value) => value.toFixed(2)
  },
  {
    id: "verticalSpeed",
    label: "Vertical speed",
    unit: "fpm",
    keys: ["verticalSpeed"],
    value: (state) => state.verticalSpeedFpm,
    format: (value) => `${Math.round(value).toLocaleString()} fpm`
  },
  {
    id: "roll",
    label: "Roll",
    unit: "deg",
    keys: ["roll"],
    value: (state) => state.rollDeg,
    format: (value) => `${value.toFixed(1)} deg`
  },
  {
    id: "pitch",
    label: "Pitch",
    unit: "deg",
    keys: ["pitch"],
    value: (state) => state.pitchDeg,
    format: (value) => `${value.toFixed(1)} deg`
  },
  {
    id: "verticalAccel",
    label: "Vertical G",
    unit: "g",
    keys: ["verticalAccel"],
    value: (state) => state.verticalAccelG,
    format: (value) => `${value.toFixed(2)} g`
  },
  {
    id: "lateralAccel",
    label: "Lateral G",
    unit: "g",
    keys: ["lateralAccel"],
    value: (state) => state.lateralAccelG,
    format: (value) => `${value.toFixed(3)} g`
  },
  {
    id: "longitudinalAccel",
    label: "Longitudinal G",
    unit: "g",
    keys: ["longitudinalAccel"],
    value: (state) => state.longitudinalAccelG,
    format: (value) => `${value.toFixed(3)} g`
  },
  {
    id: "speedRate",
    label: "GS rate",
    unit: "kt/s",
    keys: ["speedRate"],
    value: (state) => state.speedRateKtPerSec,
    format: (value) => `${value > 0 ? "+" : ""}${value.toFixed(2)} kt/s`
  },
  {
    id: "leftAileron",
    label: "Left aileron",
    unit: "deg",
    keys: [],
    value: (state) => state.leftAileronDeg,
    format: (value) => `${value.toFixed(1)} deg`
  },
  {
    id: "rightAileron",
    label: "Right aileron",
    unit: "deg",
    keys: [],
    value: (state) => state.rightAileronDeg,
    format: (value) => `${value.toFixed(1)} deg`
  },
  {
    id: "rudder",
    label: "Rudder",
    unit: "deg",
    keys: [],
    value: (state) => state.rudderDeg,
    format: (value) => `${value.toFixed(1)} deg`
  }
];

const defaultMetricIds = ["altitude", "computedAirspeed", "groundSpeed", "verticalSpeed", "roll", "verticalAccel"];
const plotWidth = 1000;
const plotHeight = 92;
const plotPadding = 10;

export function TelemetryPlots({ currentTime, duration }: TelemetryPlotsProps) {
  const [activeTab, setActiveTab] = useState<TelemetryTab>("plots");
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>(defaultMetricIds);
  const sampledStates = useMemo(() => sampleStates(duration), [duration]);
  const currentState = useMemo(() => getReplayState(currentTime, { interpolationMode: "smooth" }), [currentTime]);
  const currentWarnings = useMemo(() => evaluateFlightEnvelope(currentState), [currentState]);
  const navEvents = useMemo(() => buildNavEvents(sampledStates), [sampledStates]);
  const currentNavItems = useMemo(() => buildCurrentNavItems(currentState, currentTime), [currentState, currentTime]);
  const targetItems = useMemo(() => buildTargetItems(currentState), [currentState]);

  const selectedMetrics = plotMetrics.filter((metric) => selectedMetricIds.includes(metric.id));

  return (
    <section className="telemetry-plot-panel" aria-label="Telemetry plots">
      <div className="telemetry-plot-header">
        <div>
          <h2>Telemetry Plots</h2>
          <span>
            {activeTab === "plots"
              ? `${formatHistoricalClock(currentTime)} current sample marker`
              : `${formatHistoricalClock(currentTime)} autopilot/nav snapshot`}
          </span>
        </div>
        <strong>{activeTab === "plots" ? `${selectedMetrics.length} active` : `${navEvents.length} changes`}</strong>
      </div>

      <div className="telemetry-tabs" role="tablist" aria-label="Telemetry plot tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "plots"}
          className={activeTab === "plots" ? "active" : ""}
          onClick={() => setActiveTab("plots")}
        >
          Flight plots
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "autopilot"}
          className={activeTab === "autopilot" ? "active" : ""}
          onClick={() => setActiveTab("autopilot")}
        >
          Autopilot / nav
        </button>
      </div>

      {activeTab === "plots" ? (
        <>
          <div className="plot-metric-toggles" aria-label="Telemetry plot metric toggles">
            {plotMetrics.map((metric) => (
              <label key={metric.id} className="plot-toggle">
                <input
                  type="checkbox"
                  checked={selectedMetricIds.includes(metric.id)}
                  onChange={() => toggleMetric(metric.id, setSelectedMetricIds)}
                />
                <span>{metric.label}</span>
              </label>
            ))}
          </div>

          <div className="plot-stack">
            {selectedMetrics.map((metric) => (
              <MetricPlot
                key={metric.id}
                metric={metric}
                sampledStates={sampledStates}
                currentTime={currentTime}
                duration={duration}
                currentState={currentState}
                severity={highestSeverityForKeys(currentWarnings, metric.keys)}
              />
            ))}
          </div>
        </>
      ) : (
        <AutopilotNavPanel currentItems={currentNavItems} targetItems={targetItems} events={navEvents} />
      )}
    </section>
  );
}

function AutopilotNavPanel({
  currentItems,
  targetItems,
  events
}: {
  currentItems: NavStatusItem[];
  targetItems: NavStatusItem[];
  events: NavEvent[];
}) {
  return (
    <div className="autopilot-nav-panel">
      <p className="nav-data-note">{navSystemsNotice}</p>

      <div className="nav-section-header">
        <h3>Current decoded states</h3>
        <span>true/false reflects decoded row values, not an inferred cockpit action</span>
      </div>
      <div className="nav-status-grid">
        {currentItems.map((item) => (
          <NavStatusCard key={item.id} item={item} />
        ))}
      </div>

      <div className="nav-section-header">
        <h3>MCP target fields</h3>
        <span>loaded CSV target availability</span>
      </div>
      <div className="nav-target-grid">
        {targetItems.map((item) => (
          <NavStatusCard key={item.id} item={item} />
        ))}
      </div>

      <div className="nav-section-header">
        <h3>Changed in flight</h3>
        <span>mode, heading, vertical-speed regime, and VOR changes</span>
      </div>
      <div className="nav-event-table-wrapper">
        <table className="nav-event-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Field</th>
              <th>Value</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className={`nav-event-${event.category}`}>
                <td>{formatHistoricalClock(event.t)}</td>
                <td>{event.label}</td>
                <td>{event.value}</td>
                <td>{event.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NavStatusCard({ item }: { item: NavStatusItem }) {
  const statusClass =
    item.active === true ? "nav-status-active" : item.active === false ? "nav-status-off" : "nav-status-unknown";

  return (
    <article className={`nav-status-card ${statusClass}`}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </article>
  );
}

function MetricPlot({
  metric,
  sampledStates,
  currentTime,
  duration,
  currentState,
  severity
}: {
  metric: PlotMetric;
  sampledStates: ReplayState[];
  currentTime: number;
  duration: number;
  currentState: ReplayState;
  severity: AlertSeverity;
}) {
  const samples = sampledStates
    .map((state) => ({ t: state.t, value: metric.value(state) }))
    .filter((sample): sample is { t: number; value: number } => Number.isFinite(sample.value));
  const values = samples.map((sample) => sample.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const zeroY = min < 0 && max > 0 ? yForValue(0, min, range) : null;
  const currentValue = metric.value(currentState);
  const currentX = (currentTime / Math.max(duration, 1)) * plotWidth;
  const pathData = samples
    .map((sample, index) => {
      const x = (sample.t / Math.max(duration, 1)) * plotWidth;
      const y = yForValue(sample.value, min, range);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <article className={`metric-plot metric-plot-${severity}`}>
      <div className="metric-plot-label">
        <div>
          <strong>{metric.label}</strong>
          <span>
            {formatRange(min, max, metric.unit)} {metric.unit}
          </span>
        </div>
        <em>{Number.isFinite(currentValue) ? formatMetricValue(metric, currentValue as number) : "--"}</em>
      </div>
      <svg viewBox={`0 0 ${plotWidth} ${plotHeight}`} role="img" aria-label={`${metric.label} over replay time`}>
        <rect x="0" y="0" width={plotWidth} height={plotHeight} rx="8" />
        {zeroY !== null ? <line className="plot-zero" x1="0" x2={plotWidth} y1={zeroY} y2={zeroY} /> : null}
        <path d={pathData} />
        <line className="plot-now" x1={currentX} x2={currentX} y1="0" y2={plotHeight} />
      </svg>
    </article>
  );
}

function buildCurrentNavItems(state: ReplayState, currentTime: number): NavStatusItem[] {
  const heading = state.yawDeg ?? state.headingDeg;
  const pathBearing = state.pathBearingDeg;
  const nav = state.nav;

  return [
    {
      id: "source-heading",
      label: "Source heading",
      value: formatHeading(heading),
      detail: `Path bearing ${formatHeading(pathBearing)}`,
      active: null
    },
    {
      id: "derived-vs",
      label: "Derived V/S",
      value: formatVerticalSpeed(state.verticalSpeedFpm),
      detail: "Smoothed derivative from decoded altitude samples",
      active: Number.isFinite(state.verticalSpeedFpm) ? Math.abs(state.verticalSpeedFpm as number) >= 1000 : null
    },
    ...buildTimelineCurrentItems(currentTime),
    {
      id: "dme",
      label: "DME",
      value: `L ${formatDistance(nav?.radioNav?.dmeLeftNm)} / R ${formatDistance(nav?.radioNav?.dmeRightNm)}`,
      detail: "Raw left/right DME distances from decoded FDR rows",
      active: null
    }
  ];
}

function buildTimelineCurrentItems(currentTime: number): NavStatusItem[] {
  return navTimeline.fields.reduce<NavStatusItem[]>((items, field) => {
    const event = latestNavTimelineEvent(field.id, currentTime);
    if (!event) {
      return items;
    }

    items.push({
        id: field.id,
        label: field.label,
        value: event.value,
        detail: event.detail.replace(/^Initial decoded state\. /, ""),
        active: event.active ?? null
    });
    return items;
  }, []);
}

function latestNavTimelineEvent(fieldId: string, currentTime: number) {
  let latest: GeneratedNavTimeline["events"][number] | null = null;

  for (const event of navTimeline.events) {
    if (event.fieldId !== fieldId) {
      continue;
    }

    if (event.t <= currentTime) {
      latest = event;
      continue;
    }

    if (!latest) {
      latest = event;
    }
    break;
  }

  return latest;
}

function buildCurrentNavItemsFromReplayState(state: ReplayState): NavStatusItem[] {
  const nav = state.nav;
  const heading = state.yawDeg ?? state.headingDeg;
  const pathBearing = state.pathBearingDeg;

  return [
    {
      id: "source-heading",
      label: "Source heading",
      value: formatHeading(heading),
      detail: `Path bearing ${formatHeading(pathBearing)}`,
      active: null
    },
    {
      id: "derived-vs",
      label: "Derived V/S",
      value: formatVerticalSpeed(state.verticalSpeedFpm),
      detail: "Smoothed derivative from decoded altitude samples",
      active: Number.isFinite(state.verticalSpeedFpm) ? Math.abs(state.verticalSpeedFpm as number) >= 1000 : null
    },
    {
      id: "ap-hud",
      label: "A/P HUD flag",
      ...singleValueStatus(nav?.autopilot?.hud, ["SET"], "Decoded HUD engagement annunciation")
    },
    {
      id: "ap-cmd",
      label: "A/P CMD",
      ...channelValueStatus(nav?.autopilot?.command, ["CMD", "ENGA"], "MCP command channels")
    },
    {
      id: "ap-cws",
      label: "A/P CWS",
      ...channelValueStatus(nav?.autopilot?.cws, ["CWS", "ENGA"], "Control-wheel-steering channels")
    },
    {
      id: "ap-detent",
      label: "A/P in control",
      ...channelValueStatus(nav?.autopilot?.engageDetent, ["IN CTL"], "FCC engage-detent channels")
    },
    {
      id: "at-engaged",
      label: "A/T engaged",
      ...singleValueStatus(nav?.autothrottle?.engagedHud, ["SET"], "Autothrottle HUD flag")
    },
    {
      id: "at-disconnect",
      label: "A/T disconnect",
      ...singleValueStatus(nav?.autothrottle?.disconnect, ["DISCONNECT"], "Autothrottle disconnect flag")
    },
    {
      id: "throttle-hold",
      label: "Throttle hold",
      ...singleValueStatus(nav?.autothrottle?.throttleHoldAnnun, ["HOLD"], "Throttle hold annunciation")
    },
    {
      id: "thrust-mode",
      label: "Thrust mode",
      ...singleValueStatus(nav?.autothrottle?.thrustMode, ["OPER"], "Thrust mode operating flag")
    },
    {
      id: "fd-capt",
      label: "FD captain",
      ...singleValueStatus(nav?.flightDirector?.captain, ["ON"], "Captain flight-director switch")
    },
    {
      id: "fd-fo",
      label: "FD first officer",
      ...singleValueStatus(nav?.flightDirector?.firstOfficer, ["ON"], "First-officer flight-director switch")
    },
    {
      id: "vnav",
      label: "VNAV mode",
      ...multiValueStatus(
        [nav?.modes?.vnavLeft, nav?.modes?.vnavCenter, nav?.modes?.vnavRight],
        ["VNAV ENG"],
        "FCC L/C/R VNAV flags"
      )
    },
    {
      id: "ias-mode",
      label: "IAS mode",
      ...singleValueStatus(nav?.modes?.ias, ["OPER"], "IAS mode operating flag")
    },
    {
      id: "mach-mode",
      label: "Mach mode",
      ...singleValueStatus(nav?.modes?.mach, ["OPER"], "Mach mode operating flag")
    },
    {
      id: "alt-hold",
      label: "Alt hold",
      ...channelValueStatus(nav?.modes?.altHold, ["ALT HLD", "EN"], "Altitude-hold mode channels")
    },
    {
      id: "flch",
      label: "FLCH",
      ...channelValueStatus(nav?.modes?.flightLevelChange, ["OPER"], "Flight-level-change mode channels")
    },
    {
      id: "vs-mode",
      label: "V/S mode",
      ...channelValueStatus(nav?.modes?.verticalSpeed, ["ENGA"], "Vertical-speed mode channels")
    },
    {
      id: "gs-mode",
      label: "G/S mode",
      ...channelValueStatus(nav?.modes?.glideSlope, ["ENGA"], "Glideslope mode channels")
    },
    {
      id: "takeoff-mode",
      label: "T/O mode",
      ...channelValueStatus(nav?.modes?.takeoff, ["T/O", "ENGA"], "Takeoff pitch mode channels")
    },
    {
      id: "rollout-mode",
      label: "Rollout",
      ...channelValueStatus(nav?.modes?.rollout, ["ENGA"], "Rollout mode channels")
    },
    {
      id: "ias-engaged",
      label: "IAS engaged",
      ...channelValueStatus(nav?.modes?.iasEngaged, ["IAS", "ENGA"], "FCC IAS engagement flags")
    },
    {
      id: "mach-engaged",
      label: "Mach engaged",
      ...channelValueStatus(nav?.modes?.machEngaged, ["MACH", "ENGA"], "FCC Mach engagement flags")
    },
    {
      id: "alt-reporting",
      label: "Altitude reporting",
      ...singleValueStatus(nav?.airData?.altitudeReporting, ["ON"], "Altitude reporting state")
    },
    {
      id: "vor-left",
      label: "VOR left",
      value: formatFrequency(nav?.radioNav?.vorLeftMhz),
      detail: "Raw tuned left VOR frequency",
      active: null
    },
    {
      id: "vor-right",
      label: "VOR right",
      value: formatFrequency(nav?.radioNav?.vorRightMhz),
      detail: "Raw tuned right VOR frequency",
      active: null
    },
    {
      id: "dme",
      label: "DME",
      value: `L ${formatDistance(nav?.radioNav?.dmeLeftNm)} / R ${formatDistance(nav?.radioNav?.dmeRightNm)}`,
      detail: "Raw left/right DME distances",
      active: null
    },
    {
      id: "epr-target",
      label: "EPR target",
      value: formatRatio(nav?.performance?.eprTargetFmc),
      detail: "Decoded FMC EPR target ratio",
      active: null
    }
  ];
}

function buildTargetItems(state: ReplayState): NavStatusItem[] {
  const caveat =
    state.nav?.mcpTargets?.caveat ??
    navTimeline.mcpTargetCaveat;

  return [
    {
      id: "target-heading",
      label: "Selected heading",
      value: "not decoded",
      detail: `Source heading is ${formatHeading(state.headingDeg ?? state.yawDeg)}. ${caveat}`,
      active: null
    },
    {
      id: "target-altitude",
      label: "Target altitude",
      value: "not decoded",
      detail: `FDR altitude is ${formatAltitude(state.altitudeFeet)}. ${caveat}`,
      active: null
    },
    {
      id: "target-airspeed",
      label: "Selected AS/Mach",
      value: "not decoded",
      detail: `Current CAS ${formatSpeed(state.computedAirspeedKt)} / Mach ${formatMachValue(state.mach)}. Mode flags only are decoded.`,
      active: null
    },
    {
      id: "target-vs",
      label: "Selected V/S",
      value: "not decoded",
      detail: `Derived V/S is ${formatVerticalSpeed(state.verticalSpeedFpm)}. The V/S mode flag is decoded, not a target fpm selection.`,
      active: null
    }
  ];
}

function buildNavEvents(sampledStates: ReplayState[]): NavEvent[] {
  return [
    ...navTimeline.events.map((event) => ({
      id: event.id,
      t: event.t,
      label: event.label,
      value: event.value,
      detail: event.detail,
      category: event.category
    })),
    ...buildHeadingChangeEvents(sampledStates),
    ...buildVerticalSpeedChangeEvents(sampledStates)
  ].sort((a, b) => a.t - b.t || a.label.localeCompare(b.label));
}

function buildModeChangeEvents(): NavEvent[] {
  const eventExtractors: Array<{
    id: string;
    label: string;
    category: NavEvent["category"];
    read: (nav: FdrNavSnapshot | null | undefined) => NavStatusItem;
  }> = [
    {
      id: "ap-cmd",
      label: "A/P CMD",
      category: "mode",
      read: (nav) => ({
        id: "ap-cmd",
        label: "A/P CMD",
        ...channelValueStatus(nav?.autopilot?.command, ["CMD", "ENGA"], "MCP command channels")
      })
    },
    {
      id: "ap-cws",
      label: "A/P CWS",
      category: "mode",
      read: (nav) => ({
        id: "ap-cws",
        label: "A/P CWS",
        ...channelValueStatus(nav?.autopilot?.cws, ["CWS", "ENGA"], "Control-wheel-steering channels")
      })
    },
    {
      id: "ap-detent",
      label: "A/P in control",
      category: "mode",
      read: (nav) => ({
        id: "ap-detent",
        label: "A/P in control",
        ...channelValueStatus(nav?.autopilot?.engageDetent, ["IN CTL"], "FCC engage-detent channels")
      })
    },
    {
      id: "at-disconnect",
      label: "A/T disconnect",
      category: "mode",
      read: (nav) => ({
        id: "at-disconnect",
        label: "A/T disconnect",
        ...singleValueStatus(nav?.autothrottle?.disconnect, ["DISCONNECT"], "Autothrottle disconnect flag")
      })
    },
    {
      id: "throttle-hold",
      label: "Throttle hold",
      category: "mode",
      read: (nav) => ({
        id: "throttle-hold",
        label: "Throttle hold",
        ...singleValueStatus(nav?.autothrottle?.throttleHoldAnnun, ["HOLD"], "Throttle hold annunciation")
      })
    },
    {
      id: "thrust-mode",
      label: "Thrust mode",
      category: "mode",
      read: (nav) => ({
        id: "thrust-mode",
        label: "Thrust mode",
        ...singleValueStatus(nav?.autothrottle?.thrustMode, ["OPER"], "Thrust mode operating flag")
      })
    },
    {
      id: "vnav",
      label: "VNAV",
      category: "mode",
      read: (nav) => ({
        id: "vnav",
        label: "VNAV",
        ...multiValueStatus(
          [nav?.modes?.vnavLeft, nav?.modes?.vnavCenter, nav?.modes?.vnavRight],
          ["VNAV ENG"],
          "FCC L/C/R VNAV flags"
        )
      })
    },
    {
      id: "ias-mode",
      label: "IAS mode",
      category: "mode",
      read: (nav) => ({
        id: "ias-mode",
        label: "IAS mode",
        ...singleValueStatus(nav?.modes?.ias, ["OPER"], "IAS mode operating flag")
      })
    },
    {
      id: "mach-mode",
      label: "Mach mode",
      category: "mode",
      read: (nav) => ({
        id: "mach-mode",
        label: "Mach mode",
        ...singleValueStatus(nav?.modes?.mach, ["OPER"], "Mach mode operating flag")
      })
    },
    {
      id: "alt-hold",
      label: "Alt hold",
      category: "mode",
      read: (nav) => ({
        id: "alt-hold",
        label: "Alt hold",
        ...channelValueStatus(nav?.modes?.altHold, ["ALT HLD", "EN"], "Altitude-hold mode channels")
      })
    },
    {
      id: "flch",
      label: "FLCH",
      category: "mode",
      read: (nav) => ({
        id: "flch",
        label: "FLCH",
        ...channelValueStatus(nav?.modes?.flightLevelChange, ["OPER"], "Flight-level-change mode channels")
      })
    },
    {
      id: "vs-mode",
      label: "V/S mode",
      category: "mode",
      read: (nav) => ({
        id: "vs-mode",
        label: "V/S mode",
        ...channelValueStatus(nav?.modes?.verticalSpeed, ["ENGA"], "Vertical-speed mode channels")
      })
    },
    {
      id: "takeoff-mode",
      label: "T/O mode",
      category: "mode",
      read: (nav) => ({
        id: "takeoff-mode",
        label: "T/O mode",
        ...channelValueStatus(nav?.modes?.takeoff, ["T/O", "ENGA"], "Takeoff pitch mode channels")
      })
    },
    {
      id: "ias-engaged",
      label: "IAS engaged",
      category: "mode",
      read: (nav) => ({
        id: "ias-engaged",
        label: "IAS engaged",
        ...channelValueStatus(nav?.modes?.iasEngaged, ["IAS", "ENGA"], "FCC IAS engagement flags")
      })
    },
    {
      id: "mach-engaged",
      label: "Mach engaged",
      category: "mode",
      read: (nav) => ({
        id: "mach-engaged",
        label: "Mach engaged",
        ...channelValueStatus(nav?.modes?.machEngaged, ["MACH", "ENGA"], "FCC Mach engagement flags")
      })
    },
    {
      id: "vor-left",
      label: "VOR left",
      category: "radio",
      read: (nav) => ({
        id: "vor-left",
        label: "VOR left",
        value: formatFrequency(nav?.radioNav?.vorLeftMhz),
        detail: "Raw tuned left VOR frequency",
        active: null
      })
    },
    {
      id: "vor-right",
      label: "VOR right",
      category: "radio",
      read: (nav) => ({
        id: "vor-right",
        label: "VOR right",
        value: formatFrequency(nav?.radioNav?.vorRightMhz),
        detail: "Raw tuned right VOR frequency",
        active: null
      })
    }
  ];

  const events: NavEvent[] = [];

  for (const extractor of eventExtractors) {
    const compacted: Array<{ t: number; item: NavStatusItem; key: string }> = [];

    for (const point of trajectoryPoints) {
      const item = extractor.read(point.nav);
      const key = `${item.value}|${item.detail}`;
      const previous = compacted[compacted.length - 1];
      if (!previous || previous.key !== key) {
        compacted.push({ t: point.t, item, key });
      }
    }

    const shouldShow = compacted.length > 1 || compacted.some((entry) => entry.item.active === true);
    if (!shouldShow) {
      continue;
    }

    compacted.forEach((entry, index) => {
      events.push({
        id: `${extractor.id}-${index}-${entry.t}`,
        t: entry.t,
        label: extractor.label,
        value: entry.item.value,
        detail: index === 0 ? `Initial decoded state. ${entry.item.detail}` : entry.item.detail,
        category: extractor.category
      });
    });
  }

  return events;
}

function buildHeadingChangeEvents(sampledStates: ReplayState[]): NavEvent[] {
  const events: NavEvent[] = [];
  let lastHeading: number | null = null;
  let lastEventTime = -Infinity;
  const finalFdrTime = trajectoryPoints[trajectoryPoints.length - 1]?.t ?? Infinity;

  for (const state of sampledStates) {
    if (state.t > finalFdrTime || !Number.isFinite(state.headingDeg)) {
      continue;
    }

    const heading = state.headingDeg as number;
    if (lastHeading === null) {
      lastHeading = heading;
      lastEventTime = state.t;
      events.push({
        id: `heading-initial-${state.t}`,
        t: state.t,
        label: "Source heading",
        value: formatHeading(heading),
        detail: "Initial decoded heading in the telemetry plot sample set",
        category: "heading"
      });
      continue;
    }

    if (angleDelta(lastHeading, heading) >= 18 && state.t - lastEventTime >= 8) {
      const previousHeading = lastHeading;
      lastHeading = heading;
      lastEventTime = state.t;
      events.push({
        id: `heading-${state.t}`,
        t: state.t,
        label: "Source heading",
        value: formatHeading(heading),
        detail: `Changed about ${Math.round(angleDelta(previousHeading, heading))} deg from ${formatHeading(previousHeading)}`,
        category: "heading"
      });
    }
  }

  return events;
}

function buildVerticalSpeedChangeEvents(sampledStates: ReplayState[]): NavEvent[] {
  const events: NavEvent[] = [];
  let lastRegime: string | null = null;
  const finalFdrTime = trajectoryPoints[trajectoryPoints.length - 1]?.t ?? Infinity;

  for (const state of sampledStates) {
    if (state.t > finalFdrTime) {
      continue;
    }

    const regime = verticalSpeedRegime(state.verticalSpeedFpm);
    if (regime.id === "unavailable") {
      continue;
    }

    if (regime.id !== lastRegime) {
      lastRegime = regime.id;
      events.push({
        id: `vs-${state.t}`,
        t: state.t,
        label: "Derived V/S regime",
        value: regime.label,
        detail: `Current derived V/S ${formatVerticalSpeed(state.verticalSpeedFpm)}`,
        category: "verticalSpeed"
      });
    }
  }

  return events;
}

function singleValueStatus(value: string | null | undefined, activeTokens: string[], detail: string) {
  if (!hasValue(value)) {
    return { value: "not decoded", detail, active: null };
  }

  const active = isActiveText(value, activeTokens);
  return {
    value: `${active ? "true" : "false"} (${formatRawValue(value)})`,
    detail,
    active
  };
}

function channelValueStatus(channels: FdrChannelSnapshot | null | undefined, activeTokens: string[], detail: string) {
  const entries = channelEntries(channels);
  if (entries.length === 0) {
    return { value: "not decoded", detail, active: null };
  }

  const activeLabels = entries
    .filter(([, value]) => isActiveText(value, activeTokens))
    .map(([label]) => label)
    .join("/");
  const raw = entries.map(([label, value]) => `${label} ${formatRawValue(value)}`).join(" | ");

  return {
    value: activeLabels ? `true (${activeLabels})` : "false",
    detail: `${detail}: ${raw}`,
    active: Boolean(activeLabels)
  };
}

function multiValueStatus(values: Array<string | null | undefined>, activeTokens: string[], detail: string) {
  const entries = values
    .map((value, index) => ({ label: ["L", "C", "R"][index] ?? String(index + 1), value }))
    .filter((entry) => hasValue(entry.value));

  if (entries.length === 0) {
    return { value: "not decoded", detail, active: null };
  }

  const activeLabels = entries
    .filter((entry) => isActiveText(entry.value, activeTokens))
    .map((entry) => entry.label)
    .join("/");
  const raw = entries.map((entry) => `${entry.label} ${formatRawValue(entry.value)}`).join(" | ");

  return {
    value: activeLabels ? `true (${activeLabels})` : "false",
    detail: `${detail}: ${raw}`,
    active: Boolean(activeLabels)
  };
}

function channelEntries(channels: FdrChannelSnapshot | null | undefined) {
  if (!channels) {
    return [];
  }

  return ([
    ["L", channels.left],
    ["C", channels.center],
    ["R", channels.right]
  ] as const).filter(([, value]) => hasValue(value));
}

function isActiveText(value: string | null | undefined, activeTokens: string[]) {
  if (!hasValue(value)) {
    return false;
  }

  const text = String(value).toUpperCase();
  if (
    text.includes("NOT") ||
    text.includes("INOPER") ||
    text.includes("OFF") ||
    text.includes("DISABLE") ||
    text.includes("NO HOLD") ||
    text.includes("NORMAL") ||
    text.includes("WARN NOT") ||
    text.includes("CAUT'N NOT")
  ) {
    return false;
  }

  return activeTokens.some((token) => text.includes(token.toUpperCase()));
}

function hasValue(value: string | number | null | undefined) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function formatRawValue(value: string | null | undefined) {
  return hasValue(value) ? String(value) : "--";
}

function formatHeading(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value as number).toString().padStart(3, "0")} deg`;
}

function formatAltitude(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value as number).toLocaleString()} ft`;
}

function formatSpeed(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value as number)} kt`;
}

function formatMachValue(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `M ${(value as number).toFixed(2)}`;
}

function formatVerticalSpeed(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const number = Math.round(value as number);
  return `${number > 0 ? "+" : ""}${number.toLocaleString()} fpm`;
}

function formatFrequency(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${(value as number).toFixed(2)} MHz`;
}

function formatDistance(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${(value as number).toFixed(2)} NM`;
}

function formatRatio(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return (value as number).toFixed(3);
}

function angleDelta(first: number, second: number) {
  const delta = Math.abs(((second - first + 540) % 360) - 180);
  return delta;
}

function verticalSpeedRegime(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return { id: "unavailable", label: "not available" };
  }

  const fpm = value as number;
  if (fpm >= 3000) {
    return { id: "climb-high", label: "climb >= 3,000 fpm" };
  }
  if (fpm >= 1000) {
    return { id: "climb", label: "climb 1,000-3,000 fpm" };
  }
  if (fpm <= -3000) {
    return { id: "descent-high", label: "descent >= 3,000 fpm" };
  }
  if (fpm <= -1000) {
    return { id: "descent", label: "descent 1,000-3,000 fpm" };
  }
  return { id: "near-level", label: "near level" };
}

function sampleStates(duration: number) {
  const count = 420;
  return Array.from({ length: count + 1 }, (_, index) =>
    getReplayState((index / count) * duration, { interpolationMode: "smooth" })
  );
}

function validComputedAirspeed(state: ReplayState) {
  if ((state.groundSpeedKt ?? 0) < 70 && (state.altitudeFeet ?? 0) < 100) {
    return null;
  }

  return state.computedAirspeedKt;
}

function validMach(state: ReplayState) {
  if ((state.groundSpeedKt ?? 0) < 120 && (state.altitudeFeet ?? 0) < 400) {
    return null;
  }

  return state.mach;
}

function toggleMetric(id: string, setSelectedMetricIds: (updater: (current: string[]) => string[]) => void) {
  setSelectedMetricIds((current) => {
    if (current.includes(id)) {
      return current.length <= 1 ? current : current.filter((metricId) => metricId !== id);
    }

    return [...current, id];
  });
}

function yForValue(value: number, min: number, range: number) {
  return plotHeight - plotPadding - ((value - min) / range) * (plotHeight - plotPadding * 2);
}

function formatMetricValue(metric: PlotMetric, value: number) {
  return metric.format ? metric.format(value) : `${value.toFixed(1)} ${metric.unit}`;
}

function formatRange(min: number, max: number, unit: string) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return "--";
  }

  const decimals = unit === "g" || unit === "M" || unit === "kt/s" ? 2 : 0;
  return `${min.toFixed(decimals)} to ${max.toFixed(decimals)}`;
}
