import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceOutPath = resolve(root, "sources/site-context-overpass.json");
const outPath = resolve(root, "src/data/siteContext.generated.json");

const anchor = {
  label: "Approximate west-facade impact reference used as local origin",
  lat: 38.87135975,
  lon: -77.05817382
};

const terrainRadiusMeters = 1700;
const terrainGridSegments = 28;
const overpassRadiusMeters = 1750;
const metersPerFoot = 0.3048;

const overpassData = await fetchOverpassWithCache();
writeFileSync(sourceOutPath, `${JSON.stringify(overpassData, null, 2)}\n`);

const roads = parseRoads(overpassData);
const osmTrees = parsePointFeatures(overpassData, (element) => element.tags?.natural === "tree").map((tree, index) => ({
  ...tree,
  id: tree.id ?? `osm-tree-${index}`,
  heightMeters: estimatedTreeHeightMeters(tree.tags),
  source: "osm_natural_tree"
}));
const generatedTrees = generateApproximateTrees(roads);
const streetLamps = [
  ...parsePointFeatures(overpassData, (element) => element.tags?.highway === "street_lamp").map((lamp, index) => ({
    ...lamp,
    id: lamp.id ?? `osm-street-lamp-${index}`,
    heightMeters: 9,
    source: "osm_highway_street_lamp"
  })),
  ...generateApproximateStreetLights(roads)
];
const terrain = await sampleTerrain();
const terrainBaseElevationMeters = terrain.baseElevationMeters;

const output = {
  id: "pentagon_public_site_context",
  generatedAt: new Date().toISOString(),
  source: {
    roadsAndObjects: {
      provider: "OpenStreetMap via Overpass API",
      queryResult: "sources/site-context-overpass.json",
      license: "OpenStreetMap data is available under the Open Database License.",
      caveat:
        "OSM road centerlines and tagged point objects are public map features, not engineering survey data. Generated tree and street-light rows are approximate visual scale cues placed along mapped roads."
    },
    terrain: {
      provider: "OpenTopoData NED 10m elevation API using USGS National Elevation Dataset / 3DEP-derived data",
      endpoint: "https://api.opentopodata.org/v1/ned10m",
      units: "meters",
      caveat:
        "Elevation samples are coarse site-context relief. Roads and objects are elevated against this sampled terrain, not against bridge design drawings or lane-level LiDAR."
    }
  },
  coordinateSystem: {
    world: "local East/North/Up meters rendered as x=east, y=up, z=-north",
    anchor,
    elevationBase: "terrain z/y values are relative to the median sampled terrain elevation near the Pentagon"
  },
  terrain,
  terrainBaseElevationMeters,
  roads,
  trees: [...osmTrees, ...generatedTrees],
  streetLamps
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `Wrote ${roads.length} roads, ${output.trees.length} trees, ${streetLamps.length} lamps, and ${terrain.samples.length} terrain samples to ${outPath}`
);

async function fetchOverpassWithCache() {
  try {
    return await fetchOverpass();
  } catch (error) {
    if (existsSync(sourceOutPath)) {
      console.warn(`Overpass request failed; using cached ${sourceOutPath}. ${error.message}`);
      return JSON.parse(readFileSync(sourceOutPath, "utf8"));
    }

    throw error;
  }
}

