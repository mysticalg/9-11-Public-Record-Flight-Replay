import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pause, Play, Radio, RotateCcw, Volume2 } from "lucide-react";
import {
  clockFromSeconds,
  contextTimelineEndSeconds as defaultContextTimelineEndSeconds,
  contextTimelineEvents,
  contextTimelineStartSeconds,
  flightTimelineOrder,
  flightTimelineProfiles,
  secondsOfDay,
  sharedTimelineEndReplayOffset,
  sharedTimelineStartReplayOffset,
  type ContextTimelineEvent
} from "../data/contextTimeline";
import { flight77Transmissions, type Flight77Transmission } from "../data/flight77Transmissions";
import { satelliteOverlaySources, type SatelliteOverlayMode } from "../data/imagerySources";
import { replayStartClock } from "../data/trajectoryLocked";
import { formatHistoricalClock, formatReplayTime } from "../engine/clock";
import { flightReplayDataWindow } from "../engine/multiFlightPlayer";
import { useReplayStore, type ReplaySpeed } from "../store/replayStore";
import type { FlightId } from "../types";

const speeds: ReplaySpeed[] = [0.1, 0.25, 0.5, 1, 4, 8, 16];
const finalReplayTailSeconds = 20;

export function TimelineControls({ duration }: { duration: number }) {
  const spokenTransmissionIdsRef = useRef<Set<string>>(new Set());
  const previousClockSecondsRef = useRef<number | null>(null);
  const speechSupported = useMemo(
    () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    []
  );
  const {
    currentTime,
    isPlaying,
    speed,
    activeFlightId,
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
    radioTranscriptAudioEnabled,
    smoothReplay,
    setCurrentTime,
    setIsPlaying,
    setSpeed,
    setActiveFlightId,
    toggleLabels,
    toggleFlightPath,
    togglePlannedRoute,
    toggleAircraftMarker,
    toggleSourceMarkers,
    toggleUncertainty,
    toggleSiteContext,
    toggleSatelliteOverlay,
    setSatelliteOverlayMode,
    toggleCameraFrustums,
    toggleOriginalSecurityFrames,
    toggleTelemetryPlots,
    toggleAudioAlerts,
    toggleRadioTranscriptAudio,
    toggleSmoothReplay
  } = useReplayStore();

  const replayStartSeconds = secondsOfDay(replayStartClock);
  const replayEndSeconds = replayStartSeconds + duration;
  const currentClockSeconds = replayStartSeconds + currentTime;
  const timelineStartTime = sharedTimelineStartReplayOffset;
  const timelineEndTime = Math.max(sharedTimelineEndReplayOffset, duration);
  const atReplayEnd = currentTime >= timelineEndTime - 0.1;
  const timelineEndClockSeconds = Math.max(
    defaultContextTimelineEndSeconds,
    ...contextTimelineEvents.map((event) => event.endClockSeconds ?? event.clockSeconds),
    ...flight77Transmissions.map((transmission) => transmission.clockSeconds)
  );
  const jumpToEvent = useCallback(
    (event: ContextTimelineEvent) => {
      setIsPlaying(false);
      if (event.flightId) {
        setActiveFlightId(event.flightId);
      }
      setCurrentTime(event.clockSeconds - replayStartSeconds);
    },
    [replayStartSeconds, setActiveFlightId, setCurrentTime, setIsPlaying]
  );
  const selectFlightTab = useCallback(
    (flightId: FlightId) => {
      setActiveFlightId(flightId);
      const dataWindow = flightReplayDataWindow(flightId);
      if (currentTime < dataWindow.start - 0.05) {
        setCurrentTime(dataWindow.start);
        setIsPlaying(false);
      }
    },
    [currentTime, setActiveFlightId, setCurrentTime, setIsPlaying]
  );

  const speakTransmission = useCallback(
    (transmission: Flight77Transmission) => {
      if (!speechSupported) {
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(
        `${transmission.timeLabel}. ${transmission.speaker}. ${transmission.transcript}`
      );
      utterance.rate = 0.86;
      utterance.pitch = 0.82;
      utterance.volume = 0.92;
      window.speechSynthesis.speak(utterance);
    },
    [speechSupported]
  );

  useEffect(() => {
    const previousClockSeconds = previousClockSecondsRef.current;
    previousClockSecondsRef.current = currentClockSeconds;

    if (!radioTranscriptAudioEnabled || !speechSupported) {
      return;
    }

    if (previousClockSeconds === null || currentClockSeconds < previousClockSeconds) {
      spokenTransmissionIdsRef.current.clear();
      return;
    }

    if (!isPlaying) {
      return;
    }

    const crossedTransmission = flight77Transmissions.find(
      (transmission) =>
        transmission.clockSeconds > previousClockSeconds &&
        transmission.clockSeconds <= currentClockSeconds &&
        !spokenTransmissionIdsRef.current.has(transmission.id)
    );

    if (crossedTransmission) {
      spokenTransmissionIdsRef.current.add(crossedTransmission.id);
      speakTransmission(crossedTransmission);
    }
  }, [currentClockSeconds, isPlaying, radioTranscriptAudioEnabled, speakTransmission, speechSupported]);

  useEffect(() => {
    if (!radioTranscriptAudioEnabled && speechSupported) {
      window.speechSynthesis.cancel();
    }
  }, [radioTranscriptAudioEnabled, speechSupported]);

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (atReplayEnd) {
      setCurrentTime(Math.max(timelineStartTime, timelineEndTime - finalReplayTailSeconds));
    }

    setIsPlaying(true);
  };

  return (
    <section className="timeline-panel" aria-label="Timeline replay controls">
      <div className="timeline-topline">
        <button
          className="icon-button primary"
          type="button"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Pause replay" : atReplayEnd ? "Replay final segment" : "Play replay"}
          title={isPlaying ? "Pause replay" : atReplayEnd ? "Replay final segment" : "Play replay"}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => {
            setCurrentTime(timelineStartTime);
            setIsPlaying(false);
          }}
          aria-label="Reset replay"
          title="Reset replay"
        >
          <RotateCcw size={18} />
        </button>

        <div className="time-readouts">
          <span>{formatReplayTime(currentTime)}</span>
          <span>{formatHistoricalClock(currentTime)}</span>
        </div>

        <label className="timeline-slider-label">
          <span>Shared timeline</span>
          <input
            type="range"
            min={timelineStartTime}
            max={timelineEndTime}
            step={0.05}
            value={currentTime}
            onChange={(event) => setCurrentTime(Number(event.currentTarget.value))}
          />
        </label>
      </div>

      <HistoricalContextTimeline
        activeFlightId={activeFlightId}
        currentClockSeconds={currentClockSeconds}
        replayStartSeconds={replayStartSeconds}
        replayEndSeconds={replayEndSeconds}
        timelineEndSeconds={timelineEndClockSeconds}
        onSelectFlight={selectFlightTab}
        onJumpToEvent={jumpToEvent}
        radioTranscriptAudioEnabled={radioTranscriptAudioEnabled}
        onPlayTransmission={speakTransmission}
      />

      <div className="control-row">
        <div className="segmented" aria-label="Replay speed">
          {speeds.map((option) => (
            <button
              key={option}
              type="button"
              className={speed === option ? "active" : ""}
              onClick={() => setSpeed(option)}
            >
              {option}x
            </button>
          ))}
        </div>

        <label className="toggle-control">
          <input type="checkbox" checked={smoothReplay} onChange={toggleSmoothReplay} />
          <span>Smooth replay</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showLabels} onChange={toggleLabels} />
          <span>Labels</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showFlightPath} onChange={toggleFlightPath} />
          <span>Flight path</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showPlannedRoute} onChange={togglePlannedRoute} />
          <span>Planned route</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showAircraftMarker} onChange={toggleAircraftMarker} />
          <span>Aircraft marker</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showSourceMarkers} onChange={toggleSourceMarkers} />
          <span>Source markers</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showUncertainty} onChange={toggleUncertainty} />
          <span>Uncertainty corridor</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showSiteContext} onChange={toggleSiteContext} />
          <span>3D site context</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showSatelliteOverlay} onChange={toggleSatelliteOverlay} />
          <span>Satellite overlay</span>
        </label>
        <div className="segmented compact" aria-label="Satellite overlay source">
          {(Object.keys(satelliteOverlaySources) as SatelliteOverlayMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={satelliteOverlayMode === mode ? "active" : ""}
              onClick={() => setSatelliteOverlayMode(mode)}
              title={satelliteOverlaySources[mode].note}
            >
              {satelliteOverlaySources[mode].shortLabel}
            </button>
          ))}
        </div>
        <label className="toggle-control">
          <input type="checkbox" checked={showCameraFrustums} onChange={toggleCameraFrustums} />
          <span>Camera frustums</span>
        </label>
        <label className="toggle-control">
          <input
            type="checkbox"
            checked={showOriginalSecurityFrames}
            onChange={toggleOriginalSecurityFrames}
          />
          <span>Original frames</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={showTelemetryPlots} onChange={toggleTelemetryPlots} />
          <span>Telemetry plots</span>
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={audioAlertsEnabled} onChange={toggleAudioAlerts} />
          <span>Audio alerts</span>
        </label>
        <label className="toggle-control" title="Synthetic readout of public transcript snippets; original voice recordings are not bundled.">
          <input
            type="checkbox"
            checked={radioTranscriptAudioEnabled}
            disabled={!speechSupported}
            onChange={toggleRadioTranscriptAudio}
          />
          <span>Radio transcript audio</span>
        </label>
      </div>
    </section>
  );
}

