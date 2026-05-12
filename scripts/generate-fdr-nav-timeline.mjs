import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const afPath = resolve(
  root,
  "sources/fdr/FinalFlightCompleteWithMaxOneLine/FinalFlightCompleteWithMaxOneLineA-F.csv"
);
const gzPath = resolve(
  root,
  "sources/fdr/FinalFlightCompleteWithMaxOneLine/FinalFlightCompleteWithMaxOneLineG-Z.csv"
);
const outPath = resolve(root, "src/data/fdrNavTimeline.generated.json");

const requestedReplayStartUtc = timeToSeconds(12, 19, 5);
const afRows = readCsv(afPath);
const gzRows = readCsv(gzPath);
const afByCounter = new Map(afRows.rows.map((row) => [row[afRows.index["Subframe Counter"]], row]));
const replayStart = findReplayStart(gzRows, afByCounter, requestedReplayStartUtc);
const sourceRows = gzRows.rows
  .map((gz) => {
    const counter = Number(gz[gzRows.index["Subframe Counter"]]);
    const af = afByCounter.get(gz[gzRows.index["Subframe Counter"]]);
    if (!Number.isFinite(counter) || !af || counter < replayStart.counter) {
      return null;
    }
    return { t: counter - replayStart.counter, af, gz };
  })
  .filter(Boolean);

