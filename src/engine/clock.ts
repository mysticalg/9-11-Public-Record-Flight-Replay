import { replayStartClock } from "../data/trajectoryLocked";

export function formatReplayTime(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const whole = Math.abs(Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${sign}${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatHistoricalClock(secondsFromStart: number) {
  const [hours, minutes, seconds] = replayStartClock.split(":").map(Number);
  const start = hours * 3600 + minutes * 60 + seconds;
  const total = start + Math.round(secondsFromStart);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
