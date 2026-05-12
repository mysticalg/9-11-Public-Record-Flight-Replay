import type { CameraMode } from "../types";

export interface CameraCalibrationRecord {
  id: CameraMode;
  label: string;
  publicLocation: string;
  publishedCoordinates: string;
  publishedViewAngle: string;
  publishedFov: string;
  currentTransformStatus: string;
  evidence: string[];
  nextCalibrationStep: string;
}

const publicCameraLimit =
  "No surveyed camera coordinates, lens model, yaw/pitch/roll, or exact FOV were found in the public sources currently loaded into this project.";

export const cameraCalibrationRecords: Partial<Record<CameraMode, CameraCalibrationRecord>> = {
  security_cam_01: {
    id: "security_cam_01",
    label: "Security Camera 1",
    publicLocation:
      "Public descriptions and Wikimedia mirrors identify the released frames as Pentagon security/parking-camera footage. The app now uses the west-wall/south-parking checkpoint reference provided in this session rather than the older northwest-gate placeholder.",
    publishedCoordinates:
      "Approximate working reference: 38°52'16\"N 77°03'29\"W. This DMS-level coordinate is treated as a checkpoint/kiosk reference, not surveyed camera hardware.",
    publishedViewAngle: publicCameraLimit,
    publishedFov: publicCameraLimit,
    currentTransformStatus:
      "Current app transform is a best-fit low camera placed just west of the west-wall/south-parking checkpoint reference, looking toward the facade contact/collapse zone. It is not a public exact camera location.",
    evidence: [
      "User-supplied approximate checkpoint reference: 38°52'16\"N 77°03'29\"W near the heliport/south parking and west wall.",
      "DoD/Judicial Watch 2006 release, mirrored by Wikimedia Commons as Pentagon Security Camera 1.",
      "Frame cues used for the estimate: gate post spacing in the foreground, visible curb arc, west-facade edge on the left, low camera height, and fireball position high/right in the released frame."
    ],
    nextCalibrationStep:
      "Calibrate from still frames by matching visible gate posts, curb arc, facade edge, horizon, and explosion/fireball frame timing against a georeferenced site model."
  },
  security_cam_02: {
    id: "security_cam_02",
    label: "Security Camera 2",
    publicLocation:
      "Second Pentagon parking/security camera view from the same released sequence. The app treats it as adjacent to Camera 1 at the same west-wall/south-parking checkpoint area.",
    publishedCoordinates:
      "Approximate working reference shares the Camera 1 checkpoint/kiosk reference: 38°52'16\"N 77°03'29\"W; physical separation is estimated.",
    publishedViewAngle: publicCameraLimit,
    publishedFov: publicCameraLimit,
    currentTransformStatus:
      "Current app transform is an adjacent best-fit estimate for the second checkpoint/kiosk camera view, offset slightly from Camera 1 and using a narrower default FOV. It is not a public exact camera location.",
    evidence: [
      "DoD/Judicial Watch 2006 release, mirrored by Wikimedia Commons as Pentagon Security Camera 2.",
      "Loaded public metadata gives the footage source, date, and ownership, but not surveyed camera hardware or lens parameters.",
      "Frame cues used for the estimate: similar gate-lane foreground geometry with slightly different alignment against facade and fireball."
    ],
    nextCalibrationStep:
      "Run a separate photogrammetry pass using extracted frames from both released videos and the same georeferenced gate/facade control points."
  },
  split_screen: {
    id: "split_screen",
    label: "Split comparison",
    publicLocation:
      "Uses the current Security Camera 1 placeholder for the rendered side and the public video for comparison.",
    publishedCoordinates: publicCameraLimit,
    publishedViewAngle: publicCameraLimit,
    publishedFov: publicCameraLimit,
    currentTransformStatus:
      "Comparison mode only. It is useful for spotting mismatches, not for claiming calibration.",
    evidence: [
      "Rendered side uses the current placeholder camera.",
      "Original side uses the public-domain Pentagon Security Camera 1 footage by default."
    ],
    nextCalibrationStep:
      "After calibration, replace the placeholder transform with a documented derived estimate and show residual pixel error."
  }
};
