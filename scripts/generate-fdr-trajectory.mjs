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
const outPath = resolve(root, "src/data/fdrTrajectory.generated.json");

const anchor = {
  label: "Approximate west-facade impact reference used as local origin",
  // OSM west-facade intersection of the final decoded FDR approach segment. Used only
  // as a local ENU visualization anchor until a surveyed impact coordinate is available.
  lat: 38.87135975,
  lon: -77.05817382,
  altFeet: 45
};

const requestedReplayStartUtc = timeToSeconds(12, 19, 5);
const metersPerFoot = 0.3048;

const afRows = readCsv(afPath);
const gzRows = readCsv(gzPath);

const afByCounter = new Map(afRows.rows.map((row) => [row[afRows.index["Subframe Counter"]], row]));
const replayStart = findReplayStart(gzRows, afByCounter, requestedReplayStartUtc);
const points = [];

for (const row of gzRows.rows) {
  const counter = row[gzRows.index["Subframe Counter"]];
  const af = afByCounter.get(counter);
  if (!af) continue;

  const lat = numberValue(row[gzRows.index["PRES POSN LAT (DEG)"]]);
  const lon = numberValue(row[gzRows.index["PRES POSN LONG (DEG)"]]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  const h = numberValue(row[gzRows.index["GMT HOURS"]]);
  const m = numberValue(row[gzRows.index["GMT MINUTES"]]);
  const s = numberValue(row[gzRows.index["GMT SECONDS"]]);
  const utcSeconds = Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s) ? timeToSeconds(h, m, s) : null;

  const counterNumber = Number(counter);
  if (!Number.isFinite(counterNumber) || counterNumber < replayStart.counter) continue;

  if (utcSeconds !== null && utcSeconds < requestedReplayStartUtc) continue;

  const enu = wgs84ToLocalMeters(lat, lon, anchor.lat, anchor.lon);
  const radioHeightFeet = firstFinite(
    row,
    gzRows.index,
    "RADIO HEIGHT CAPT (FEET)",
    "RADIO HEIGHT LRRAL (FEET)",
    "RADIO HEIGHT LRRAR (FEET)",
    "RADIO HEIGHT LRRAC (FEET)"
  );
  const pressureAltFeet = firstFinite(
    af,
    afRows.index,
    "ALTITUDE (1013.25mB) (FEET)"
  );
  const fallbackPressureAltFeet = numberValue(row[gzRows.index["Pressure Altitude as per 757-3b_1.TXT (FEET)"]]);
  const usesRadioHeight = Number.isFinite(radioHeightFeet) && radioHeightFeet < 2500;
  const selectedPressureAltFeet = Number.isFinite(pressureAltFeet) ? pressureAltFeet : fallbackPressureAltFeet;
  const altitudeFeet = usesRadioHeight ? radioHeightFeet : selectedPressureAltFeet - anchor.altFeet;
  const heading = firstFinite(row, gzRows.index, "TRUE HEADING CAPT (DEG)", "TRACK ANGLE TRUE (DEG)");
  const track = numberValue(row[gzRows.index["TRACK ANGLE TRUE (DEG)"]]);
  const speed = firstFinite(row, gzRows.index, "GROUNDSPEED CAPT (KNOTS)", "TRUE AIRSPEED (KT)");
  const computedAirspeed = numberValue(af[afRows.index["COMPUTED AIRSPEED (KNOTS)"]]);
  const trueAirspeed = numberValue(row[gzRows.index["TRUE AIRSPEED (KT)"]]);
  const mach = numberValue(row[gzRows.index["MACH (MACH)"]]);
  const pitch = numberValue(row[gzRows.index["PITCH ANGLE CAPT (DEG)"]]);
  const roll = numberValue(row[gzRows.index["ROLL ANGLE CAPT (DEG)"]]);
  const verticalAccel = firstFinite(row, gzRows.index, "VERTICAL ACCELERATION (G's)");
  const lateralAccel = firstFinite(row, gzRows.index, "LATERAL ACCELERATION (G's)");
  const longitudinalAccel = firstFinite(row, gzRows.index, "LONGITUDINAL ACCEL (G's)");
  const leftAileron = numberValue(af[afRows.index["AILERON POSN-OUTER - L (DEG)"]]);
  const rightAileron = numberValue(af[afRows.index["AILERON POSN-OUTER - R (DEG)"]]);
  const rudder = numberValue(row[gzRows.index["RUDDER POSITION (DEG)"]]);
  const rudderPedal = numberValue(row[gzRows.index["RUDDER PEDAL POSITION (DEG)"]]);
  const flapHandle = numberValue(af[afRows.index["FLAP HANDLE POSN (DEG)"]]);

  points.push({
    t: counterNumber - replayStart.counter,
    utc: utcSeconds !== null ? secondsToClock(utcSeconds) : null,
    counter: counterNumber,
    lat: round(lat, 6),
    lon: round(lon, 6),
    x: round(enu.east, 2),
    y: round(Math.max(0, altitudeFeet * metersPerFoot), 2),
    z: round(-enu.north, 2),
    altitudeFeet: round(altitudeFeet, 1),
    altitudeSource: usesRadioHeight ? "fdr_radio_height" : "fdr_pressure_altitude_1013mb_adjusted",
    pressureAltitudeFeet: Number.isFinite(selectedPressureAltFeet) ? round(selectedPressureAltFeet, 1) : null,
    headingDeg: Number.isFinite(heading) ? round(normalizeDegrees(heading), 2) : null,
    trackDeg: Number.isFinite(track) ? round(normalizeDegrees(track), 2) : null,
    pitchDeg: Number.isFinite(pitch) ? round(pitch, 2) : null,
    rollDeg: Number.isFinite(roll) ? round(roll, 2) : null,
    groundSpeedKt: Number.isFinite(speed) ? round(speed, 1) : null,
    computedAirspeedKt: Number.isFinite(computedAirspeed) ? round(computedAirspeed, 1) : null,
    trueAirspeedKt: Number.isFinite(trueAirspeed) ? round(trueAirspeed, 1) : null,
    mach: Number.isFinite(mach) ? round(mach, 3) : null,
    verticalAccelG: Number.isFinite(verticalAccel) ? round(verticalAccel, 3) : null,
    lateralAccelG: Number.isFinite(lateralAccel) ? round(lateralAccel, 3) : null,
    longitudinalAccelG: Number.isFinite(longitudinalAccel) ? round(longitudinalAccel, 3) : null,
    leftAileronDeg: Number.isFinite(leftAileron) ? round(leftAileron, 2) : null,
    rightAileronDeg: Number.isFinite(rightAileron) ? round(rightAileron, 2) : null,
    rudderDeg: Number.isFinite(rudder) ? round(rudder, 2) : null,
    rudderPedalDeg: Number.isFinite(rudderPedal) ? round(rudderPedal, 2) : null,
    flapHandleDeg: Number.isFinite(flapHandle) ? round(flapHandle, 2) : null,
    overspeed: rawValue(row, gzRows.index, "OVERSPEED"),
    nav: navSnapshot(af, afRows.index, row, gzRows.index),
    confidence: "high",
    sourceRef: "Decoded FDR row generated from FinalFlightCompleteWithMaxOneLine CSV"
  });
}

