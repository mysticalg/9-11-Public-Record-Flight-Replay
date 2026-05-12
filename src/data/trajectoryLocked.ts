import type { EventMarker, ReplayPoint, SourceRecord } from "../types";
import fdrTrajectory from "./fdrTrajectory.generated.json";

export const replayStartClock = fdrTrajectory.replayStart.firstDecodedLocalClock;

export const trajectoryNotice =
  "Trajectory uses decoded public FDR CSV rows from the first available Dulles ground/runway row at 08:19:05 local time through the last decoded public FDR row, including altitude, true heading/yaw, pitch, roll, and groundspeed where available. After the final decoded FDR row, the viewer adds a short passive ASCE/evidence-aligned impact visualization so the collision sequence can be seen; the final seconds plus terminal segment currently ease the visual aircraft attitude to a user-requested +20 deg right bank while preserving the source FDR roll values separately. The terminal segment uses a tangent-preserving Hermite continuation from the last decoded FDR motion and is explicitly labeled low confidence, not decoded FDR data, a flyable path, or a damage-engineering model. Gate pushback and taxi before the FDR position stream are shown only as timeline context because the loaded public CSV does not contain an exact gate-to-runway taxi trace. Above the radio-height range, visualization altitude uses the decoded 1013.25mb altitude column; the alternate coarse/fine pressure-altitude output has a visible wrap artifact during climb. Low-level radio-height rows are displayed as terrain-relative AGL with an aircraft-model centerline clearance offset; this prevents visual ground tunneling but is not an aerodynamic ground-effect simulation. Smooth replay applies display-only local regression to position to reduce decoded lat/lon quantization drift; raw source telemetry remains listed in the panels and plots. Vertical speed is a smoothed derivative from nearby altitude samples, not a separate FDR vertical-speed channel. The aircraft model is visually aligned to the rendered path bearing while source heading/track remain listed in telemetry.";

export const airportTimelineNotice =
  "Airport timing: the public timeline places AA77 pushback at 08:09 and takeoff around 08:20. The loaded FDR path starts at 08:19:05 near the Dulles runway, and the first airborne FDR sample is at 08:20:25. BTS September 2001 data shows AA144 LAX-IAD arriving at Dulles at 20:27 on September 10, but the loaded official fields do not verify that record as N644AA, so the viewer does not mark a previous-day aircraft arrival as confirmed.";

export const navSystemsNotice =
  "Autopilot/nav fields are displayed only when present in the decoded FDR CSV. In this replay window the MCP A/P command channels read not engaged, the right CWS channel is recorded engaged, flight directors are recorded off, VNAV/IAS/Mach mode flags are intermittent, and VOR/DME values are raw tuned/decoded radio-nav values. These fields show recorded system states; they do not identify who adjusted a control or why.";

export const trajectoryPoints: ReplayPoint[] = fdrTrajectory.points.map((point) => ({
  t: point.t,
  x: point.x,
  y: point.y,
  z: point.z,
  utc: point.utc,
  lat: point.lat,
  lon: point.lon,
  altitudeFeet: point.altitudeFeet,
  altitudeSource: point.altitudeSource,
  headingDeg: point.headingDeg,
  trackDeg: point.trackDeg,
  pitchDeg: point.pitchDeg,
  rollDeg: point.rollDeg,
  groundSpeedKt: point.groundSpeedKt,
  computedAirspeedKt: point.computedAirspeedKt,
  trueAirspeedKt: point.trueAirspeedKt,
  mach: point.mach,
  verticalAccelG: point.verticalAccelG,
  lateralAccelG: point.lateralAccelG,
  longitudinalAccelG: point.longitudinalAccelG,
  leftAileronDeg: point.leftAileronDeg,
  rightAileronDeg: point.rightAileronDeg,
  rudderDeg: point.rudderDeg,
  rudderPedalDeg: point.rudderPedalDeg,
  flapHandleDeg: point.flapHandleDeg,
  overspeed: point.overspeed,
  nav: point.nav,
  confidence: point.confidence as ReplayPoint["confidence"],
  sourceRef: point.sourceRef
}));

