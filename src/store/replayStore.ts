import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { replayStartClockSeconds, sharedTimelineEndReplayOffset, sharedTimelineStartReplayOffset } from "../data/contextTimeline";
import type { SatelliteOverlayMode } from "../data/imagerySources";
import type { CameraFovOverrides } from "../engine/cameraPresets";
import { cameraFovRange } from "../engine/cameraPresets";
import { replayDuration } from "../engine/trajectoryPlayer";
import type { CameraMode, FlightId } from "../types";

export type ReplaySpeed = 0.1 | 0.25 | 0.5 | 1 | 4 | 8 | 16;

export interface CameraVectorSnapshot {
  x: number;
  y: number;
  z: number;
}

export interface CameraPoseSnapshot {
  position: CameraVectorSnapshot;
  target: CameraVectorSnapshot;
}

interface ReplayStore {
  currentTime: number;
  isPlaying: boolean;
  speed: ReplaySpeed;
  activeFlightId: FlightId;
  cameraMode: CameraMode;
  cameraFovOverrides: CameraFovOverrides;
  cameraPoseOverrides: Partial<Record<CameraMode, CameraPoseSnapshot>>;
  cameraResetRevision: number;
  showLabels: boolean;
  showFlightPath: boolean;
  showPlannedRoute: boolean;
  showAircraftMarker: boolean;
  showSourceMarkers: boolean;
  showUncertainty: boolean;
  showSiteContext: boolean;
  showSatelliteOverlay: boolean;
  satelliteOverlayMode: SatelliteOverlayMode;
  showCameraFrustums: boolean;
  showOriginalSecurityFrames: boolean;
  showTelemetryPlots: boolean;
  audioAlertsEnabled: boolean;
  radioTranscriptAudioEnabled: boolean;
  smoothReplay: boolean;
  disclaimerAccepted: boolean;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setActiveFlightId: (flightId: FlightId) => void;
  setCameraMode: (mode: CameraMode) => void;
  setCameraFovOverride: (mode: CameraMode, fov: number) => void;
  resetCameraFovOverride: (mode: CameraMode) => void;
  setCameraPoseOverride: (mode: CameraMode, pose: CameraPoseSnapshot) => void;
  resetCameraPoseOverride: (mode: CameraMode) => void;
  resetCameraView: (mode: CameraMode) => void;
  toggleLabels: () => void;
  toggleFlightPath: () => void;
  togglePlannedRoute: () => void;
  toggleAircraftMarker: () => void;
  toggleSourceMarkers: () => void;
  toggleUncertainty: () => void;
  toggleSiteContext: () => void;
  toggleSatelliteOverlay: () => void;
  setSatelliteOverlayMode: (mode: SatelliteOverlayMode) => void;
  toggleCameraFrustums: () => void;
  toggleOriginalSecurityFrames: () => void;
  toggleTelemetryPlots: () => void;
  toggleAudioAlerts: () => void;
  toggleRadioTranscriptAudio: () => void;
  toggleSmoothReplay: () => void;
  acceptDisclaimer: () => void;
}

type PersistedReplayStore = Pick<
  ReplayStore,
  | "currentTime"
  | "speed"
  | "activeFlightId"
  | "cameraMode"
  | "cameraFovOverrides"
  | "cameraPoseOverrides"
  | "showLabels"
  | "showFlightPath"
  | "showPlannedRoute"
  | "showAircraftMarker"
  | "showSourceMarkers"
  | "showUncertainty"
  | "showSiteContext"
  | "showSatelliteOverlay"
  | "satelliteOverlayMode"
  | "showCameraFrustums"
  | "showOriginalSecurityFrames"
  | "showTelemetryPlots"
  | "audioAlertsEnabled"
  | "radioTranscriptAudioEnabled"
  | "smoothReplay"
  | "disclaimerAccepted"
>;