points.sort((a, b) => a.t - b.t);
const t0 = points[0]?.t ?? 0;
for (const point of points) point.t = round(point.t - t0, 3);

const output = {
  id: "aa77_decoded_fdr_from_dulles_ground_roll",
  mode: "passive_replay_only",
  generatedAt: new Date().toISOString(),
  replayStart: {
    requestedUtc: secondsToClock(requestedReplayStartUtc),
    firstDecodedUtc: secondsToClock(replayStart.utcSeconds),
    firstDecodedLocalClock: utcSecondsToEasternClock(replayStart.utcSeconds),
    firstDecodedCounter: replayStart.counter
  },
  source: {
    primary:
      "Decoded AA77 FDR output from Warren Stutt's AAL77 FDR Decoder, generated from NTSB FOIA CD material",
    ntsbReport: "https://www.ntsb.gov/about/Documents/AAL77_fdr.pdf",
    decoderSource: "http://www.warrenstutt.com/AAL77FDRDecoder/index.html",
    outputFiles: "http://www.warrenstutt.com/AAL77FDRDecoder/OutputFiles/index.html",
    caveat:
      "This is decoded FDR output, not the original binary .fdr file. The replay starts at the first available Dulles ground/runway position in this decoded CSV, not at pushback from the gate. Above the radio-height range, visualization altitude uses the decoded 1013.25mb altitude field because the alternate coarse/fine pressure-altitude output shows a visible wrap artifact during climb. The replay ends at the last decoded public FDR row and does not append an app-inferred endpoint."
  },
  coordinateSystem: {
    world: "local East/North/Up meters rendered as x=east, y=up, z=-north",
    anchor
  },
  units: {
    position: "meters",
    time: `seconds_from_${secondsToClock(replayStart.utcSeconds)}_decoded_replay_window`,
    angles: "degrees",
    speed: "knots"
  },
  points
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${points.length} points to ${outPath}`);

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

function firstFinite(row, index, ...names) {
  for (const name of names) {
    const value = numberValue(row[index[name]]);
    if (Number.isFinite(value)) return value;
  }
  return Number.NaN;
}

function rawValue(row, index, name) {
  const fieldIndex = index[name];
  if (fieldIndex === undefined) return null;
  const value = row[fieldIndex];
  return value === undefined || value === "" ? null : value;
}

function navSnapshot(af, afIndex, gz, gzIndex) {
  return {
    autopilot: {
      hud: rawValue(af, afIndex, "AUTOPILOT ENGAGED HUD"),
      command: {
        left: rawValue(af, afIndex, "A/P CMD L ENGA MCP A-A-2"),
        center: rawValue(af, afIndex, "A/P CMD C ENGA MCP A-A-2"),
        right: rawValue(af, afIndex, "A/P CMD R ENGA MCP A-A-2")
      },
      cws: {
        left: rawValue(af, afIndex, "A/P CWS L ENGA MCP A-A-2"),
        center: rawValue(af, afIndex, "A/P CWS C ENGA MCP A-A-2"),
        right: rawValue(af, afIndex, "A/P CWS R ENGA MCP A-A-2")
      }
    },
    autothrottle: {
      engagedHud: rawValue(af, afIndex, "AUTOTHROTTLE ENGD HUD"),
      disconnect: rawValue(af, afIndex, "AUTOTHROTTLE DISC")
    },
    flightDirector: {
      captain: rawValue(af, afIndex, "FLT DIR ON-CAPT MCP A-A-2"),
      firstOfficer: rawValue(af, afIndex, "FLT DIR ON-F/O MCP A-A-2")
    },
    modes: {
      vnavLeft: rawValue(gz, gzIndex, "V NAV MODE OPER FCC L-A-4"),
      vnavCenter: rawValue(gz, gzIndex, "V NAV MODE OPER FCC C-A-4"),
      vnavRight: rawValue(gz, gzIndex, "V NAV MODE OPER FCC R-A-4"),
      ias: rawValue(gz, gzIndex, "IAS MODE OPER"),
      mach: rawValue(gz, gzIndex, "MACH MODE OPER")
    },
    radioNav: {
      vorLeftMhz: finiteOrNull(numberValue(gz[gzIndex["VOR FREQUENCY-LEFT (MHz)"]])),
      vorRightMhz: finiteOrNull(numberValue(gz[gzIndex["VOR FREQUENCY-RIGHT (MHz)"]])),
      dmeLeftNm: finiteOrNull(numberValue(af[afIndex["DME DISTANCE - LEFT (NM)"]])),
      dmeRightNm: finiteOrNull(numberValue(af[afIndex["DME DISTANCE - RIGHT (NM)"]]))
    }
  };
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
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
    throw new Error(`No decoded FDR row found at or after ${secondsToClock(requestedUtcSeconds)}`);
  }

  return best;
}

function timeToSeconds(h, m, s) {
  return h * 3600 + m * 60 + s;
}

function secondsToClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600) % 24;
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}Z`;
}

function utcSecondsToEasternClock(totalSeconds) {
  const easternSeconds = (totalSeconds - 4 * 3600 + 86400) % 86400;
  const h = Math.floor(easternSeconds / 3600) % 24;
  const m = Math.floor((easternSeconds % 3600) / 60);
  const s = easternSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function wgs84ToLocalMeters(lat, lon, anchorLat, anchorLon) {
  const earthRadius = 6378137;
  const latRad = degToRad(anchorLat);
  return {
    east: degToRad(lon - anchorLon) * earthRadius * Math.cos(latRad),
    north: degToRad(lat - anchorLat) * earthRadius
  };
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

