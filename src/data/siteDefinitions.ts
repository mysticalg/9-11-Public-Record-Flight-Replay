import type { FlightId, SiteId } from "../types";

export interface GeoPoint2d {
  lat: number;
  lon: number;
}

export interface SiteDefinition {
  id: SiteId;
  label: string;
  shortLabel: string;
  center: GeoPoint2d;
  highDetailZoom: number;
  highDetailPaddingMeters: number;
  regionalZoom: number;
  regionalPaddingMeters: number;
  caveat: string;
  source: string;
}

export interface WtcTowerDefinition {
  id: "wtc1" | "wtc2";
  label: string;
  flightId: Extract<FlightId, "aa11" | "ua175">;
  heightFeet: number;
  heightMeters: number;
  impactAltitudeFeet: number;
  impactLabel: string;
  footprint: GeoPoint2d[];
  source: string;
}

export interface WtcImpactAttitudeDefinition {
  flightId: Extract<FlightId, "aa11" | "ua175">;
  label: string;
  impactSpeedMph: number;
  verticalApproachDeg: number;
  fuselageNoseUpRelativeDeg: number;
  yawOffsetRelativeToPathDeg: number;
  leftWingDownRollDeg: number;
  blendLeadSeconds: number;
  source: string;
}

const feetToMeters = 0.3048;

export const siteDefinitions: Record<SiteId, SiteDefinition> = {
  pentagon: {
    id: "pentagon",
    label: "Pentagon impact site",
    shortLabel: "Pentagon",
    center: { lat: 38.871861, lon: -77.056267 },
    highDetailZoom: 17,
    highDetailPaddingMeters: 820,
    regionalZoom: 8,
    regionalPaddingMeters: 2800,
    caveat:
      "Pentagon placement uses the OSM footprint and local public-record visualization anchor already loaded by the app.",
    source: "OSM Pentagon footprint, ASCE/NTSB public-record context, Esri World Imagery"
  },
  wtc: {
    id: "wtc",
    label: "World Trade Center impact site",
    shortLabel: "WTC",
    center: { lat: 40.71162, lon: -74.01314 },
    highDetailZoom: 17,
    highDetailPaddingMeters: 1500,
    regionalZoom: 9,
    regionalPaddingMeters: 2400,
    caveat:
      "WTC towers are scale-correct native massing from public dimensions and bundled 911maps footprint coordinates; impact bands are visual references, not structural simulation.",
    source: "911maps WTC exterior-box coordinates, NIST public tower dimensions, Esri World Imagery"
  },
  shanksville: {
    id: "shanksville",
    label: "Flight 93 crash site near Shanksville",
    shortLabel: "Shanksville",
    center: { lat: 40.052, lon: -78.907 },
    highDetailZoom: 17,
    highDetailPaddingMeters: 900,
    regionalZoom: 8,
    regionalPaddingMeters: 2600,
    caveat:
      "Shanksville context is satellite plus marker only in this pass; no terrain, witness, or damage-model geometry is added.",
    source: "Public UA93 black-box KML endpoint, 9/11 Commission/NPS timeline context, Esri World Imagery"
  }
};

export const flightTerminalSite: Record<FlightId, SiteId> = {
  aa11: "wtc",
  ua175: "wtc",
  aa77: "pentagon",
  ua93: "shanksville"
};

export const wtcTowerDefinitions: WtcTowerDefinition[] = [
  {
    id: "wtc1",
    label: "WTC 1 / North Tower",
    flightId: "aa11",
    heightFeet: 1368,
    heightMeters: 1368 * feetToMeters,
    impactAltitudeFeet: 1300,
    impactLabel: "AA11 impact band",
    footprint: [
      { lon: -74.0130536925568, lat: 40.7117579293522 },
      { lon: -74.0137142874914, lat: 40.7120353397477 },
      { lon: -74.0133483091647, lat: 40.7125360704606 },
      { lon: -74.01268771078711, lat: 40.7122586579789 }
    ],
    source: "911maps WTC1 208 ft 10 in exterior box; NIST tower height"
  },
  {
    id: "wtc2",
    label: "WTC 2 / South Tower",
    flightId: "ua175",
    heightFeet: 1362,
    heightMeters: 1362 * feetToMeters,
    impactAltitudeFeet: 900,
    impactLabel: "UA175 impact band",
    footprint: [
      { lon: -74.0129578589806, lat: 40.7106616282447 },
      { lon: -74.0136184426395, lat: 40.7109390391865 },
      { lon: -74.0132524696178, lat: 40.7114397695968 },
      { lon: -74.01259188251591, lat: 40.7111623565688 }
    ],
    source: "911maps WTC2 208 ft 10 in exterior box; NIST tower height"
  }
];

export const wtcImpactAttitudeDefinitions: Record<
  Extract<FlightId, "aa11" | "ua175">,
  WtcImpactAttitudeDefinition
> = {
  aa11: {
    flightId: "aa11",
    label: "AA11 WTC 1 impact attitude",
    impactSpeedMph: 443,
    verticalApproachDeg: -10.6,
    fuselageNoseUpRelativeDeg: 2,
    yawOffsetRelativeToPathDeg: 0,
    leftWingDownRollDeg: 25,
    blendLeadSeconds: 70,
    source:
      "NIST NCSTAR 1-2 Table E-8 refined aircraft impact conditions: AA11 speed 443 mph, 10.6 deg below horizontal, 25 deg left-wing-down roll."
  },
  ua175: {
    flightId: "ua175",
    label: "UA175 WTC 2 impact attitude",
    impactSpeedMph: 542,
    verticalApproachDeg: -6,
    fuselageNoseUpRelativeDeg: 1,
    yawOffsetRelativeToPathDeg: -3,
    leftWingDownRollDeg: 38,
    blendLeadSeconds: 70,
    source:
      "NIST NCSTAR 1-2 Table E-8 refined aircraft impact conditions: UA175 speed 542 mph, 6 deg below horizontal, -3 deg fuselage yaw relative to trajectory, 38 deg left-wing-down roll."
  }
};

export function terminalSiteForFlight(flightId: FlightId) {
  return siteDefinitions[flightTerminalSite[flightId]];
}