export const eventMarkers: EventMarker[] = [
  {
    t: 0,
    timeLabel: replayStartClock,
    title: "Dulles FDR ground/runway row",
    description:
      "Replay begins at the first decoded FDR row with a valid timestamp and position near Washington Dulles. This is the first loaded ground/runway sample, not a gate pushback or full taxi trace.",
    source: "Warren Stutt decoded AA77 FDR CSV output from NTSB FOIA material",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("08:20:25"),
    timeLabel: "08:20:25",
    title: "FDR first airborne row",
    description:
      "Decoded radio-height and speed values indicate the aircraft is airborne in this sample. Public FAA/Commission timelines list takeoff from Dulles at about 08:20.",
    source: "Decoded FDR CSV output; 9/11 Commission Report",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("08:50:51"),
    timeLabel: "08:50:51",
    title: "Last routine radio contact",
    description:
      "The 9/11 Commission timeline identifies the last routine radio communication from American 77 around this time before the flight deviated from its cleared route.",
    source: "9/11 Commission Report",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("08:54:00"),
    timeLabel: "08:54",
    title: "Course deviation / hijack window",
    description:
      "American 77 deviates from its assigned course during this window; the replay continues to use FDR position samples rather than inferring crew or hijacker actions.",
    source: "9/11 Commission Report",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("08:56:00"),
    timeLabel: "08:56",
    title: "Transponder signal lost",
    description:
      "Public timelines place the loss or shutdown of the transponder shortly after the course deviation. FDR position and attitude samples continue in the replay data.",
    source: "9/11 Commission Report",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("09:10:01"),
    timeLabel: "09:10:01",
    title: "Former replay start reference",
    description:
      "Earlier versions of this viewer began near this point. The current replay keeps the preceding Dulles departure and climb/turn segments.",
    source: "Decoded FDR CSV output",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("09:35:00"),
    timeLabel: "09:35:00",
    title: "Final-approach replay segment",
    description: "The previously loaded final-approach window begins here; the expanded replay now preserves the earlier decoded FDR path before this point.",
    source: "Decoded FDR CSV output",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("09:37:00"),
    timeLabel: "09:37:00",
    title: "Low-altitude FDR segment",
    description: "The replay continues through source-derived FDR points; visual interpolation fills only the gaps between sampled rows.",
    source: "Decoded FDR CSV output",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("09:37:45"),
    timeLabel: "09:37:45-46",
    title: "Public impact time window",
    description:
      "Public sources place the Pentagon impact at about 09:37:45-09:37:46. This marker is timeline-only because the loaded decoded FDR rows continue through 09:37:52 and the app does not force the replay aircraft onto the facade at this time.",
    source: "NTSB Flight Path Study; 9/11 Commission Report",
    confidence: "high",
    timelineOnly: true
  },
  {
    t: secondsFromReplayStart("09:37:52"),
    timeLabel: "09:37:52",
    title: "Last decoded FDR row",
    description: "The decoded FDR portion ends at this row. The viewer continues past it only as a labeled evidence-aligned impact visualization.",
    source: "Decoded FDR CSV output",
    confidence: "high"
  },
  {
    t: secondsFromReplayStart("09:37:52") + 0.1,
    timeLabel: "09:37:52+",
    title: "Evidence-aligned impact visualization",
    description:
      "Display-only terminal segment from the last decoded FDR row toward the ASCE/evidence facade reference so the collision sequence can be viewed. This is not an additional decoded FDR row and not a damage simulation.",
    source: "ASCE/SEI Pentagon Building Performance Report; decoded FDR final row",
    confidence: "low"
  }
];

function secondsFromReplayStart(clock: string) {
  return Math.max(0, secondsOfClock(clock) - secondsOfClock(replayStartClock));
}

