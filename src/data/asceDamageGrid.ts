export const ASCE_FT_TO_M = 0.3048;

export type AsceFacadeColumnStatus =
  | "reference"
  | "opening_extent"
  | "removed"
  | "severely_damaged"
  | "second_floor_gash";

export interface AsceFacadeColumnLine {
  line: number;
  offsetFtFromCl14: number;
  status: AsceFacadeColumnStatus;
  label?: string;
}

export interface AsceInteriorColumnReference {
  id: string;
  pathFt: number;
  lateralFt: number;
  status: "distorted_standing" | "damaged_standing" | "last_severed" | "ring_c_exit";
  label: string;
}

export interface AsceDamageRegion {
  id: string;
  label: string;
  pathStartFt: number;
  pathEndFt: number;
  lateralMinFt: number;
  lateralMaxFt: number;
}

export const asceDamageGrid = {
  sourceLabel: "ASCE/SEI Pentagon Building Performance Report, Figures 6.2, 6.3, and 6.6",
  impactColumnLine: 14,
  columnSpacingFt: 10,
  damageAngleDegFromFacadeNormal: 42,
  seriousDamageSwath: {
    widthFt: 78,
    lengthFt: 230,
    label: "ASCE serious first-story damage swath: 75-80 ft wide by 230 ft long"
  },
  severeDamageTriangle: {
    baseWidthFt: 90,
    lengthFt: 230,
    label: "ASCE very severe first-story damage triangle: 90 ft base by 230 ft length"
  },
  facadeDamage: {
    severeFromColumnLine: 8,
    severeToColumnLine: 20,
    openingFromColumnLine: 8,
    openingToColumnLine: 18,
    projectedWidthFt: 90,
    facadeWidthFt: 120
  },
  ringCExit: {
    distanceFt: 310,
    betweenColumnLines: [5, 7],
    label: "Ring C / AE Drive hole between CL5 and CL7, about 310 ft from entry"
  },
  facadeColumns: [
    { line: 8, offsetFtFromCl14: -60, status: "opening_extent", label: "CL8 north opening edge" },
    { line: 9, offsetFtFromCl14: -50, status: "severely_damaged" },
    { line: 10, offsetFtFromCl14: -40, status: "removed" },
    { line: 11, offsetFtFromCl14: -30, status: "removed", label: "CL11 expansion joint" },
    { line: 12, offsetFtFromCl14: -20, status: "removed" },
    { line: 13, offsetFtFromCl14: -10, status: "removed" },
    { line: 14, offsetFtFromCl14: 0, status: "removed", label: "CL14 fuselage entry" },
    { line: 15, offsetFtFromCl14: 10, status: "severely_damaged" },
    { line: 16, offsetFtFromCl14: 20, status: "severely_damaged" },
    { line: 17, offsetFtFromCl14: 30, status: "severely_damaged" },
    { line: 18, offsetFtFromCl14: 40, status: "opening_extent", label: "CL18 south opening edge" },
    { line: 19, offsetFtFromCl14: 50, status: "second_floor_gash" },
    { line: 20, offsetFtFromCl14: 60, status: "second_floor_gash", label: "CL20 south severe-facade extent" }
  ] satisfies AsceFacadeColumnLine[],
  interiorColumnReferences: [
    {
      id: "9C",
      pathFt: 65,
      lateralFt: -14,
      status: "distorted_standing",
      label: "9C distorted, standing"
    },
    {
      id: "11D",
      pathFt: 65,
      lateralFt: 14,
      status: "distorted_standing",
      label: "11D distorted, standing"
    },
    {
      id: "3G",
      pathFt: 160,
      lateralFt: -21,
      status: "damaged_standing",
      label: "3G damaged, standing"
    },
    {
      id: "3H",
      pathFt: 160,
      lateralFt: -7,
      status: "damaged_standing",
      label: "3H damaged, standing"
    },
    {
      id: "3J",
      pathFt: 160,
      lateralFt: 7,
      status: "damaged_standing",
      label: "3J damaged, standing"
    },
    {
      id: "5J",
      pathFt: 160,
      lateralFt: 21,
      status: "damaged_standing",
      label: "5J damaged, standing"
    },
    {
      id: "1K",
      pathFt: 200,
      lateralFt: 0,
      status: "last_severed",
      label: "1K last severed column"
    },
    {
      id: "Ring C",
      pathFt: 310,
      lateralFt: 0,
      status: "ring_c_exit",
      label: "AE Drive hole, CL5-CL7"
    }
  ] satisfies AsceInteriorColumnReference[],
  damageRegions: [
    {
      id: "collapse-entry-area",
      label: "Area 1: collapse / first 60 ft",
      pathStartFt: 0,
      pathEndFt: 80,
      lateralMinFt: -30,
      lateralMaxFt: 28
    },
    {
      id: "e5g9-area",
      label: "Area 2: approx E-5-G-9",
      pathStartFt: 112,
      pathEndFt: 172,
      lateralMinFt: -8,
      lateralMaxFt: 32
    }
  ] satisfies AsceDamageRegion[],
  distanceStationsFt: [65, 160, 200, 230, 310]
} as const;
