import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const radarKmlPath = path.join(rootDir, "sources", "radar", "911maps", "doc.kml");
const ua93BlackBoxKmlPath = path.join(
  rootDir,
  "sources",
  "radar",
  "UAL93BlackBoxDatas",
  "UA93BlackBoxDatas.kml"
);
const outputPath = path.join(rootDir, "src", "data", "publicFlightTrackSamples.generated.ts");

const metersToFeet = 1 / 0.3048;

const publicRadarTrackConfigs = {
  aa11: {
    folderId: "AA11SP",
    nextFolderMarker: '<Folder id="UA175"',
    startClock: "08:00:00",
    endClock: "08:46:40"
  },
  ua175: {
    folderId: "UA175",
    nextFolderMarker: '<Folder id="AA77"',
    startClock: "08:14:00",
    endClock: "09:03:11"
  }
};

const impactSamples = {
  aa11: {
    clock: "08:46:40",
    label: "North Tower impact",
    lat: 40.71205555555556,
    lon: -74.013194,
    altitudeFeet: 1300,
    confidence: "medium",
    source: "9/11 Commission impact time; WTC 1 coordinate from 911maps KML; impact altitude approximated from tower floors"
  },
  ua175: {
    clock: "09:03:11",
    label: "South Tower impact",
    lat: 40.71111111111112,
    lon: -74.01319444444445,
    altitudeFeet: 900,
    confidence: "medium",
    source: "9/11 Commission impact time; WTC 2 coordinate from 911maps KML; impact altitude approximated from tower floors"
  },
  ua93: {
    clock: "10:03:11",
    label: "Shanksville impact",
    lat: 40.052,
    lon: -78.907,
    altitudeFeet: 2188,
    confidence: "medium",
    source: "Public UA93 black-box KML final point; 9/11 Commission impact time"
  }
};

main();

function main() {
  const radarKml = fs.readFileSync(radarKmlPath, "utf8");
  const ua93BlackBoxKml = fs.readFileSync(ua93BlackBoxKmlPath, "utf8");

  const tracks = {
    aa11: appendImpact(extractPublicRadarTrack(radarKml, publicRadarTrackConfigs.aa11), impactSamples.aa11),
    ua175: appendImpact(extractPublicRadarTrack(radarKml, publicRadarTrackConfigs.ua175), impactSamples.ua175),
    ua93: appendImpact(
      extractUa93BlackBoxSamples(ua93BlackBoxKml)
        .filter((sample) => sample.clock >= "08:38:57" && sample.clock <= "10:03:06")
        .map((sample) => compactSample(sample)),
      impactSamples.ua93
    )
  };

  const rawTracks = Object.fromEntries(
    Object.entries(tracks).map(([flightId, samples]) => [
      flightId,
      samples.map((sample) =>
        Array.isArray(sample)
          ? sample
          : [
              sample.clock,
              sample.lat,
              sample.lon,
              sample.altitudeFeet,
              sample.label,
              sample.confidence,
              sample.source
            ]
      )
    ])
  );

  const file = `import type { Confidence, FlightId } from "../types";

export interface PublicFlightTrackSample {
  clock: string;
  label: string;
  lat: number;
  lon: number;
  altitudeFeet: number;
  confidence: Confidence;
  source: string;
}

function extractPublicRadarTrack(kml, config) {
  return extractRadarSamples(kml, config.folderId, config.nextFolderMarker)
    .filter((sample) => sample.clock >= config.startClock && sample.clock <= config.endClock)
    .map((sample) => compactSample(sample));
}

type RawPublicTrackSample =
  | [clock: string, lat: number, lon: number, altitudeFeet: number]
  | [
      clock: string,
      lat: number,
      lon: number,
      altitudeFeet: number,
      label: string,
      confidence: Confidence,
      source: string
    ];

const radarSource = "911maps KMZ DCC radar track compiled from FAA/NTSB public records";
const ua93FdrSource = "911maps UA93 black-box-data KML; derived from public Flight 93 FDR material";

const rawPublicFlightTrackSamples: Record<Exclude<FlightId, "aa77">, RawPublicTrackSample[]> = ${JSON.stringify(rawTracks)};

export const publicFlightTrackSamples: Record<Exclude<FlightId, "aa77">, PublicFlightTrackSample[]> = {
  aa11: expandSamples(rawPublicFlightTrackSamples.aa11, "DCC radar sample", "medium", radarSource),
  ua175: expandSamples(rawPublicFlightTrackSamples.ua175, "DCC radar sample", "medium", radarSource),
  ua93: expandSamples(rawPublicFlightTrackSamples.ua93, "UA93 black-box coordinate sample", "medium", ua93FdrSource)
};

function expandSamples(
  samples: RawPublicTrackSample[],
  defaultLabel: string,
  defaultConfidence: Confidence,
  defaultSource: string
): PublicFlightTrackSample[] {
  return samples.map((sample) => ({
    clock: sample[0],
    lat: sample[1],
    lon: sample[2],
    altitudeFeet: sample[3],
    label: sample[4] ?? defaultLabel,
    confidence: sample[5] ?? defaultConfidence,
    source: sample[6] ?? defaultSource
  }));
}
`;

  fs.writeFileSync(outputPath, file);
  for (const [flightId, samples] of Object.entries(tracks)) {
    console.log(`${flightId}: ${samples.length} samples (${sampleClock(samples[0])} -> ${sampleClock(samples.at(-1))})`);
  }
}