const extractors = [
  {
    id: "ap-hud",
    label: "A/P HUD flag",
    category: "mode",
    read: ({ af }) => singleValueStatus(rawValue(af, afRows.index, "AUTOPILOT ENGAGED HUD"), ["SET"], "Decoded HUD engagement annunciation")
  },
  {
    id: "ap-cmd",
    label: "A/P CMD",
    category: "mode",
    read: ({ af }) =>
      channelValueStatus(
        channelValues(af, afRows.index, "A/P CMD L ENGA MCP A-A-2", "A/P CMD C ENGA MCP A-A-2", "A/P CMD R ENGA MCP A-A-2"),
        ["CMD", "ENGA"],
        "MCP command channels"
      )
  },
  {
    id: "ap-cws",
    label: "A/P CWS",
    category: "mode",
    read: ({ af }) =>
      channelValueStatus(
        channelValues(af, afRows.index, "A/P CWS L ENGA MCP A-A-2", "A/P CWS C ENGA MCP A-A-2", "A/P CWS R ENGA MCP A-A-2"),
        ["CWS", "ENGA"],
        "Control-wheel-steering channels"
      )
  },
  {
    id: "ap-warning",
    label: "A/P warning",
    category: "mode",
    read: ({ af }) =>
      channelValueStatus(
        channelValues(af, afRows.index, "A/P WARNING FCC L-A-4", "A/P WARNING FCC C-A-4", "A/P WARNING FCC R-A-4"),
        ["WARN"],
        "Autopilot warning flags"
      )
  },
  {
    id: "ap-caution",
    label: "A/P caution",
    category: "mode",
    read: ({ af }) =>
      channelValueStatus(
        channelValues(af, afRows.index, "A/P CAUTION FCC L-A-4", "A/P CAUTION FCC C-A-4", "A/P CAUTION FCC R-A-4"),
        ["CAUT"],
        "Autopilot caution flags"
      )
  },
  {
    id: "at-engaged",
    label: "A/T engaged",
    category: "mode",
    read: ({ af }) => singleValueStatus(rawValue(af, afRows.index, "AUTOTHROTTLE ENGD HUD"), ["SET"], "Autothrottle HUD flag")
  },
  {
    id: "at-disconnect",
    label: "A/T disconnect",
    category: "mode",
    read: ({ af }) => singleValueStatus(rawValue(af, afRows.index, "AUTOTHROTTLE DISC"), ["DISCONNECT"], "Autothrottle disconnect flag")
  },
  {
    id: "throttle-hold",
    label: "Throttle hold",
    category: "mode",
    read: ({ gz }) => singleValueStatus(rawValue(gz, gzRows.index, "THROTTLE HLD ANNUN"), ["HOLD"], "Throttle hold annunciation")
  },
  {
    id: "thrust-mode",
    label: "Thrust mode",
    category: "mode",
    read: ({ gz }) => singleValueStatus(rawValue(gz, gzRows.index, "THRUST MODE OPER"), ["OPER"], "Thrust mode operating flag")
  },
  {
    id: "fd-capt",
    label: "FD captain",
    category: "mode",
    read: ({ af }) => singleValueStatus(rawValue(af, afRows.index, "FLT DIR ON-CAPT MCP A-A-2"), ["ON"], "Captain flight-director switch")
  },
  {
    id: "fd-fo",
    label: "FD first officer",
    category: "mode",
    read: ({ af }) => singleValueStatus(rawValue(af, afRows.index, "FLT DIR ON-F/O MCP A-A-2"), ["ON"], "First-officer flight-director switch")
  },
  {
    id: "vnav",
    label: "VNAV",
    category: "mode",
    read: ({ gz }) =>
      multiValueStatus(
        [
          rawValue(gz, gzRows.index, "V NAV MODE OPER FCC L-A-4"),
          rawValue(gz, gzRows.index, "V NAV MODE OPER FCC C-A-4"),
          rawValue(gz, gzRows.index, "V NAV MODE OPER FCC R-A-4")
        ],
        ["VNAV ENG"],
        "FCC L/C/R VNAV flags"
      )
  },
  {
    id: "ias-mode",
    label: "IAS mode",
    category: "mode",
    read: ({ gz }) => singleValueStatus(rawValue(gz, gzRows.index, "IAS MODE OPER"), ["OPER"], "IAS mode operating flag")
  },
  {
    id: "mach-mode",
    label: "Mach mode",
    category: "mode",
    read: ({ gz }) => singleValueStatus(rawValue(gz, gzRows.index, "MACH MODE OPER"), ["OPER"], "Mach mode operating flag")
  },
  {
    id: "alt-hold",
    label: "Alt hold",
    category: "mode",
    read: ({ af }) =>
      channelValueStatus(
        channelValues(af, afRows.index, "ALT HOLD MODE OPER FCC L-A-4", "ALT HOLD MODE OPER FCC C-A-4", "ALT HOLD MODE OPER FCC R-A-4"),
        ["ALT HLD", "EN"],
        "Altitude-hold mode channels"
      )
  },
  {
    id: "flch",
    label: "FLCH",
    category: "mode",
    read: ({ af }) =>
      channelValueStatus(
        channelValues(af, afRows.index, "FL CH MODE OPER FCC L-A-4", "FL CH MODE OPER FCC C-A-4", "FL CH MODE OPER FCC R-A-4"),
        ["OPER"],
        "Flight-level-change mode channels"
      )
  },
  {
    id: "vs-mode",
    label: "V/S mode",
    category: "mode",
    read: ({ gz }) =>
      channelValueStatus(
        channelValues(gz, gzRows.index, "V/S MODE FCC L-A-4", "V/S MODE FCC C-A-4", "V/S MODE FCC R-A-4"),
        ["ENGA"],
        "Vertical-speed mode channels"
      )
  },
  {
    id: "gs-mode",
    label: "G/S mode",
    category: "mode",
    read: ({ gz }) =>
      channelValueStatus(
        channelValues(gz, gzRows.index, "G/S MODE OPER FCC L-A-4", "G/S MODE OPER FCC C-A-4", "G/S MODE OPER FCC R-A-4"),
        ["ENGA"],
        "Glideslope mode channels"
      )
  },
  {
    id: "takeoff-mode",
    label: "T/O mode",
    category: "mode",
    read: ({ gz }) =>
      channelValueStatus(
        channelValues(gz, gzRows.index, "T/O MODE OPER-P FCC L-A-4", "T/O MODE OPER-P FCC C-A-4", "T/O MODE OPER-P FCC R-A-4"),
        ["T/O", "ENGA"],
        "Takeoff pitch mode channels"
      )
  },
  {
    id: "rollout-mode",
    label: "Rollout",
    category: "mode",
    read: ({ gz }) =>
      channelValueStatus(
        channelValues(gz, gzRows.index, "ROLLOUT MODE OPER FCC L-A-4", "ROLLOUT MODE OPER FCC C-A-4", "ROLLOUT MODE OPER FCC R-A-4"),
        ["ENGA"],
        "Rollout mode channels"
      )
  },
  {
    id: "ias-engaged",
    label: "IAS engaged",
    category: "mode",
    read: ({ gz }) =>
      channelValueStatus(
        channelValues(gz, gzRows.index, "IAS FCC L-A-4", "IAS FCC C-A-4", "IAS FCC R-A-4"),
        ["IAS", "ENGA"],
        "FCC IAS engagement flags"
      )
  },
  {
    id: "mach-engaged",
    label: "Mach engaged",
    category: "mode",
    read: ({ gz }) =>
      channelValueStatus(
        channelValues(gz, gzRows.index, "MACH ENGAGED FCC L-A-4", "MACH ENGAGED FCC C-A-4", "MACH ENGAGED FCC R-A-4"),
        ["MACH", "ENGA"],
        "FCC Mach engagement flags"
      )
  },
  {
    id: "alt-reporting",
    label: "Altitude reporting",
    category: "mode",
    read: ({ af }) => singleValueStatus(rawValue(af, afRows.index, "ALTITUDE REPORTING"), ["ON"], "Altitude reporting state")
  },
  {
    id: "vor-left",
    label: "VOR left",
    category: "radio",
    read: ({ gz }) => radioStatus(numberValue(gz[gzRows.index["VOR FREQUENCY-LEFT (MHz)"]]), "Raw tuned left VOR frequency")
  },
  {
    id: "vor-right",
    label: "VOR right",
    category: "radio",
    read: ({ gz }) => radioStatus(numberValue(gz[gzRows.index["VOR FREQUENCY-RIGHT (MHz)"]]), "Raw tuned right VOR frequency")
  }
];

