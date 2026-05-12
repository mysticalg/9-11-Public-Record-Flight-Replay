import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const inPath = resolve(root, "sources/osm-pentagon-overpass.json");
const outPath = resolve(root, "src/data/osmPentagonFootprint.generated.json");

const anchor = {
  label: "Approximate west-facade impact reference used as local origin",
  // OSM west-facade intersection of the final decoded FDR approach segment. This is a
  // visualization anchor, not a surveyed impact coordinate.
  lat: 38.87135975,
  lon: -77.05817382
};

const data = JSON.parse(readFileSync(inPath, "utf8"));
const nodes = new Map(data.elements.filter((element) => element.type === "node").map((node) => [node.id, node]));
const ways = new Map(data.elements.filter((element) => element.type === "way").map((way) => [way.id, way]));
const building = data.elements.find((element) => element.type === "relation" && element.id === 89605);

if (!building) {
  throw new Error("Pentagon building relation 89605 was not found in the Overpass export.");
}

const outerMember = building.members.find((member) => member.role === "outer");
const innerMembers = building.members.filter((member) => member.role === "inner");

if (!outerMember) {
  throw new Error("Pentagon building relation does not contain an outer member.");
}

const innerRings = innerMembers
  .map((member) => ({ id: member.ref, points: wayToLocalPoints(ways.get(member.ref)) }))
  .map((ring) => ({ ...ring, area: Math.abs(signedArea(ring.points)) }))
  .sort((a, b) => b.area - a.area);

const outer = wayToLocalPoints(ways.get(outerMember.ref));
const courtyard = innerRings[0];
const allPoints = [...outer, ...courtyard.points];

const output = {
  id: "osm_pentagon_building_relation_89605",
  generatedAt: new Date().toISOString(),
  source: {
    provider: "OpenStreetMap via Overpass API",
    queryResult: "sources/osm-pentagon-overpass.json",
    relation: "https://www.openstreetmap.org/relation/89605",
    license: "OpenStreetMap data is available under the Open Database License.",
    caveat:
      "This footprint is public map geometry, not a surveyed construction drawing. It replaces hand-placed massing for scale and orientation sanity checks."
  },
  coordinateSystem: {
    world: "local East/North/Up meters rendered as x=east, y=up, z=-north",
    anchor
  },
  bounds: bounds(allPoints),
  outer,
  courtyard: courtyard.points
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote Pentagon OSM footprint to ${outPath}`);

function wayToLocalPoints(way) {
  if (!way) {
    throw new Error("Referenced way missing from Overpass export.");
  }

  const points = way.nodes.map((nodeId) => {
    const node = nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} missing from Overpass export.`);
    }

    const local = wgs84ToLocalMeters(node.lat, node.lon, anchor.lat, anchor.lon);
    return {
      lat: round(node.lat, 7),
      lon: round(node.lon, 7),
      x: round(local.east, 3),
      z: round(-local.north, 3)
    };
  });

  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.lat === last.lat && first.lon === last.lon) {
      points.pop();
    }
  }

  return points;
}

function wgs84ToLocalMeters(lat, lon, anchorLat, anchorLon) {
  const earthRadius = 6378137;
  const latRad = degToRad(anchorLat);
  return {
    east: degToRad(lon - anchorLon) * earthRadius * Math.cos(latRad),
    north: degToRad(lat - anchorLat) * earthRadius
  };
}

function bounds(points) {
  return points.reduce(
    (box, point) => ({
      minX: round(Math.min(box.minX, point.x), 3),
      maxX: round(Math.max(box.maxX, point.x), 3),
      minZ: round(Math.min(box.minZ, point.z), 3),
      maxZ: round(Math.max(box.maxZ, point.z), 3)
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  );
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.z - next.x * points[index].z;
  }
  return area / 2;
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
