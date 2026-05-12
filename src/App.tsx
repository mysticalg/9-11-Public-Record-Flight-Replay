import { useEffect, useMemo, useRef } from "react";
import {
  contextTimelineEvents,
  replayStartClockSeconds,
  sharedTimelineEndReplayOffset,
  sharedTimelineStartReplayOffset
} from "./data/contextTimeline";
import { eventMarkers, sources, trajectoryNotice } from "./data/trajectoryLocked";
import { formatHistoricalClock, formatReplayTime } from "./engine/clock";
import { fdrReplayDuration, replayDuration } from "./engine/trajectoryPlayer";
import { flightReplayDataWindow, getFlightReplayState } from "./engine/multiFlightPlayer";
import { CameraSelector } from "./components/CameraSelector";
import { DisclaimerModal } from "./components/DisclaimerModal";
import { SourcePanel } from "./components/SourcePanel";
import { TelemetryDials } from "./components/TelemetryDials";
import { TelemetryPlots } from "./components/TelemetryPlots";
import { PlaybackStrip, TimelineControls } from "./components/TimelineControls";
import { ReplayScene } from "./scene/ReplayScene";
import { useReplayStore } from "./store/replayStore";
import { evaluateFlightEnvelope, type FlightEnvelopeWarning } from "./engine/flightEnvelope";
import type { FlightId } from "./types";

export function App() {
  const {
    currentTime,
    activeFlightId,
    cameraMode,
    cameraFovOverrides,
    cameraResetRevision,
    showLabels,
    showFlightPath,
    showPlannedRoute,
    showAircraftMarker,
    showSourceMarkers,
    showUncertainty,
    showSiteContext,
    showSatelliteOverlay,
    satelliteOverlayMode,
    showCameraFrustums,
    showOriginalSecurityFrames,
    showTelemetryPlots,
    audioAlertsEnabled,
    smoothReplay,
    disclaimerAccepted
  } = useReplayStore();

  const interpolationMode = smoothReplay ? "smooth" : "linear";
  const aa77ReplayTime = Math.min(Math.max(currentTime, 0), replayDuration);
  const selectedReplayTime = activeFlightId === "aa77" ? aa77ReplayTime : currentTime;
  const replayState = useMemo(
    () => getFlightReplayState(activeFlightId, selectedReplayTime, { interpolationMode }),
    [activeFlightId, selectedReplayTime, interpolationMode]
  );
  const envelopeWarnings = useMemo(
    () => (activeFlightId === "aa77" ? evaluateFlightEnvelope(replayState) : []),
    [activeFlightId, replayState]
  );
  const activeMarker = useMemo(
    () => activeMarkerForFlight(activeFlightId, currentTime),
    [activeFlightId, currentTime]
  );

  useReplayClock();
  useAudioAlerts(envelopeWarnings, audioAlertsEnabled);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="topbar-label">Passive historical replay viewer</p>
          <h1>9/11 Public Record Flight Replay</h1>
        </div>
        <div className="ethics-banner">
          Non-operational visualization. No flight controls, waypoint editing, targeting, scoring, or damage model.
        </div>
      </header>

      <PlaybackStrip duration={replayDuration} />

      <section className="viewer-layout">
        <div className="viewport-column">
          <div className="viewport-frame">
            <ReplayScene
              currentTime={selectedReplayTime}
              timelineTime={currentTime}
              activeFlightId={activeFlightId}
              cameraMode={cameraMode}
              cameraFovOverrides={cameraFovOverrides}
              cameraResetRevision={cameraResetRevision}
              showLabels={showLabels}
              showFlightPath={showFlightPath}
              showPlannedRoute={showPlannedRoute}
              showAircraftMarker={showAircraftMarker}
              showSourceMarkers={showSourceMarkers}
              showUncertainty={showUncertainty}
              showSiteContext={showSiteContext}
              showSatelliteOverlay={showSatelliteOverlay}
              satelliteOverlayMode={satelliteOverlayMode}
              showCameraFrustums={showCameraFrustums}
              showOriginalSecurityFrames={showOriginalSecurityFrames}
              smoothReplay={smoothReplay}
            />
            <FlightAlertStrip warnings={envelopeWarnings} />
            <div className="viewport-hud">
              <div>
                <span>Replay</span>
                <strong>{formatReplayTime(currentTime)}</strong>
              </div>
              <div>
                <span>Historical Clock</span>
                <strong>{formatHistoricalClock(currentTime)}</strong>
              </div>
              <div>
                <span>Current Visual</span>
                <strong>{formatVisualStatus(activeFlightId, replayState.interpolation, interpolationMode, currentTime)}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong className={`confidence confidence-${replayState.confidence}`}>{replayState.confidence}</strong>
              </div>
            </div>
            <TelemetryDials replayState={replayState} visible={cameraMode === "chase_locked"} />
          </div>

          <TimelineControls duration={replayDuration} />
          {showTelemetryPlots ? <TelemetryPlots currentTime={aa77ReplayTime} duration={replayDuration} /> : null}
        </div>

        <aside className="inspector">
          <CameraSelector />
            <SourcePanel
              replayState={replayState}
              activeFlightId={activeFlightId}
              activeMarker={activeMarker}
              sources={sources}
              trajectoryNotice={trajectoryNotice}
            />
        </aside>
      </section>

      {!disclaimerAccepted ? <DisclaimerModal /> : null}
    </main>
  );
}

