import { replayStartClock } from "./trajectoryLocked";
import type { FlightId } from "../types";

export type ContextEventCategory = FlightId | "wtc";

export interface ContextTimelineEvent {
  id: string;
  clockSeconds: number;
  endClockSeconds?: number;
  timeLabel: string;
  shortLabel: string;
  title: string;
  detail: string;
  category: ContextEventCategory;
  flightId?: FlightId;
  source: string;
}

export interface FlightTimelineProfile {
  id: FlightId;
  label: string;
  shortLabel: string;
  callsign: string;
  route: string;
  aircraft: string;
  takeoffLabel: string;
  terminalLabel: string;
  loadedData: "3d_fdr" | "3d_public_fdr" | "3d_radar" | "timeline_only";
  summary: string;
  caveat: string;
}

export const contextTimelineStartSeconds = secondsOfDay("07:59:00");

export const contextTimelineEvents: ContextTimelineEvent[] = [
  {
    id: "aa11-takeoff",
    clockSeconds: secondsOfDay("07:59:00"),
    timeLabel: "07:59",
    shortLabel: "AA11 takeoff",
    title: "American Airlines Flight 11 takes off",
    detail: "Flight 11 departed Boston Logan bound for Los Angeles at about 07:59.",
    category: "aa11",
    flightId: "aa11",
    source: "9/11 Commission Report"
  },
  {
    id: "aa77-pushback",
    clockSeconds: secondsOfDay("08:09:00"),
    timeLabel: "08:09",
    shortLabel: "AA77 pushback",
    title: "American Airlines Flight 77 pushes back at Dulles",
    detail:
      "The 9/11 Commission timeline places Flight 77 pushback at 08:09. The loaded FDR position stream starts later, near the runway.",
    category: "aa77",
    flightId: "aa77",
    source: "9/11 Commission Report"
  },
  {
    id: "ua175-takeoff",
    clockSeconds: secondsOfDay("08:14:00"),
    timeLabel: "08:14",
    shortLabel: "UA175 takeoff",
    title: "United Airlines Flight 175 takes off",
    detail: "Flight 175 departed Boston Logan bound for Los Angeles at about 08:14.",
    category: "ua175",
    flightId: "ua175",
    source: "9/11 Commission Report"
  },
  {
    id: "aa11-hijacked",
    clockSeconds: secondsOfDay("08:14:00"),
    timeLabel: "08:14",
    shortLabel: "AA11 hijacked",
    title: "American Airlines Flight 11 hijacked",
    detail: "Flight 11 is reported as hijacked at 08:14 in the NPS Flight 93 National Memorial timeline.",
    category: "aa11",
    flightId: "aa11",
    source: "NPS Flight 93 National Memorial timeline"
  },
  {
    id: "aa77-fdr-start",
    clockSeconds: secondsOfDay("08:19:05"),
    timeLabel: "08:19:05",
    shortLabel: "AA77 FDR begins",
    title: "Decoded AA77 FDR position stream begins",
    detail:
      "The first loaded decoded FDR row with timestamp and position is a Dulles ground/runway sample at 08:19:05 local time.",
    category: "aa77",
    flightId: "aa77",
    source: "Decoded FDR CSV output"
  },
  {
    id: "aa77-airborne",
    clockSeconds: secondsOfDay("08:20:25"),
    timeLabel: "08:20:25",
    shortLabel: "AA77 airborne",
    title: "AA77 first airborne FDR sample",
    detail:
      "The decoded FDR stream shows radio height above ground at about 08:20:25; public FAA/Commission summaries list takeoff at about 08:20.",
    category: "aa77",
    flightId: "aa77",
    source: "Decoded FDR CSV output; 9/11 Commission Report"
  },
  {
    id: "ua93-takeoff",
    clockSeconds: secondsOfDay("08:42:00"),
    timeLabel: "08:42",
    shortLabel: "UA93 takeoff",
    title: "United Airlines Flight 93 takes off",
    detail: "Flight 93 departed Newark bound for San Francisco at about 08:42.",
    category: "ua93",
    flightId: "ua93",
    source: "9/11 Commission Report"
  },
  {
    id: "ua175-hijacked",
    clockSeconds: secondsOfDay("08:42:00"),
    endClockSeconds: secondsOfDay("08:46:00"),
    timeLabel: "08:42-08:46",
    shortLabel: "UA175 hijacked",
    title: "United Airlines Flight 175 hijacked",
    detail: "The NPS timeline places the Flight 175 hijacking between 08:42 and 08:46.",
    category: "ua175",
    flightId: "ua175",
    source: "NPS Flight 93 National Memorial timeline"
  },
  {
    id: "aa11-north-tower",
    clockSeconds: secondsOfDay("08:46:40"),
    timeLabel: "08:46:40",
    shortLabel: "North Tower",
    title: "Flight 11 strikes the North Tower",
    detail: "The 9/11 Commission gives the North Tower impact time as 08:46:40.",
    category: "wtc",
    flightId: "aa11",
    source: "9/11 Commission Report, Chapter 9"
  },
  {
    id: "aa77-last-radio",
    clockSeconds: secondsOfDay("08:50:51"),
    timeLabel: "08:50:51",
    shortLabel: "AA77 last radio",
    title: "AA77 last routine radio communication",
    detail:
      "The 9/11 Commission identifies the last routine radio communication from American 77 around 08:50:51.",
    category: "aa77",
    flightId: "aa77",
    source: "9/11 Commission Report"
  },
  {
    id: "aa77-deviation",
    clockSeconds: secondsOfDay("08:54:00"),
    timeLabel: "08:54",
    shortLabel: "AA77 deviates",
    title: "AA77 deviates from assigned course",
    detail:
      "Public timelines place the course deviation and hijack window around 08:54. The viewer keeps this as context rather than a control/action model.",
    category: "aa77",
    flightId: "aa77",
    source: "9/11 Commission Report"
  },
  {
    id: "aa77-transponder",
    clockSeconds: secondsOfDay("08:56:00"),
    timeLabel: "08:56",
    shortLabel: "AA77 transponder",
    title: "AA77 transponder signal lost",
    detail: "Public timelines place the transponder loss shortly after the course deviation.",
    category: "aa77",
    flightId: "aa77",
    source: "9/11 Commission Report"
  },
  {
    id: "ua175-south-tower",
    clockSeconds: secondsOfDay("09:03:11"),
    timeLabel: "09:03:11",
    shortLabel: "South Tower",
    title: "Flight 175 strikes the South Tower",
    detail: "The 9/11 Commission gives the South Tower impact time as 09:03:11.",
    category: "wtc",
    flightId: "ua175",
    source: "9/11 Commission Report, Chapter 9"
  },
  {
    id: "ua93-hijacked",
    clockSeconds: secondsOfDay("09:28:00"),
    timeLabel: "09:28",
    shortLabel: "UA93 hijacked",
    title: "United Airlines Flight 93 hijacked",
    detail: "Cleveland Center hears the cockpit struggle as Flight 93 is hijacked at 09:28.",
    category: "ua93",
    flightId: "ua93",
    source: "NPS Flight 93 National Memorial timeline"
  },
  {
    id: "aa77-impact-window",
    clockSeconds: secondsOfDay("09:37:45"),
    endClockSeconds: secondsOfDay("09:37:46"),
    timeLabel: "09:37:45-46",
    shortLabel: "AA77 impact",
    title: "American Airlines Flight 77 impacts the Pentagon",
    detail:
      "NTSB Flight Path Study material places the impact at about 09:37:45, while the 9/11 Commission timeline gives 09:37:46. The loaded decoded FDR stream still has rows through 09:37:52, so the viewer marks this as a public-record impact window rather than using it to truncate or overwrite the replay path.",
    category: "aa77",
    flightId: "aa77",
    source: "NTSB Flight Path Study; 9/11 Commission Report"
  },
  {
    id: "aa77-last-fdr-row",
    clockSeconds: secondsOfDay("09:37:52"),
    timeLabel: "09:37:52",
    shortLabel: "AA77 last FDR",
    title: "AA77 last decoded FDR row",
    detail: "The replay ends at the last loaded decoded public FDR row rather than extending to an extra app-inferred endpoint.",
    category: "aa77",
    flightId: "aa77",
    source: "Decoded FDR CSV output"
  },
  {
    id: "ua93-impact",
    clockSeconds: secondsOfDay("10:03:11"),
    timeLabel: "10:03:11",
    shortLabel: "UA93 impact",
    title: "United Airlines Flight 93 crashes near Shanksville",
    detail: "The 9/11 Commission timeline places the Flight 93 crash near Shanksville, Pennsylvania at 10:03:11.",
    category: "ua93",
    flightId: "ua93",
    source: "9/11 Commission Report"
  }
];