function HistoricalContextTimeline({
  activeFlightId,
  currentClockSeconds,
  replayStartSeconds,
  replayEndSeconds,
  timelineEndSeconds,
  onSelectFlight,
  onJumpToEvent,
  radioTranscriptAudioEnabled,
  onPlayTransmission
}: {
  activeFlightId: FlightId;
  currentClockSeconds: number;
  replayStartSeconds: number;
  replayEndSeconds: number;
  timelineEndSeconds: number;
  onSelectFlight: (flightId: FlightId) => void;
  onJumpToEvent: (event: ContextTimelineEvent) => void;
  radioTranscriptAudioEnabled: boolean;
  onPlayTransmission: (transmission: Flight77Transmission) => void;
}) {
  const replayLeft = timelinePercent(replayStartSeconds, contextTimelineStartSeconds, timelineEndSeconds);
  const replayRight = timelinePercent(replayEndSeconds, contextTimelineStartSeconds, timelineEndSeconds);
  const currentLeft = timelinePercent(currentClockSeconds, contextTimelineStartSeconds, timelineEndSeconds);
  const activeProfile = flightTimelineProfiles[activeFlightId];
  const activeEvents = contextTimelineEvents.filter((event) => event.flightId === activeFlightId);

  return (
    <div className="context-timeline" aria-label="September 11 context timeline">
      <div className="flight-tabs-panel" aria-label="Flight timeline tabs">
        <div className="flight-tab-list" role="tablist" aria-label="Select aircraft timeline">
          {flightTimelineOrder.map((flightId) => {
            const profile = flightTimelineProfiles[flightId];
            const selected = flightId === activeFlightId;
            return (
              <button
                key={flightId}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`flight-tab ${selected ? "active" : ""}`}
                onClick={() => onSelectFlight(flightId)}
              >
                <strong>{profile.shortLabel}</strong>
                <span>{profile.takeoffLabel}</span>
              </button>
            );
          })}
        </div>

        <div className={`flight-profile flight-profile-${activeFlightId}`} role="tabpanel">
          <div>
            <span>{activeProfile.callsign}</span>
            <strong>{activeProfile.label}</strong>
          </div>
          <dl>
            <div>
              <dt>Route</dt>
              <dd>{activeProfile.route}</dd>
            </div>
            <div>
              <dt>Aircraft</dt>
              <dd>{activeProfile.aircraft}</dd>
            </div>
            <div>
              <dt>Takeoff</dt>
              <dd>{activeProfile.takeoffLabel}</dd>
            </div>
            <div>
              <dt>Terminal event</dt>
              <dd>{activeProfile.terminalLabel}</dd>
            </div>
          </dl>
          <p>{activeProfile.summary}</p>
          <small>{activeProfile.caveat}</small>
        </div>
      </div>

      <div className="context-timeline-header">
        <span>September 11 context</span>
        <strong>
          {clockFromSeconds(contextTimelineStartSeconds)} - {clockFromSeconds(timelineEndSeconds)}
        </strong>
      </div>

      <div className="context-track">
        <div className="context-baseline" />
        <div
          className="context-replay-window"
          style={{ left: `${replayLeft}%`, width: `${Math.max(replayRight - replayLeft, 0.5)}%` }}
          title={`AA77 replay data window: ${clockFromSeconds(replayStartSeconds)} - ${clockFromSeconds(replayEndSeconds)}`}
        />
        {contextTimelineEvents.map((event) => (
          <ContextEventMarker
            key={event.id}
            activeFlightId={activeFlightId}
            event={event}
            onJumpToEvent={onJumpToEvent}
            timelineEndSeconds={timelineEndSeconds}
          />
        ))}
        <div className="context-now" style={{ left: `${currentLeft}%` }} title="Current AA77 replay time" />
      </div>

      <div className="context-event-list" aria-label="Timeline event details">
        {contextTimelineEvents.map((event) => (
          <button
            type="button"
            key={event.id}
            className={`context-chip context-chip-${event.category} ${
              event.flightId === activeFlightId ? "context-chip-active" : "context-chip-muted"
            }`}
            title={event.detail}
            onClick={() => onJumpToEvent(event)}
          >
            <strong>{event.timeLabel}</strong>
            {event.shortLabel}
          </button>
        ))}
      </div>

      <div className="flight-event-list" aria-label={`${activeProfile.shortLabel} event summary`}>
        {activeEvents.map((event) => (
          <button
            key={event.id}
            type="button"
            className={`flight-event flight-event-${event.category}`}
            onClick={() => onJumpToEvent(event)}
            title={`Jump to ${event.timeLabel}: ${event.title}`}
          >
            <strong>{event.timeLabel}</strong>
            <span>{event.title}</span>
          </button>
        ))}
      </div>

      <RadioTransmissionTrack
        timelineEndSeconds={timelineEndSeconds}
        audioEnabled={radioTranscriptAudioEnabled}
        onPlayTransmission={onPlayTransmission}
      />
    </div>
  );
}