function activeMarkerForFlight(flightId: FlightId, currentTime: number) {
  if (flightId === "aa77") {
    const aa77ReplayTime = Math.min(Math.max(currentTime, 0), replayDuration);
    return (
      [...eventMarkers]
        .filter((marker) => !marker.timelineOnly)
        .reverse()
        .find((marker) => marker.t <= aa77ReplayTime + 0.001) ?? eventMarkers[0]
    );
  }

  const historicalSeconds = replayStartClockSeconds + currentTime;
  const activeEvent =
    [...contextTimelineEvents]
      .filter((event) => event.flightId === flightId && event.clockSeconds <= historicalSeconds + 0.001)
      .reverse()[0] ??
    contextTimelineEvents.find((event) => event.flightId === flightId) ??
    contextTimelineEvents[0];

  return {
    t: activeEvent.clockSeconds - replayStartClockSeconds,
    timeLabel: activeEvent.timeLabel,
    title: activeEvent.title,
    description: activeEvent.detail,
    source: activeEvent.source,
    confidence: "medium" as const
  };
}

function formatVisualStatus(
  flightId: FlightId,
  status: "documented" | "inferred",
  mode: "linear" | "smooth",
  currentTime: number
) {
  const dataWindow = flightReplayDataWindow(flightId);

  if (currentTime < dataWindow.start) {
    if (flightId === "aa77") {
      return "Before AA77 FDR path";
    }
    return flightId === "ua93" ? "Before loaded UA93 sample" : "Before loaded radar sample";
  }

  if (currentTime > dataWindow.end) {
    if (flightId === "aa77") {
      return "Post-AA77 context";
    }
    return flightId === "ua93" ? "After UA93 terminal sample" : "After terminal radar sample";
  }

  if (flightId !== "aa77") {
    if (flightId === "ua93") {
      return status === "documented"
        ? "UA93 black-box sample"
        : mode === "smooth"
          ? "Smoothed UA93 black-box interpolation"
          : "UA93 black-box interpolation";
    }

    return status === "documented"
      ? "Public radar sample"
      : mode === "smooth"
        ? "Smoothed public radar interpolation"
        : "Public radar interpolation";
  }

  if (currentTime > fdrReplayDuration) {
    return "Impact reconstruction";
  }

  if (status === "documented") {
    return "FDR sample";
  }

  return mode === "smooth" ? "Smoothed interpolation" : "Linear interpolation";
}

function FlightAlertStrip({ warnings }: { warnings: FlightEnvelopeWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  const critical = warnings.some((warning) => warning.severity === "critical");
  const visibleWarnings = warnings.slice(0, 3);

  return (
    <div className={`flight-alert-strip ${critical ? "flight-alert-critical" : "flight-alert-warning"}`} role="status">
      <strong>{critical ? "Critical telemetry alert" : "Telemetry caution"}</strong>
      <span>
        {visibleWarnings.map((warning) => `${warning.label} ${warning.value}`).join(" | ")}
        {warnings.length > visibleWarnings.length ? ` | +${warnings.length - visibleWarnings.length}` : ""}
      </span>
    </div>
  );
}

function useAudioAlerts(warnings: FlightEnvelopeWarning[], enabled: boolean) {
  const isPlaying = useReplayStore((state) => state.isPlaying);
  const lastBeepRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const active = enabled && isPlaying && warnings.some((warning) => warning.severity === "critical");

  useEffect(() => {
    if (!active) {
      return;
    }

    const now = performance.now();
    if (now - lastBeepRef.current < 1800) {
      return;
    }
    lastBeepRef.current = now;

    try {
      const AudioContextClass =
        window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    } catch {
      // Browser audio can be blocked until a user gesture; the UI state remains valid.
    }
  }, [active, warnings]);
}

function useReplayClock() {
  const isPlaying = useReplayStore((state) => state.isPlaying);
  const speed = useReplayStore((state) => state.speed);
  const setCurrentTime = useReplayStore((state) => state.setCurrentTime);
  const setIsPlaying = useReplayStore((state) => state.setIsPlaying);
  const lastFrame = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastFrame.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastFrame.current === null) {
        lastFrame.current = now;
      }

      const deltaSeconds = (now - lastFrame.current) / 1000;
      lastFrame.current = now;

      setCurrentTimeFromDelta(deltaSeconds * speed);
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isPlaying, speed]);

  function setCurrentTimeFromDelta(delta: number) {
    const state = useReplayStore.getState();
    const timelineEnd = Math.max(replayDuration, sharedTimelineEndReplayOffset);
    const next = Math.min(Math.max(state.currentTime + delta, sharedTimelineStartReplayOffset), timelineEnd);
    setCurrentTime(next);

    if (next >= timelineEnd) {
      setIsPlaying(false);
    }
  }
}