function compactSample(sample) {
  return [sample.clock, sample.lat, sample.lon, sample.altitudeFeet];
}

function sampleClock(sample) {
  return Array.isArray(sample) ? sample[0] : sample.clock;
}

function extractRadarSamples(kml, folderId, nextMarker) {
  const start = kml.indexOf(`<Folder id="${folderId}">`);
  if (start < 0) {
    throw new Error(`Missing folder ${folderId}`);
  }

  const end = kml.indexOf(nextMarker, start + 1);
  const section = kml.slice(start, end > 0 ? end : kml.length);
  const samples = [];

  for (const trackMatch of section.matchAll(/<gx:Track>[\s\S]*?<\/gx:Track>/g)) {
    const track = trackMatch[0];
    const whens = [...track.matchAll(/<when>([^<]+)<\/when>/g)].map((match) => match[1]);
    const coords = [...track.matchAll(/<gx:coord>([^<]+)<\/gx:coord>/g)].map((match) => match[1]);
    const count = Math.min(whens.length, coords.length);

    for (let index = 0; index < count; index += 1) {
      const [lon, lat, altitudeMeters] = coords[index].trim().split(/\s+/).map(Number);
      samples.push({
        clock: clockFromIso(whens[index]),
        lat: round(lat, 6),
        lon: round(lon, 6),
        altitudeFeet: Math.round(altitudeMeters * metersToFeet)
      });
    }
  }

  return dedupeByClock(samples).sort((a, b) => a.clock.localeCompare(b.clock));
}

function extractUa93BlackBoxSamples(kml) {
  const samples = [];

  for (const placemarkMatch of kml.matchAll(/<Placemark>[\s\S]*?<\/Placemark>/g)) {
    const placemark = placemarkMatch[0];
    const when = placemark.match(/<when>([^<]+)<\/when>/)?.[1];
    const coords = placemark.match(/<coordinates>([^<]+)<\/coordinates>/)?.[1];
    if (!when || !coords) {
      continue;
    }

    const [lon, lat, altitudeMeters] = coords.split(",").map(Number);
    samples.push({
      clock: clockFromIso(when),
      lat: round(lat, 6),
      lon: round(lon, 6),
      altitudeFeet: Math.round(altitudeMeters * metersToFeet)
    });
  }

  return dedupeByClock(samples).sort((a, b) => a.clock.localeCompare(b.clock));
}

function appendImpact(samples, impactSample) {
  const withoutDuplicate = samples.filter((sample) => sampleClock(sample) !== impactSample.clock);
  return [...withoutDuplicate, impactSample].sort((a, b) => sampleClock(a).localeCompare(sampleClock(b)));
}

function dedupeByClock(samples) {
  const byClock = new Map();
  for (const sample of samples) {
    if (!byClock.has(sample.clock)) {
      byClock.set(sample.clock, sample);
    }
  }
  return [...byClock.values()];
}

function clockFromIso(value) {
  return value.match(/T(\d{2}:\d{2}:\d{2})Z/)?.[1] ?? value;
}

function round(value, decimals) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
