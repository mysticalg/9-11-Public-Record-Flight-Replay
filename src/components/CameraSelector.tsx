import { Camera, RotateCcw, ScanEye } from "lucide-react";
import { cameraCalibrationRecords } from "../data/cameraCalibration";
import { terminalSiteForFlight } from "../data/siteDefinitions";
import {
  cameraFovRange,
  cameraPresets,
  effectiveCameraFov,
  isFovAdjustableCamera
} from "../engine/cameraPresets";
import { useReplayStore } from "../store/replayStore";
import type { CameraMode, SiteId } from "../types";

const cameraOptions: Array<{ id: CameraMode; label: string; note: string }> = [
  { id: "free_orbit", label: "Free orbit", note: "Inspect without changing trajectory" },
  { id: "full_path", label: "Full path", note: "Fit entire FDR path" },
  { id: "top_down", label: "Top down", note: "Plan view over site" },
  { id: "side_elevation", label: "Side elevation", note: "Altitude and descent profile" },
  { id: "wide_aerial", label: "Wide aerial", note: "Context view" },
  { id: "chase_locked", label: "Chase locked", note: "Follows selected flight" },
  { id: "ground_reference", label: "Ground reference", note: "Low site reference angle" },
  { id: "security_cam_01", label: "Security Camera 1", note: "South checkpoint estimate" },
  { id: "security_cam_02", label: "Security Camera 2", note: "Adjacent checkpoint estimate" },
  { id: "split_screen", label: "Split comparison", note: "Original footage plus estimated camera" }
];

export function CameraSelector() {
  const cameraMode = useReplayStore((state) => state.cameraMode);
  const cameraFovOverrides = useReplayStore((state) => state.cameraFovOverrides);
  const cameraPoseOverrides = useReplayStore((state) => state.cameraPoseOverrides);
  const activeFlightId = useReplayStore((state) => state.activeFlightId);
  const setCameraMode = useReplayStore((state) => state.setCameraMode);
  const setCameraFovOverride = useReplayStore((state) => state.setCameraFovOverride);
  const resetCameraFovOverride = useReplayStore((state) => state.resetCameraFovOverride);
  const resetCameraView = useReplayStore((state) => state.resetCameraView);
  const preset = cameraPresets[cameraMode];
  const calibration = cameraCalibrationRecords[cameraMode];
  const fov = effectiveCameraFov(cameraMode, cameraFovOverrides);
  const fovIsAdjusted = Number.isFinite(cameraFovOverrides[cameraMode]);
  const savedPose = cameraMode === "chase_locked" ? undefined : cameraPoseOverrides[cameraMode];
  const activeSite = terminalSiteForFlight(activeFlightId);
  const activeSiteDrivenView = isActiveSiteDrivenCamera(cameraMode, activeSite.id);

  return (
    <section className="panel" aria-label="Camera presets">
      <div className="panel-heading">
        <Camera size={18} aria-hidden="true" />
        <h2>Camera Presets</h2>
      </div>
      <div className="camera-grid">
        {cameraOptions.map((option) => {
          const selected = cameraMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`camera-option ${selected ? "selected" : ""}`}
              onClick={() => (selected ? resetCameraView(option.id) : setCameraMode(option.id))}
              aria-pressed={selected}
              title={selected ? `Reset ${option.label} view` : `Switch to ${option.label}`}
            >
              <span>{option.label}</span>
              <small>{option.note}</small>
            </button>
          );
        })}
      </div>
      <div className="calibration-note">
        <ScanEye size={16} aria-hidden="true" />
        Security-camera transforms are public-record placeholders unless a calibration panel below says otherwise.
      </div>
      <div className="camera-calibration-panel">
        <div className="calibration-panel-header">
          <strong>{preset.label}</strong>
          <div className="calibration-panel-actions">
            <span>{preset.type}</span>
            <button type="button" className="camera-reset-button" onClick={() => resetCameraView(cameraMode)}>
              <RotateCcw size={14} aria-hidden="true" />
              Reset view
            </button>
          </div>
        </div>
        <dl>
          <div>
            <dt>Current app FOV</dt>
            <dd>{fov} deg {fovIsAdjusted ? "user adjusted" : "estimate"}</dd>
          </div>
          {isFovAdjustableCamera(cameraMode) ? (
            <div className="camera-fov-control">
              <dt>FOV control</dt>
              <dd>
                <label>
                  <span>{cameraFovRange.min} deg</span>
                  <input
                    type="range"
                    min={cameraFovRange.min}
                    max={cameraFovRange.max}
                    step={1}
                    value={fov}
                    onChange={(event) => setCameraFovOverride(cameraMode, Number(event.currentTarget.value))}
                    aria-label={`${preset.label} FOV`}
                  />
                  <span>{cameraFovRange.max} deg</span>
                </label>
                <input
                  className="camera-fov-number"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fov}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value.replace(/[^\d]/g, ""));
                    if (Number.isFinite(next)) {
                      setCameraFovOverride(cameraMode, next);
                    }
                  }}
                  aria-label={`${preset.label} FOV degrees`}
                />
                <button type="button" onClick={() => resetCameraFovOverride(cameraMode)}>
                  Reset
                </button>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Current app position</dt>
            <dd>
              {cameraMode === "chase_locked"
                ? "computed live from selected flight"
                : activeSiteDrivenView
                  ? `computed from selected ${activeSite.shortLabel} site in the scene`
                : `${formatVector(savedPose?.position ?? preset.position)} ENU ${savedPose ? "session view" : "placeholder"}`}
            </dd>
          </div>
          <div>
            <dt>Current app target</dt>
            <dd>
              {cameraMode === "chase_locked"
                ? "computed live from selected flight"
                : activeSiteDrivenView
                  ? `computed from selected ${activeSite.shortLabel} site in the scene`
                : `${formatVector(savedPose?.target ?? preset.target)} ENU ${savedPose ? "session view" : "placeholder"}`}
            </dd>
          </div>
          <div>
            <dt>Calibration status</dt>
            <dd>
              {activeSiteDrivenView
                ? `Active flight tab recenters this ${preset.label} view on ${activeSite.shortLabel}. This is an inspection preset, not a source-matched camera.`
                : preset.calibration}
            </dd>
          </div>
          {calibration ? (
            <>
              <div>
                <dt>Public location statement</dt>
                <dd>{calibration.publicLocation}</dd>
              </div>
              <div>
                <dt>Published exact coordinates</dt>
                <dd>{calibration.publishedCoordinates}</dd>
              </div>
              <div>
                <dt>Published view angle / FOV</dt>
                <dd>
                  View angle: {calibration.publishedViewAngle} FOV: {calibration.publishedFov}
                </dd>
              </div>
              <div>
                <dt>Evidence loaded</dt>
                <dd>{calibration.evidence.join(" ")}</dd>
              </div>
              <div>
                <dt>Needed for exact match</dt>
                <dd>{calibration.nextCalibrationStep}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

function isActiveSiteDrivenCamera(mode: CameraMode, siteId: SiteId) {
  return siteId !== "pentagon" && ["free_orbit", "top_down", "wide_aerial", "ground_reference"].includes(mode);
}

function formatVector(vector: { x: number; y: number; z: number }) {
  return `x ${Math.round(vector.x)}, y ${Math.round(vector.y)}, z ${Math.round(vector.z)}`;
}