function ContextEventMarker({
  activeFlightId,
  event,
  onJumpToEvent,
  timelineEndSeconds
}: {
  activeFlightId: FlightId;
  event: ContextTimelineEvent;
  onJumpToEvent: (event: ContextTimelineEvent) => void;
  timelineEndSeconds: number;
}) {
  const left = timelinePercent(event.clockSeconds, contextTimelineStartSeconds, timelineEndSeconds);

  return (
    <button
      type="button"
      className={`context-event context-event-${event.category} ${
        event.flightId === activeFlightId ? "context-event-active" : "context-event-muted"
      }`}
      style={{ left: `${left}%` }}
      title={`Jump to ${event.timeLabel} - ${event.title}. ${event.source}.`}
      aria-label={`Jump to ${event.timeLabel} - ${event.title}`}
      onClick={() => onJumpToEvent(event)}
    >
      <span className="context-event-dot" />
      <span className="context-event-label">{event.shortLabel}</span>
    </button>
  );
}

function RadioTransmissionTrack({
  timelineEndSeconds,
  audioEnabled,
  onPlayTransmission
}: {
  timelineEndSeconds: number;
  audioEnabled: boolean;
  onPlayTransmission: (transmission: Flight77Transmission) => void;
}) {
  return (
    <div className="radio-transmission-panel" aria-label="AA77 radio transmissions">
      <div className="radio-transmission-header">
        <span>
          <Radio size={14} aria-hidden="true" />
          AA77 radio transmissions
        </span>
        <strong>{audioEnabled ? "Auto readout on" : "Transcript playback"}</strong>
      </div>

      <div className="radio-transmission-track">
        <div className="radio-transmission-baseline" />
        {flight77Transmissions.map((transmission) => (
          <button
            key={transmission.id}
            type="button"
            className="radio-transmission-marker"
            style={{
              left: `${timelinePercent(transmission.clockSeconds, contextTimelineStartSeconds, timelineEndSeconds)}%`
            }}
            title={`${transmission.timeLabel} - ${transmission.summary}. ${transmission.transcript}`}
            aria-label={`Play AA77 radio transcript at ${transmission.timeLabel}: ${transmission.summary}`}
            onClick={() => onPlayTransmission(transmission)}
          >
            <span />
          </button>
        ))}
      </div>

      <div className="radio-transmission-list" aria-label="Playable AA77 radio transcript snippets">
        {flight77Transmissions.map((transmission) => (
          <button
            key={transmission.id}
            type="button"
            className="radio-transmission-chip"
            onClick={() => onPlayTransmission(transmission)}
            title={`${transmission.source}: ${transmission.transcript}`}
          >
            <Volume2 size={13} aria-hidden="true" />
            <strong>{transmission.timeLabel}</strong>
            <span>{transmission.summary}</span>
          </button>
        ))}
      </div>

      <p className="radio-transmission-note">
        Synthetic readout of public transcript snippets; original voice recordings are not bundled.
      </p>
    </div>
  );
}

function timelinePercent(value: number, start: number, end: number) {
  if (end <= start) {
    return 0;
  }

  const raw = Math.min(Math.max(((value - start) / (end - start)) * 100, 0), 100);
  return 2 + raw * 0.96;
}