const replaySpeeds: ReplaySpeed[] = [0.1, 0.25, 0.5, 1, 4, 8, 16];
const flightIds: FlightId[] = ["aa11", "ua175", "aa77", "ua93"];
const cameraModes: CameraMode[] = [
  "free_orbit",
  "full_path",
  "top_down",
  "side_elevation",
  "chase_locked",
  "wide_aerial",
  "ground_reference",
  "security_cam_01",
  "security_cam_02",
  "split_screen"
];
const satelliteOverlayModes: SatelliteOverlayMode[] = ["modern", "ikonos_2001_reference"];

let debouncedSessionStorage: StateStorage | null = null;
let pendingSessionWrite: { name: string; value: string } | null = null;
let pendingSessionWriteId: ReturnType<typeof window.setTimeout> | null = null;

function createDebouncedSessionStorage(): StateStorage {
  if (debouncedSessionStorage) {
    return debouncedSessionStorage;
  }

  const flush = () => {
    if (!pendingSessionWrite || typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(pendingSessionWrite.name, pendingSessionWrite.value);
    pendingSessionWrite = null;
    pendingSessionWriteId = null;
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  debouncedSessionStorage = {
    getItem: (name) => {
      if (pendingSessionWrite?.name === name) {
        return pendingSessionWrite.value;
      }
      return typeof window === "undefined" ? null : window.sessionStorage.getItem(name);
    },
    setItem: (name, value) => {
      if (typeof window === "undefined") {
        return;
      }

      pendingSessionWrite = { name, value };
      if (pendingSessionWriteId !== null) {
        window.clearTimeout(pendingSessionWriteId);
      }
      pendingSessionWriteId = window.setTimeout(flush, 350);
    },
    removeItem: (name) => {
      if (pendingSessionWrite?.name === name) {
        pendingSessionWrite = null;
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(name);
      }
    }
  };

  return debouncedSessionStorage;
}

export const useReplayStore = create<ReplayStore>()(
  persist(
    (set) => ({
  currentTime: (9 * 3600 + 2 * 60 + 37) - replayStartClockSeconds,
  isPlaying: false,
  speed: 0.5,
  activeFlightId: "ua175",
  cameraMode: "chase_locked",
  cameraFovOverrides: {},
  cameraPoseOverrides: {},
  cameraResetRevision: 0,
  showLabels: true,
  showFlightPath: true,
  showPlannedRoute: true,
  showAircraftMarker: true,
  showSourceMarkers: true,
  showUncertainty: true,
  showSiteContext: true,
  showSatelliteOverlay: true,
  satelliteOverlayMode: "modern",
  showCameraFrustums: true,
  showOriginalSecurityFrames: true,
  showTelemetryPlots: false,
  audioAlertsEnabled: false,
  radioTranscriptAudioEnabled: false,
  smoothReplay: true,
  disclaimerAccepted: false,
  setCurrentTime: (time) => set({ currentTime: clampTimelineTime(time) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setSpeed: (speed) => set({ speed }),
  setActiveFlightId: (flightId) => set({ activeFlightId: flightId }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setCameraFovOverride: (mode, fov) =>
    set((state) => ({
      cameraFovOverrides: {
        ...state.cameraFovOverrides,
        [mode]: Math.min(Math.max(fov, cameraFovRange.min), cameraFovRange.max)
      }
    })),
  resetCameraFovOverride: (mode) =>
    set((state) => {
      const next = { ...state.cameraFovOverrides };
      delete next[mode];
      return { cameraFovOverrides: next };
    }),
  setCameraPoseOverride: (mode, pose) =>
    set((state) => ({
      cameraPoseOverrides: {
        ...state.cameraPoseOverrides,
        [mode]: normalizeCameraPoseSnapshot(pose)
      }
    })),
  resetCameraPoseOverride: (mode) =>
    set((state) => {
      const next = { ...state.cameraPoseOverrides };
      delete next[mode];
      return { cameraPoseOverrides: next };
    }),
  resetCameraView: (mode) =>
    set((state) => {
      const cameraFovOverrides = { ...state.cameraFovOverrides };
      const cameraPoseOverrides = { ...state.cameraPoseOverrides };
      delete cameraFovOverrides[mode];
      delete cameraPoseOverrides[mode];
      return {
        cameraMode: mode,
        cameraFovOverrides,
        cameraPoseOverrides,
        cameraResetRevision: state.cameraResetRevision + 1
      };
    }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleFlightPath: () => set((state) => ({ showFlightPath: !state.showFlightPath })),
  togglePlannedRoute: () => set((state) => ({ showPlannedRoute: !state.showPlannedRoute })),
  toggleAircraftMarker: () => set((state) => ({ showAircraftMarker: !state.showAircraftMarker })),
  toggleSourceMarkers: () => set((state) => ({ showSourceMarkers: !state.showSourceMarkers })),
  toggleUncertainty: () => set((state) => ({ showUncertainty: !state.showUncertainty })),
  toggleSiteContext: () => set((state) => ({ showSiteContext: !state.showSiteContext })),
  toggleSatelliteOverlay: () => set((state) => ({ showSatelliteOverlay: !state.showSatelliteOverlay })),
  setSatelliteOverlayMode: (mode) => set({ satelliteOverlayMode: mode, showSatelliteOverlay: true }),
  toggleCameraFrustums: () => set((state) => ({ showCameraFrustums: !state.showCameraFrustums })),
  toggleOriginalSecurityFrames: () =>
    set((state) => ({ showOriginalSecurityFrames: !state.showOriginalSecurityFrames })),
  toggleTelemetryPlots: () => set((state) => ({ showTelemetryPlots: !state.showTelemetryPlots })),
  toggleAudioAlerts: () => set((state) => ({ audioAlertsEnabled: !state.audioAlertsEnabled })),
  toggleRadioTranscriptAudio: () =>
    set((state) => ({ radioTranscriptAudioEnabled: !state.radioTranscriptAudioEnabled })),
  toggleSmoothReplay: () => set((state) => ({ smoothReplay: !state.smoothReplay })),
  acceptDisclaimer: () => set({ disclaimerAccepted: true })
    }),
    {
      name: "aa77-replay-session",
      storage: createJSONStorage(() => createDebouncedSessionStorage()),
      partialize: (state): PersistedReplayStore => ({
        currentTime: clampTimelineTime(state.currentTime),
        speed: state.speed,
        activeFlightId: state.activeFlightId,
        cameraMode: state.cameraMode,
        cameraFovOverrides: state.cameraFovOverrides,
        cameraPoseOverrides: state.cameraPoseOverrides,
        showLabels: state.showLabels,
        showFlightPath: state.showFlightPath,
        showPlannedRoute: state.showPlannedRoute,
        showAircraftMarker: state.showAircraftMarker,
        showSourceMarkers: state.showSourceMarkers,
        showUncertainty: state.showUncertainty,
        showSiteContext: state.showSiteContext,
        showSatelliteOverlay: state.showSatelliteOverlay,
        satelliteOverlayMode: state.satelliteOverlayMode,
        showCameraFrustums: state.showCameraFrustums,
        showOriginalSecurityFrames: state.showOriginalSecurityFrames,
        showTelemetryPlots: state.showTelemetryPlots,
        audioAlertsEnabled: state.audioAlertsEnabled,
        radioTranscriptAudioEnabled: state.radioTranscriptAudioEnabled,
        smoothReplay: state.smoothReplay,
        disclaimerAccepted: state.disclaimerAccepted
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedState(persistedState)
      })
    }
  )
);

function sanitizePersistedState(persistedState: unknown): Partial<PersistedReplayStore> {
  if (!persistedState || typeof persistedState !== "object") {
    return {};
  }

  const state = persistedState as Partial<PersistedReplayStore>;
  const next: Partial<PersistedReplayStore> = {};

  if (typeof state.currentTime === "number" && Number.isFinite(state.currentTime)) {
    next.currentTime = clampTimelineTime(state.currentTime);
  }

  if (replaySpeeds.includes(state.speed as ReplaySpeed)) {
    next.speed = state.speed as ReplaySpeed;
  }

  if (flightIds.includes(state.activeFlightId as FlightId)) {
    next.activeFlightId = state.activeFlightId as FlightId;
  }

  if (cameraModes.includes(state.cameraMode as CameraMode)) {
    next.cameraMode = state.cameraMode as CameraMode;
  }

  if (state.cameraFovOverrides && typeof state.cameraFovOverrides === "object") {
    next.cameraFovOverrides = sanitizeCameraFovOverrides(state.cameraFovOverrides);
  }

  if (state.cameraPoseOverrides && typeof state.cameraPoseOverrides === "object") {
    next.cameraPoseOverrides = sanitizeCameraPoseOverrides(state.cameraPoseOverrides);
  }

  copyBoolean(state, next, "showLabels");
  copyBoolean(state, next, "showFlightPath");
  copyBoolean(state, next, "showPlannedRoute");
  copyBoolean(state, next, "showAircraftMarker");
  copyBoolean(state, next, "showSourceMarkers");
  copyBoolean(state, next, "showUncertainty");
  copyBoolean(state, next, "showSiteContext");
  copyBoolean(state, next, "showSatelliteOverlay");
  if (satelliteOverlayModes.includes(state.satelliteOverlayMode as SatelliteOverlayMode)) {
    next.satelliteOverlayMode = state.satelliteOverlayMode as SatelliteOverlayMode;
  }
  copyBoolean(state, next, "showCameraFrustums");
  copyBoolean(state, next, "showOriginalSecurityFrames");
  copyBoolean(state, next, "showTelemetryPlots");
  copyBoolean(state, next, "audioAlertsEnabled");
  copyBoolean(state, next, "radioTranscriptAudioEnabled");
  copyBoolean(state, next, "smoothReplay");
  copyBoolean(state, next, "disclaimerAccepted");

  return next;
}

function copyBoolean<T extends keyof PersistedReplayStore>(
  source: Partial<PersistedReplayStore>,
  target: Partial<PersistedReplayStore>,
  key: T
) {
  if (typeof source[key] === "boolean") {
    target[key] = source[key];
  }
}

function sanitizeCameraFovOverrides(overrides: CameraFovOverrides) {
  return cameraModes.reduce<CameraFovOverrides>((next, mode) => {
    const value = overrides[mode];
    if (Number.isFinite(value)) {
      next[mode] = Math.min(Math.max(value as number, cameraFovRange.min), cameraFovRange.max);
    }
    return next;
  }, {});
}

function sanitizeCameraPoseOverrides(overrides: Partial<Record<CameraMode, CameraPoseSnapshot>>) {
  return cameraModes.reduce<Partial<Record<CameraMode, CameraPoseSnapshot>>>((next, mode) => {
    const pose = overrides[mode];
    if (isCameraPoseSnapshot(pose)) {
      next[mode] = normalizeCameraPoseSnapshot(pose);
    }
    return next;
  }, {});
}

function isCameraPoseSnapshot(value: unknown): value is CameraPoseSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const pose = value as Partial<CameraPoseSnapshot>;
  return isVectorSnapshot(pose.position) && isVectorSnapshot(pose.target);
}

function isVectorSnapshot(value: unknown): value is CameraVectorSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const vector = value as Partial<CameraVectorSnapshot>;
  return (
    typeof vector.x === "number" &&
    Number.isFinite(vector.x) &&
    typeof vector.y === "number" &&
    Number.isFinite(vector.y) &&
    typeof vector.z === "number" &&
    Number.isFinite(vector.z)
  );
}

function normalizeCameraPoseSnapshot(pose: CameraPoseSnapshot): CameraPoseSnapshot {
  return {
    position: normalizeVectorSnapshot(pose.position),
    target: normalizeVectorSnapshot(pose.target)
  };
}

function normalizeVectorSnapshot(vector: CameraVectorSnapshot): CameraVectorSnapshot {
  return {
    x: roundCameraCoordinate(vector.x),
    y: roundCameraCoordinate(vector.y),
    z: roundCameraCoordinate(vector.z)
  };
}

function roundCameraCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

function clampTimelineTime(time: number) {
  const timelineEnd = Math.max(replayDuration, sharedTimelineEndReplayOffset);
  return Math.min(Math.max(time, sharedTimelineStartReplayOffset), timelineEnd);
}