export const flightTimelineOrder: FlightId[] = ["aa11", "ua175", "aa77", "ua93"];

export const flightTimelineProfiles: Record<FlightId, FlightTimelineProfile> = {
  aa11: {
    id: "aa11",
    label: "American Airlines Flight 11",
    shortLabel: "AA11",
    callsign: "American 11",
    route: "Boston Logan (BOS) to Los Angeles (LAX)",
    aircraft: "Boeing 767-223ER",
    takeoffLabel: "07:59",
    terminalLabel: "08:46:40 North Tower",
    loadedData: "3d_radar",
    summary: "Timed public DCC radar samples now drive the reconstructed 3D path through the North Tower impact endpoint.",
    caveat: "No AA11 FDR/CVR was recovered, so roll, pitch, controls, and autopilot/nav states remain unavailable."
  },
  ua175: {
    id: "ua175",
    label: "United Airlines Flight 175",
    shortLabel: "UA175",
    callsign: "United 175",
    route: "Boston Logan (BOS) to Los Angeles (LAX)",
    aircraft: "Boeing 767-222",
    takeoffLabel: "08:14",
    terminalLabel: "09:03:11 South Tower",
    loadedData: "3d_radar",
    summary: "Timed public DCC radar samples now drive the reconstructed 3D path through the South Tower impact endpoint.",
    caveat: "No UA175 FDR/CVR was recovered, so roll, pitch, controls, and autopilot/nav states remain unavailable."
  },
  aa77: {
    id: "aa77",
    label: "American Airlines Flight 77",
    shortLabel: "AA77",
    callsign: "American 77",
    route: "Washington Dulles (IAD) to Los Angeles (LAX)",
    aircraft: "Boeing 757-223",
    takeoffLabel: "08:20",
    terminalLabel: "09:37:45-46 Pentagon",
    loadedData: "3d_fdr",
    summary: "Decoded public FDR rows drive the current 3D replay from the Dulles runway sample onward.",
    caveat: "Pre-runway taxi is timeline context only; the loaded 3D path begins at the first decoded FDR position row."
  },
  ua93: {
    id: "ua93",
    label: "United Airlines Flight 93",
    shortLabel: "UA93",
    callsign: "United 93",
    route: "Newark (EWR) to San Francisco (SFO)",
    aircraft: "Boeing 757-222",
    takeoffLabel: "08:42",
    terminalLabel: "10:03:11 Shanksville",
    loadedData: "3d_public_fdr",
    summary: "Public black-box coordinate samples now drive the reconstructed 3D path through the Shanksville impact endpoint.",
    caveat: "The app has coordinate/altitude samples for UA93, but not the full decoded attitude/control-channel table."
  }
};

export const contextTimelineEndSeconds = Math.max(
  ...contextTimelineEvents.map((event) => event.endClockSeconds ?? event.clockSeconds)
);
export const replayStartClockSeconds = secondsOfDay(replayStartClock);
export const sharedTimelineStartReplayOffset = contextTimelineStartSeconds - replayStartClockSeconds;
export const sharedTimelineEndReplayOffset = contextTimelineEndSeconds - replayStartClockSeconds;

export function secondsOfDay(clock: string) {
  const [hours, minutes, seconds = 0] = clock.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export function clockFromSeconds(totalSeconds: number) {
  const normalized = ((Math.round(totalSeconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;

  return seconds === 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