function secondsOfClock(clock: string) {
  const [hours, minutes, seconds] = clock.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export const sources: SourceRecord[] = [
  {
    id: "nps-911-timeline",
    title: "National Park Service September 11 timeline",
    type: "Public historical timeline",
    reference: "https://www.nps.gov/flni/learn/historyculture/september-11-2001-timeline.htm",
    confidence: "high",
    role: "documented"
  },
  {
    id: "911-commission-chapter-9",
    title: "9/11 Commission Report, Chapter 9",
    type: "Public historical report",
    reference: "https://govinfo.library.unt.edu/911/report/911Report_Ch9.htm",
    confidence: "high",
    role: "documented"
  },
  {
    id: "911-commission-report",
    title: "9/11 Commission Report",
    type: "Public historical report",
    reference: "https://www.govinfo.gov/content/pkg/GPO-911REPORT/pdf/GPO-911REPORT.pdf",
    confidence: "high",
    role: "documented"
  },
  {
    id: "faa-nara-hijack-events-summary",
    title: "FAA summary of September 11 hijack events",
    type: "Public FAA/NARA record",
    reference:
      "https://s3.us-east-1.amazonaws.com/NARAprodstorage/lz/dc-metro/rg-237/7419198-9-11-faa/4-UAL-175/e-Other/4-AWA-570-Report-Summary-of-Air-Traffic-Hijack-Events.pdf",
    confidence: "high",
    role: "documented"
  },
  {
    id: "aa77-radio-transcript-excerpts",
    title: "AA77 radio transmission transcript excerpts",
    type: "Public ATC transcript excerpts",
    reference:
      "NTSB/FAA AAL77 ATC transcript material, with line excerpts mirrored in public transcript archives. Original AA77 voice clip files are not bundled; the app uses clearly labeled browser transcript playback.",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "bts-september-2001-on-time",
    title: "BTS September 2001 airline on-time performance data",
    type: "Public airline operations data",
    reference:
      "https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_2001_9.zip",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "ntsb-aa77-flight-path-study",
    title: "NTSB Flight Path Study for American Airlines Flight 77",
    type: "Public technical study",
    reference: "https://www.ntsb.gov/about/Documents/Flight_Path_Study_AA77.pdf",
    confidence: "high",
    role: "documented"
  },
  {
    id: "ntsb-aa11-flight-path-study",
    title: "NTSB Flight Path Study for American Airlines Flight 11",
    type: "Public technical study",
    reference:
      "https://www.ntsb.gov/about/Documents/Flight_Path_Study_AA11.pdf; used with timed public DCC radar KML samples to reconstruct the non-FDR path.",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "ntsb-ua175-flight-path-study",
    title: "NTSB Flight Path Study for United Airlines Flight 175",
    type: "Public technical study",
    reference:
      "https://www.ntsb.gov/about/Documents/Flight_Path_Study_UA175.pdf; used with timed public DCC radar KML samples to reconstruct the non-FDR path.",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "ntsb-ua93-flight-path-study",
    title: "NTSB Flight Path Study for United Airlines Flight 93",
    type: "Public technical study",
    reference:
      "https://www.ntsb.gov/about/Documents/Flight_Path_Study_UA93.pdf; used with public UA93 black-box coordinate KML samples for the 3D path.",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "public-911maps-flight-tracks",
    title: "Public 9/11 timed radar and black-box KML tracks",
    type: "Public compiled geospatial data",
    reference:
      "http://www.11-septembre.com/GoogleEarth/911maps.kmz and http://www.11-septembre.com/GoogleEarth/Avions/UAL93BlackBoxDatas.kmz; local generated sample file produced by scripts/generate-public-flight-tracks.mjs.",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "ntsb-aa77-fdr-report",
    title: "NTSB Flight Data Recorder report for American Airlines Flight 77",
    type: "Public technical report",
    reference: "https://www.ntsb.gov/about/Documents/AAL77_fdr.pdf",
    confidence: "high",
    role: "documented"
  },
  {
    id: "decoded-fdr-csv",
    title: "Decoded AA77 FDR CSV output",
    type: "Public decoded data archive",
    reference: "http://www.warrenstutt.com/AAL77FDRDecoder/OutputFiles/index.html",
    confidence: "high",
    role: "documented"
  },
  {
    id: "fdr-mode-nav-fields",
    title: "Decoded FDR autopilot, nav, speed, and acceleration fields",
    type: "Public decoded data fields",
    reference:
      "Local decoded FinalFlightCompleteWithMaxOneLine CSV columns for A/P command/CWS, autothrottle, flight-director, VNAV/IAS/Mach mode flags, VOR/DME, computed airspeed, Mach, overspeed, and G-loads.",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "planned-route-reference",
    title: "Original planned route reference",
    type: "Great-circle route reference",
    reference:
      "Blue line is a clipped IAD-to-LAX great-circle reference for the scheduled destination, not the filed FAA airway route.",
    confidence: "medium",
    role: "inferred"
  },
  {
    id: "pentagon-security-footage",
    title: "Released Pentagon security-camera footage",
    type: "Public video reference",
    reference:
      "Wikimedia Commons public-domain mirrors of the DoD/Judicial Watch FOIA release. Current app camera transforms use a working west-wall/south-parking checkpoint reference of about 38°52'16\"N 77°03'29\"W supplied during this session; exact surveyed camera coordinates and lens model are not public in the loaded sources.",
    confidence: "medium",
    role: "inferred"
  },
  {
    id: "ikonos-pentagon-2001-09-12",
    title: "IKONOS Pentagon satellite reference image",
    type: "Public post-attack satellite reference image",
    reference:
      "Spaceflight Now copy of a Space Imaging/GeoEye IKONOS image collected September 12, 2001 at about 11:46 a.m. EDT. The app uses it as an approximate hand-fit visual overlay, not as a georeferenced tile.",
    confidence: "medium",
    role: "inferred"
  },
  {
    id: "asce-building-performance-report",
    title: "Pentagon Building Performance Report",
    type: "Public engineering report",
    reference:
      "NIST-hosted ASCE/SEI report covering aircraft dimensions, level first-story impact, generator/vent contact, 42-degree damage angle, and Ring E/D/C damage path.",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "osm-pentagon-footprint",
    title: "Pentagon building footprint",
    type: "Public map geometry",
    reference: "OpenStreetMap relation 89605 via local Overpass export in /sources/osm-pentagon-overpass.json",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "osm-site-context",
    title: "Pentagon-area roads, ramps, and terrain context",
    type: "Public map geometry",
    reference:
      "OpenStreetMap/Overpass export in /sources/site-context-overpass.json; road surfaces are centerline-derived. General street-light scale cues are not rendered; the scene keeps only the five documented struck-light-pole evidence cues.",
    confidence: "medium",
    role: "inferred"
  },
  {
    id: "ned10m-site-terrain",
    title: "Pentagon-area terrain elevation mesh",
    type: "Public elevation data",
    reference:
      "OpenTopoData NED 10m API using USGS National Elevation Dataset / 3DEP-derived elevation samples, stored in /src/data/siteContext.generated.json.",
    confidence: "medium",
    role: "inferred"
  },
  {
    id: "satellite-tile-overlay",
    title: "Multi-site georeferenced satellite tile overlay",
    type: "Map imagery layer",
    reference:
      "Esri World Imagery tiles placed by Web Mercator bounds against the app's local ENU anchor, using low-zoom route context plus high-zoom Pentagon, WTC, Shanksville, and Dulles runway/takeoff site tiles.",
    confidence: "medium",
    role: "inferred"
  },
  {
    id: "wtc-scale-massing",
    title: "World Trade Center scale massing",
    type: "Public map and building-dimension geometry",
    reference:
      "Bundled 911maps WTC 1/2 exterior-box KML coordinates combined with public NIST tower heights. Rendered as scale context and impact reference bands, not structural damage simulation.",
    confidence: "medium",
    role: "inferred"
  },
  {
    id: "nist-wtc-impact-attitudes",
    title: "WTC aircraft impact attitude references",
    type: "Public impact-condition analysis",
    reference:
      "NIST NCSTAR 1-2 refined impact-condition tables are used only to blend passive WTC terminal visual attitude: AA11 about 443 mph, 10.6 deg below horizontal, 25 deg left-wing-down; UA175 about 542 mph, 6 deg below horizontal, -3 deg yaw relative to trajectory, 38 deg left-wing-down.",
    confidence: "medium",
    role: "documented"
  },
  {
    id: "shanksville-site-marker",
    title: "Flight 93 Shanksville site marker",
    type: "Public terminal site context",
    reference:
      "Public UA93 black-box KML terminal coordinate and 9/11 Commission/NPS crash-time context. Rendered as satellite plus marker only in this pass.",
    confidence: "medium",
    role: "inferred"
  },
  {
    id: "boeing-757-200-dimensions",
    title: "Boeing 757-200 aircraft dimensions",
    type: "Manufacturer geometry reference",
    reference: "Boeing 757-200 general-arrangement dimensions: 47.3 m length, 38.0 m wingspan, 13.6 m height.",
    confidence: "high",
    role: "documented"
  },
  {
    id: "boeing-767-200-dimensions",
    title: "Boeing 767-200 aircraft dimensions",
    type: "Manufacturer geometry reference",
    reference: "Boeing 767-200 general-arrangement dimensions: about 48.5 m length, 47.6 m wingspan, 15.9 m height.",
    confidence: "high",
    role: "documented"
  },
  {
    id: "mvp-scene-model",
    title: "Simplified external scene model",
    type: "MVP geometry",
    reference: "Pentagon footprint is map-derived; hand-placed heliport/generator/trailer/checkpoint reference objects have been removed until calibrated.",
    confidence: "low",
    role: "artistic_interpolation"
  }
];