async function fetchOverpass() {
  const query = `
    [out:json][timeout:60];
    (
      way["highway"](around:${overpassRadiusMeters},${anchor.lat},${anchor.lon});
      node["highway"="street_lamp"](around:${overpassRadiusMeters},${anchor.lat},${anchor.lon});
      node["natural"="tree"](around:${overpassRadiusMeters},${anchor.lat},${anchor.lon});
    );
    out tags geom;
  `;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "Pentaboom historical visualization data generator"
    },
    body: new URLSearchParams({ data: query })
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status} ${response.statusText}: ${await response.text()}`);
  }

  return response.json();
}

function parseRoads(data) {
  const renderedHighwayTypes = new Set([
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "residential",
    "unclassified",
    "service",
    "pedestrian"
  ]);

  return data.elements
    .filter((element) => element.type === "way" && element.tags?.highway && Array.isArray(element.geometry))
    .map((element) => {
      const points = element.geometry.map((point) => {
        const world = geoToWorld(point.lat, point.lon);
        return {
          lat: round(point.lat, 7),
          lon: round(point.lon, 7),
          x: round(world.x, 2),
          z: round(world.z, 2)
        };
      });
      return {
        id: String(element.id),
        name: element.tags.name ?? null,
        ref: element.tags.ref ?? null,
        highway: element.tags.highway,
        layer: numberOrZero(element.tags.layer),
        bridge: element.tags.bridge === "yes" || element.tags.man_made === "bridge",
        tunnel: element.tags.tunnel === "yes",
        lanes: integerOrNull(element.tags.lanes),
        widthMeters: roadWidthMeters(element.tags),
        lengthMeters: round(polylineLength(points), 1),
        points
      };
    })
    .filter(
      (road) =>
        renderedHighwayTypes.has(road.highway) &&
        road.points.length > 1 &&
        road.lengthMeters >= (road.highway === "service" ? 18 : 10)
    );
}

function parsePointFeatures(data, predicate) {
  return data.elements
    .filter((element) => element.type === "node" && predicate(element))
    .map((element) => {
      const world = geoToWorld(element.lat, element.lon);
      return {
        id: String(element.id),
        lat: round(element.lat, 7),
        lon: round(element.lon, 7),
        x: round(world.x, 2),
        z: round(world.z, 2),
        tags: element.tags ?? {}
      };
    });
}

async function sampleTerrain() {
  const samples = [];
  const locations = [];
  const latStep = metersToLatitudeDegrees((terrainRadiusMeters * 2) / terrainGridSegments);
  const lonStep = metersToLongitudeDegrees((terrainRadiusMeters * 2) / terrainGridSegments, anchor.lat);
  const minLat = anchor.lat - metersToLatitudeDegrees(terrainRadiusMeters);
  const minLon = anchor.lon - metersToLongitudeDegrees(terrainRadiusMeters, anchor.lat);

  for (let row = 0; row <= terrainGridSegments; row += 1) {
    for (let col = 0; col <= terrainGridSegments; col += 1) {
      const lat = minLat + row * latStep;
      const lon = minLon + col * lonStep;
      const world = geoToWorld(lat, lon);
      locations.push({
        row,
        col,
        lat: round(lat, 7),
        lon: round(lon, 7),
        x: round(world.x, 2),
        z: round(world.z, 2)
      });
    }
  }

  const elevations = await fetchElevationGrid(locations);
  locations.forEach((location, index) => {
    samples.push({
      ...location,
      elevationMeters: round(elevations[index], 2)
    });
  });

  const sortedElevations = samples
    .map((sample) => sample.elevationMeters)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const baseElevationMeters = sortedElevations[Math.floor(sortedElevations.length / 2)] ?? 0;

  return {
    radiusMeters: terrainRadiusMeters,
    gridSegments: terrainGridSegments,
    sampleCount: samples.length,
    baseElevationMeters: round(baseElevationMeters, 2),
    minElevationMeters: round(sortedElevations[0] ?? baseElevationMeters, 2),
    maxElevationMeters: round(sortedElevations[sortedElevations.length - 1] ?? baseElevationMeters, 2),
    samples: samples.map((sample) => ({
      ...sample,
      relativeMeters: round(sample.elevationMeters - baseElevationMeters, 2)
    }))
  };
}

async function fetchElevationGrid(locations) {
  const elevations = [];
  const batchSize = 80;

  for (let start = 0; start < locations.length; start += batchSize) {
    const batch = locations.slice(start, start + batchSize);
    const url = new URL("https://api.opentopodata.org/v1/ned10m");
    url.searchParams.set("locations", batch.map((location) => `${location.lat},${location.lon}`).join("|"));
    let batchResults = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, { headers: { "user-agent": "Pentaboom historical visualization data generator" } });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.status !== "OK" || !Array.isArray(data.results)) {
          throw new Error(data.error ?? `Unexpected elevation response: ${data.status}`);
        }

        batchResults = data.results;
        break;
      } catch (error) {
        if (attempt === 2) {
          throw new Error(`OpenTopoData elevation batch failed at index ${start}: ${error.message}`);
        }
        await delay(600 + attempt * 900);
      }
    }

    batchResults.forEach((result, index) => {
      const fallback = elevations.at(-1) ?? 0;
      const elevation = Number(result.elevation);
      elevations.push(Number.isFinite(elevation) ? elevation : fallback);
      if (index === batchResults.length - 1) {
        process.stdout.write(".");
      }
    });

    await delay(220);
  }

  process.stdout.write("\n");
  return elevations;
}

async function fetchElevationMetersFromUsgsEpqs(lat, lon) {
  const url = new URL("https://epqs.nationalmap.gov/v1/json");
  url.searchParams.set("x", String(lon));
  url.searchParams.set("y", String(lat));
  url.searchParams.set("units", "Meters");
  url.searchParams.set("wkid", "4326");
  url.searchParams.set("includeDate", "false");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const elevation = Number(data?.value ?? data?.USGS_Elevation_Point_Query_Service?.Elevation_Query?.Elevation);
      if (Number.isFinite(elevation) && elevation > -100000) {
        return elevation;
      }
    } catch (error) {
      if (attempt === 2) {
        throw new Error(`USGS elevation request failed for ${lat}, ${lon}: ${error.message}`);
      }
    }
    await delay(120 + attempt * 180);
  }

  return 0;
}

function generateApproximateTrees(roads) {
  const trees = [];
  const roadCandidates = roads.filter((road) =>
    ["primary", "secondary", "tertiary", "residential", "service"].includes(road.highway)
  );

  for (const road of roadCandidates) {
    const sampled = samplePolyline(road.points, road.highway === "service" ? 110 : 150);
    sampled.forEach((sample, index) => {
      if ((index + road.id.length) % 3 !== 0) {
        return;
      }

      const side = index % 2 === 0 ? 1 : -1;
      const offset = road.widthMeters / 2 + 12 + ((index * 7) % 9);
      const point = offsetFromRoadSample(sample, side * offset);
      if (Math.hypot(point.x, point.z) > terrainRadiusMeters * 0.95) {
        return;
      }

      trees.push({
        id: `approx-tree-${road.id}-${index}`,
        x: round(point.x, 2),
        z: round(point.z, 2),
        heightMeters: round(9 + ((index * 5) % 8), 1),
        source: "approx_from_visible_landscape_and_osm_road_edges"
      });
    });
  }

  return trees.slice(0, 170);
}

function generateApproximateStreetLights(roads) {
  const lamps = [];
  const majorRoads = roads.filter((road) =>
    ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary"].includes(road.highway)
  );

  for (const road of majorRoads) {
    const spacing = road.highway.includes("link") ? 70 : 82;
    samplePolyline(road.points, spacing).forEach((sample, index) => {
      const side = index % 2 === 0 ? 1 : -1;
      const point = offsetFromRoadSample(sample, side * (road.widthMeters / 2 + 3.5));
      if (Math.hypot(point.x, point.z) > terrainRadiusMeters) {
        return;
      }

      lamps.push({
        id: `approx-lamp-${road.id}-${index}`,
        x: round(point.x, 2),
        z: round(point.z, 2),
        heightMeters: road.highway.includes("motorway") || road.highway.includes("trunk") ? 11 : 9,
        source: "approx_from_osm_road_edges"
      });
    });
  }

  return lamps.slice(0, 260);
}

function samplePolyline(points, spacingMeters) {
  const samples = [];
  let carried = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.1) {
      continue;
    }

    let distance = spacingMeters - carried;
    while (distance <= length) {
      const alpha = distance / length;
      const x = start.x + dx * alpha;
      const z = start.z + dz * alpha;
      const tangentX = dx / length;
      const tangentZ = dz / length;
      samples.push({ x, z, tangentX, tangentZ });
      distance += spacingMeters;
    }

    carried = length - (distance - spacingMeters);
  }

  return samples;
}

function offsetFromRoadSample(sample, offsetMeters) {
  return {
    x: sample.x - sample.tangentZ * offsetMeters,
    z: sample.z + sample.tangentX * offsetMeters
  };
}

function roadWidthMeters(tags) {
  const explicit = parseLengthMeters(tags.width);
  if (Number.isFinite(explicit)) {
    return round(explicit, 1);
  }

  const lanes = integerOrNull(tags.lanes);
  if (lanes) {
    return round(Math.max(lanes * 3.6 + 2.2, 5.5), 1);
  }

  const defaults = {
    motorway: 15,
    trunk: 13,
    primary: 11,
    secondary: 9.5,
    tertiary: 8,
    motorway_link: 7.5,
    trunk_link: 7.2,
    primary_link: 7,
    service: 5.2,
    residential: 6.5,
    footway: 2.2,
    path: 1.8,
    cycleway: 2.4
  };

  return defaults[tags.highway] ?? 5.5;
}

function polylineLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].z - points[index].z);
  }
  return length;
}

function parseLengthMeters(value) {
  if (!value) {
    return Number.NaN;
  }

  const normalized = String(value).trim().toLowerCase();
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number)) {
    return Number.NaN;
  }

  return normalized.includes("ft") || normalized.includes("'") ? number * metersPerFoot : number;
}

function estimatedTreeHeightMeters(tags) {
  const height = parseLengthMeters(tags?.height);
  if (Number.isFinite(height)) {
    return round(height, 1);
  }

  const circumference = parseLengthMeters(tags?.circumference);
  if (Number.isFinite(circumference)) {
    return round(Math.min(Math.max(circumference * 5, 6), 22), 1);
  }

  return 12;
}

function geoToWorld(lat, lon) {
  const earthRadius = 6378137;
  const anchorLatRad = degToRad(anchor.lat);
  return {
    x: degToRad(lon - anchor.lon) * earthRadius * Math.cos(anchorLatRad),
    z: -degToRad(lat - anchor.lat) * earthRadius
  };
}

function metersToLatitudeDegrees(meters) {
  return (meters / 6378137) * (180 / Math.PI);
}

function metersToLongitudeDegrees(meters, latitude) {
  return (meters / (6378137 * Math.cos(degToRad(latitude)))) * (180 / Math.PI);
}

function integerOrNull(value) {
  const integer = Number.parseInt(value, 10);
  return Number.isFinite(integer) ? integer : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
