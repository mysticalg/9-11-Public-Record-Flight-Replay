import * as THREE from "three";
import osmPentagonFootprint from "../data/osmPentagonFootprint.generated.json";
import { trajectoryPoints } from "../data/trajectoryLocked";
import { approximateWgs84ToLocalEnu } from "./coordinateTransforms";
import type { CameraMode } from "../types";

export interface CameraPreset {
  id: CameraMode;
  label: string;
  type: "orbit" | "fixed" | "follow";
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  frustumColor?: number;
  calibration: string;
}

export type CameraFovOverrides = Partial<Record<CameraMode, number>>;

export const cameraFovRange = {
  min: 28,
  max: 86
};

export function effectiveCameraFov(mode: CameraMode, overrides: CameraFovOverrides = {}) {
  const override = overrides[mode];
  const fallback = cameraPresets[mode].fov;
  const value = Number.isFinite(override) ? (override as number) : fallback;
  return Math.min(Math.max(value, cameraFovRange.min), cameraFovRange.max);
}

export function isFovAdjustableCamera(mode: CameraMode) {
  return mode === "security_cam_01" || mode === "security_cam_02" || mode === "split_screen";
}

const siteCenter = new THREE.Vector3(
  (osmPentagonFootprint.bounds.minX + osmPentagonFootprint.bounds.maxX) / 2,
  0,
  (osmPentagonFootprint.bounds.minZ + osmPentagonFootprint.bounds.maxZ) / 2
);
const trajectoryBounds = trajectoryPoints.reduce(
  (bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
    minZ: Math.min(bounds.minZ, point.z),
    maxZ: Math.max(bounds.maxZ, point.z)
  }),
  {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  }
);
const trajectoryCenter = new THREE.Vector3(
  (trajectoryBounds.minX + trajectoryBounds.maxX) / 2,
  Math.max(180, (trajectoryBounds.minY + trajectoryBounds.maxY) / 2),
  (trajectoryBounds.minZ + trajectoryBounds.maxZ) / 2
);
const trajectorySpan = Math.max(
  trajectoryBounds.maxX - trajectoryBounds.minX,
  trajectoryBounds.maxZ - trajectoryBounds.minZ
);
const securityCameraKioskReference = localVectorFromWgs84(38 + 52 / 60 + 16 / 3600, -(77 + 3 / 60 + 29 / 3600), 0);
const securityCameraContactTarget = new THREE.Vector3(-8, 10.5, 49);
const securityCamera1Position = securityCameraKioskReference.clone().add(new THREE.Vector3(-82, 8.2, 24));
const securityCamera2Position = securityCameraKioskReference.clone().add(new THREE.Vector3(-76, 8.4, 14));

export const securityCameraPlacement = {
  source: "User-supplied approximate DMS reference: 38°52'16\"N 77°03'29\"W near the west-wall/south-parking checkpoint.",
  kioskReference: securityCameraKioskReference,
  camera1Position: securityCamera1Position,
  camera2Position: securityCamera2Position,
  contactTarget: securityCameraContactTarget
};

export const cameraPresets: Record<CameraMode, CameraPreset> = {
  free_orbit: {
    id: "free_orbit",
    label: "Free orbit",
    type: "orbit",
    position: siteCenter.clone().add(new THREE.Vector3(-900, 430, -780)),
    target: siteCenter.clone().add(new THREE.Vector3(0, 28, 0)),
    fov: 46,
    calibration: "User-inspection camera, not a source-matched view."
  },
  full_path: {
    id: "full_path",
    label: "Full path",
    type: "orbit",
    position: trajectoryCenter.clone().add(new THREE.Vector3(0, trajectorySpan * 1.9, 1)),
    target: trajectoryCenter.clone().add(new THREE.Vector3(0, 0, 0)),
    fov: 44,
    calibration:
      "User-inspection camera fitted to the decoded FDR replay bounds; not a source-matched view."
  },
  top_down: {
    id: "top_down",
    label: "Top down",
    type: "fixed",
    position: siteCenter.clone().add(new THREE.Vector3(1, 2200, -260)),
    target: siteCenter.clone(),
    fov: 42,
    calibration: "High oblique plan-inspection camera centered on the OSM-derived Pentagon footprint."
  },
  side_elevation: {
    id: "side_elevation",
    label: "Side elevation",
    type: "fixed",
    position: siteCenter.clone().add(new THREE.Vector3(-1260, 260, -980)),
    target: siteCenter.clone().add(new THREE.Vector3(-240, 120, 0)),
    fov: 46,
    calibration: "Analytical side view for altitude and descent profile."
  },
  chase_locked: {
    id: "chase_locked",
    label: "Chase locked",
    type: "follow",
    position: new THREE.Vector3(0, 0, 0),
    target: new THREE.Vector3(0, 0, 0),
    fov: 46,
    calibration: "User-adjustable follow camera; orbit, pan, and zoom affect only the camera while trajectory remains locked."
  },
  wide_aerial: {
    id: "wide_aerial",
    label: "Wide aerial",
    type: "fixed",
    position: siteCenter.clone().add(new THREE.Vector3(-1480, 760, -1220)),
    target: siteCenter.clone().add(new THREE.Vector3(0, 45, 0)),
    fov: 46,
    calibration: "Context camera centered on the OSM-derived Pentagon footprint."
  },
  ground_reference: {
    id: "ground_reference",
    label: "Ground reference",
    type: "fixed",
    position: new THREE.Vector3(-520, 18, -355),
    target: new THREE.Vector3(-175, 12, -22),
    fov: 50,
    calibration: "Ground reference camera, approximate."
  },
  security_cam_01: {
    id: "security_cam_01",
    label: "Security Camera 1",
    type: "fixed",
    position: securityCamera1Position,
    target: securityCameraContactTarget,
    fov: 55,
    frustumColor: 0xc9f0bc,
    calibration:
      "Best-fit estimate from the released Pentagon parking-camera footage: low checkpoint/kiosk camera near the west wall and south parking/heliport area, looking toward the west-facade impact zone. Exact surveyed coordinates, view angle, and lens model are still not public."
  },
  security_cam_02: {
    id: "security_cam_02",
    label: "Security Camera 2",
    type: "fixed",
    position: securityCamera2Position,
    target: securityCameraContactTarget.clone().add(new THREE.Vector3(4, -0.2, -4)),
    fov: 52,
    frustumColor: 0x94d4ff,
    calibration:
      "Adjacent best-fit estimate for the second released checkpoint/kiosk camera view in the same west-wall/south-parking area, offset slightly from Camera 1 with a narrower default FOV."
  },
  split_screen: {
    id: "split_screen",
    label: "Split comparison",
    type: "fixed",
    position: securityCamera1Position,
    target: securityCameraContactTarget,
    fov: 55,
    frustumColor: 0xc9f0bc,
    calibration:
      "Side-by-side review mode using the Security Camera 1 best-fit estimate. Timing and lens calibration remain approximate."
  }
};

function localVectorFromWgs84(lat: number, lon: number, heightMeters: number) {
  const local = approximateWgs84ToLocalEnu(
    { lat, lon, altMeters: heightMeters },
    {
      lat: osmPentagonFootprint.coordinateSystem.anchor.lat,
      lon: osmPentagonFootprint.coordinateSystem.anchor.lon,
      altMeters: 0
    }
  );
  return new THREE.Vector3(local.east, local.up, -local.north);
}
