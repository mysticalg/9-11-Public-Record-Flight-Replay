import type { FlightId } from "../types";

const feetToMeters = 0.3048;

export const pentagonReferenceDimensions = {
  outerSideFeet: 921.6,
  outerSideMeters: 921.6 * feetToMeters,
  heightFeet: 77 + 3.5 / 12,
  heightMeters: (77 + 3.5 / 12) * feetToMeters,
  dimensionSource:
    "NPS National Historic Landmark nomination and public Pentagon dimension references list the outer walls at about 921.6 ft and height at about 77 ft 3.5 in.",
  orientationStatus:
    "Scale is dimension-derived. Rotation/orientation now follows the OSM georeferenced footprint, but the impact reference remains approximate until replaced by surveyed coordinates."
};

export const boeing757200ReferenceDimensions = {
  lengthMeters: 47.3,
  wingspanMeters: 38.0,
  tailHeightMeters: 13.6,
  lengthFeet: 155 + 3 / 12,
  wingspanFeet: 124 + 10 / 12,
  tailHeightFeet: 44 + 6 / 12,
  dimensionSource:
    "Boeing 757-200 general-arrangement dimensions: 47.3 m length, 38.0 m wingspan, and 13.6 m tail height."
};

export const boeing767200ReferenceDimensions = {
  lengthMeters: 48.51,
  wingspanMeters: 47.57,
  tailHeightMeters: 15.85,
  lengthFeet: 159 + 2 / 12,
  wingspanFeet: 156 + 1 / 12,
  tailHeightFeet: 52,
  dimensionSource:
    "Boeing 767-200 general-arrangement dimensions: about 48.5 m length, 47.6 m wingspan, and 15.9 m tail height."
};

export function aircraftReferenceDimensionsForFlight(flightId: FlightId) {
  return flightId === "aa11" || flightId === "ua175"
    ? boeing767200ReferenceDimensions
    : boeing757200ReferenceDimensions;
}

export const PENTAGON_OUTER_RADIUS_M =
  pentagonReferenceDimensions.outerSideMeters / (2 * Math.sin(Math.PI / 5));

export const PENTAGON_HEIGHT_M = pentagonReferenceDimensions.heightMeters;
export const PENTAGON_INNER_RADIUS_M = 82;
export const PENTAGON_RENDER_ROTATION_RAD = Math.PI;
