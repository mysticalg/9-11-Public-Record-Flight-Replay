import * as THREE from "three";
import osmPentagonFootprint from "../data/osmPentagonFootprint.generated.json";

export const southFacadeContactOffsetMeters = 49;
export const impactReferenceHeightMeters = 1.2;

export function evidenceImpactReferencePoint() {
  const anchorPoint = new THREE.Vector3(0, 0, 0);
  const edge = nearestFootprintEdge(anchorPoint);
  const facadePoint = edge ? closestPointOnSegment2d(anchorPoint, edge.start, edge.end) : anchorPoint;

  if (edge) {
    const facadeSouth = new THREE.Vector3(edge.end.x - edge.start.x, 0, edge.end.z - edge.start.z).normalize();
    if (facadeSouth.z < 0) {
      facadeSouth.multiplyScalar(-1);
    }
    facadePoint.addScaledVector(facadeSouth, southFacadeContactOffsetMeters);
  }

  facadePoint.y = impactReferenceHeightMeters;
  return facadePoint;
}

function nearestFootprintEdge(point: THREE.Vector3) {
  let best: FootprintEdgeMatch | null = null;
  const ring = osmPentagonFootprint.outer as Array<{ x: number; z: number }>;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const closest = closestPointOnSegment2d(point, start, end);
    const distance = Math.hypot(point.x - closest.x, point.z - closest.z);
    if (!best || distance < best.distance) {
      best = { distance, start, end };
    }
  }

  return best;
}

interface FootprintEdgeMatch {
  distance: number;
  start: { x: number; z: number };
  end: { x: number; z: number };
}

function closestPointOnSegment2d(
  point: THREE.Vector3,
  segmentStart: { x: number; z: number },
  segmentEnd: { x: number; z: number }
) {
  const dx = segmentEnd.x - segmentStart.x;
  const dz = segmentEnd.z - segmentStart.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0) {
    return new THREE.Vector3(segmentStart.x, 0, segmentStart.z);
  }

  const t = THREE.MathUtils.clamp(
    ((point.x - segmentStart.x) * dx + (point.z - segmentStart.z) * dz) / lengthSquared,
    0,
    1
  );

  return new THREE.Vector3(segmentStart.x + dx * t, 0, segmentStart.z + dz * t);
}