const events = [];
for (const extractor of extractors) {
  const compacted = [];
  for (const sourceRow of sourceRows) {
    const item = extractor.read(sourceRow);
    if (!statusHasDecodedValue(item)) {
      continue;
    }
    const key = extractor.category === "radio" ? item.value : item.active ? "true" : "false";
    const previous = compacted[compacted.length - 1];
    if (!previous || previous.key !== key) {
      compacted.push({ t: round(sourceRow.t, 3), item, key });
    }
  }

  compacted.forEach((entry, index) => {
    events.push({
      id: `${extractor.id}-${index}-${entry.t}`,
      fieldId: extractor.id,
      t: entry.t,
      label: extractor.label,
      value: entry.item.value,
      detail: index === 0 ? `Initial decoded state. ${entry.item.detail}` : entry.item.detail,
      active: entry.item.active,
      category: extractor.category
    });
  });
}

events.sort((a, b) => a.t - b.t || a.label.localeCompare(b.label));

const output = {
  id: "aa77_decoded_fdr_nav_timeline",
  generatedAt: new Date().toISOString(),
  source:
    "Decoded FinalFlightCompleteWithMaxOneLine CSV columns for autopilot, autothrottle, flight-director, mode annunciations, altitude reporting, and VOR frequency changes.",
  mcpTargetCaveat:
    "Selected MCP target heading, altitude, airspeed, and vertical-speed values are not present in the loaded decoded FinalFlightCompleteWithMaxOneLine CSV fields.",
  fields: extractors.map((extractor) => ({
    id: extractor.id,
    label: extractor.label,
    category: extractor.category
  })),
  events
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${events.length} nav events to ${outPath}`);

function readCsv(path) {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const headers = splitCsvLine(lines.shift());
  return {
    headers,
    index: Object.fromEntries(headers.map((header, index) => [header, index])),
    rows: lines.map(splitCsvLine)
  };
}

function splitCsvLine(line) {
  return line.split(",");
}

function numberValue(value) {
  if (value === undefined || value === null || value === "") return Number.NaN;
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : Number.NaN;
}

function rawValue(row, index, name) {
  const fieldIndex = index[name];
  if (fieldIndex === undefined) return null;
  const value = row[fieldIndex];
  return value === undefined || value === "" ? null : value;
}

function channelValues(row, index, left, center, right) {
  return {
    left: rawValue(row, index, left),
    center: rawValue(row, index, center),
    right: rawValue(row, index, right)
  };
}

function singleValueStatus(value, activeTokens, detail) {
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

function channelValueStatus(channels, activeTokens, detail) {
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

function multiValueStatus(values, activeTokens, detail) {
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

function radioStatus(value, detail) {
  return {
    value: Number.isFinite(value) ? `${value.toFixed(2)} MHz` : "--",
    detail,
    active: null
  };
}

function statusHasDecodedValue(item) {
  return item.value !== "not decoded" && item.value !== "--";
}

function channelEntries(channels) {
  if (!channels) {
    return [];
  }

  return [
    ["L", channels.left],
    ["C", channels.center],
    ["R", channels.right]
  ].filter(([, value]) => hasValue(value));
}

function isActiveText(value, activeTokens) {
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

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function formatRawValue(value) {
  return hasValue(value) ? String(value) : "--";
}

function findReplayStart(rows, afByCounter, requestedUtcSeconds) {
  let best = null;

  for (const row of rows.rows) {
    const counter = row[rows.index["Subframe Counter"]];
    if (!afByCounter.has(counter)) continue;

    const lat = numberValue(row[rows.index["PRES POSN LAT (DEG)"]]);
    const lon = numberValue(row[rows.index["PRES POSN LONG (DEG)"]]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const h = numberValue(row[rows.index["GMT HOURS"]]);
    const m = numberValue(row[rows.index["GMT MINUTES"]]);
    const s = numberValue(row[rows.index["GMT SECONDS"]]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) continue;

    const utcSeconds = timeToSeconds(h, m, s);
    const counterNumber = Number(counter);
    if (!Number.isFinite(counterNumber) || utcSeconds < requestedUtcSeconds) continue;

    if (!best || utcSeconds < best.utcSeconds || (utcSeconds === best.utcSeconds && counterNumber < best.counter)) {
      best = { counter: counterNumber, utcSeconds };
    }
  }

  if (!best) {
    throw new Error("No decoded FDR row found at or after requested replay start");
  }

  return best;
}

function timeToSeconds(h, m, s) {
  return h * 3600 + m * 60 + s;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
