import type { FlightId } from "../types";
import { publicFlightTrackSamples, type PublicFlightTrackSample } from "./publicFlightTrackSamples.generated";

export type PublicFlightWaypoint = PublicFlightTrackSample;

export interface PublicFlightPathDefinition {
  id: Exclude<FlightId, "aa77">;
  label: string;
  sourceSummary: string;
  sourceUrl: string;
  caveat: string;
  waypoints: PublicFlightWaypoint[];
}

export const publicFlightPathDefinitions: Record<Exclude<FlightId, "aa77">, PublicFlightPathDefinition> = {
  aa11: {
    id: "aa11",
    label: "American Airlines Flight 11 public radar reconstruction",
    sourceSummary: "Timed DCC radar-track samples plus NTSB/Commission impact timing",
    sourceUrl: "http://www.11-septembre.com/GoogleEarth/911maps.kmz",
    caveat:
      "AA11 FDR/CVR were not recovered; path is a public radar reconstruction, so attitude/control values are not source-recorded.",
    waypoints: publicFlightTrackSamples.aa11
  },
  ua175: {
    id: "ua175",
    label: "United Airlines Flight 175 public radar reconstruction",
    sourceSummary: "Timed DCC radar-track samples plus NTSB/Commission impact timing",
    sourceUrl: "http://www.11-septembre.com/GoogleEarth/911maps.kmz",
    caveat:
      "UA175 FDR/CVR were not recovered; path is a public radar reconstruction, so attitude/control values are not source-recorded.",
    waypoints: publicFlightTrackSamples.ua175
  },
  ua93: {
    id: "ua93",
    label: "United Airlines Flight 93 public black-box reconstruction",
    sourceSummary: "Public UA93 black-box coordinate KML samples plus NTSB/Commission impact timing",
    sourceUrl: "http://www.11-septembre.com/GoogleEarth/Avions/UAL93BlackBoxDatas.kmz",
    caveat:
      "UA93 uses public black-box coordinate samples, but this app does not yet bundle the full decoded attitude/control-channel table.",
    waypoints: publicFlightTrackSamples.ua93
  }
};
