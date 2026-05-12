export interface Wgs84Point {
  lat: number;
  lon: number;
  altMeters: number;
}

export interface EnuPoint {
  east: number;
  north: number;
  up: number;
}

const earthRadiusMeters = 6378137;

export function approximateWgs84ToLocalEnu(point: Wgs84Point, anchor: Wgs84Point): EnuPoint {
  const latRad = degreesToRadians(anchor.lat);
  const dLat = degreesToRadians(point.lat - anchor.lat);
  const dLon = degreesToRadians(point.lon - anchor.lon);

  return {
    east: dLon * earthRadiusMeters * Math.cos(latRad),
    north: dLat * earthRadiusMeters,
    up: point.altMeters - anchor.altMeters
  };
}

export function approximateLocalEnuToWgs84(point: EnuPoint, anchor: Wgs84Point): Wgs84Point {
  const latRad = degreesToRadians(anchor.lat);

  return {
    lat: anchor.lat + radiansToDegrees(point.north / earthRadiusMeters),
    lon: anchor.lon + radiansToDegrees(point.east / (earthRadiusMeters * Math.cos(latRad))),
    altMeters: anchor.altMeters + point.up
  };
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}
