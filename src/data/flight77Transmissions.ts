import { secondsOfDay } from "./contextTimeline";

export interface Flight77Transmission {
  id: string;
  clockSeconds: number;
  timeLabel: string;
  speaker: "AAL77";
  summary: string;
  transcript: string;
  source: string;
  sourceUrl: string;
}

const transcriptSource = "Public AA77 ATC transcript excerpts";
const transcriptSourceUrl = "https://www.pprune.org/archive/index.php/t-1300.html";

export const flight77Transmissions: Flight77Transmission[] = [
  {
    id: "aa77-ground-checkin",
    clockSeconds: secondsOfDay("08:12:29"),
    timeLabel: "08:12:29",
    speaker: "AAL77",
    summary: "Ground check-in",
    transcript: "Good morning ground, American seven seven is off of Dixie twenty six with information Tango.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-taxi-readback",
    clockSeconds: secondsOfDay("08:12:39"),
    timeLabel: "08:12:39",
    speaker: "AAL77",
    summary: "Taxi readback",
    transcript: "Taxi three zero, American seven seven.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-ready-call",
    clockSeconds: secondsOfDay("08:16:29"),
    timeLabel: "08:16:29",
    speaker: "AAL77",
    summary: "Ready call",
    transcript: "And American ah seven seven is ready.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-position-hold-readback",
    clockSeconds: secondsOfDay("08:16:41"),
    timeLabel: "08:16:41",
    speaker: "AAL77",
    summary: "Position-and-hold readback",
    transcript: "Position and hold three zero, American seven seven.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-takeoff-readback",
    clockSeconds: secondsOfDay("08:19:27"),
    timeLabel: "08:19:27",
    speaker: "AAL77",
    summary: "Takeoff clearance readback",
    transcript: "One two five oh five. Runway three zero cleared for takeoff, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-departure-handoff",
    clockSeconds: secondsOfDay("08:20:31"),
    timeLabel: "08:20:31",
    speaker: "AAL77",
    summary: "Departure handoff",
    transcript: "Two seventy heading departure, American 77. Good day.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-departure-checkin",
    clockSeconds: secondsOfDay("08:20:38"),
    timeLabel: "08:20:38",
    speaker: "AAL77",
    summary: "Departure check-in",
    transcript: "American 77 is with you passing one decimal one for three.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-climb-5000",
    clockSeconds: secondsOfDay("08:20:47"),
    timeLabel: "08:20:47",
    speaker: "AAL77",
    summary: "Climb 5,000 readback",
    transcript: "Five thousand, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-climb-11000",
    clockSeconds: secondsOfDay("08:22:08"),
    timeLabel: "08:22:08",
    speaker: "AAL77",
    summary: "Climb readback",
    transcript: "Up to one one thousand, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-direct-linden-handoff",
    clockSeconds: secondsOfDay("08:23:28"),
    timeLabel: "08:23:28",
    speaker: "AAL77",
    summary: "Direct Linden handoff",
    transcript: "Direct Linden eighteen sixty seven, American 77. Good day.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-approach-checkin",
    clockSeconds: secondsOfDay("08:23:43"),
    timeLabel: "08:23:43",
    speaker: "AAL77",
    summary: "Approach check-in",
    transcript: "American 77 with you passing nine decimal one for eleven one one thousand.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-climb-17000",
    clockSeconds: secondsOfDay("08:23:50"),
    timeLabel: "08:23:50",
    speaker: "AAL77",
    summary: "Climb 17,000 readback",
    transcript: "One seven thousand, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-washington-center-frequency",
    clockSeconds: secondsOfDay("08:25:37"),
    timeLabel: "08:25:37",
    speaker: "AAL77",
    summary: "Washington Center handoff",
    transcript: "Point six five, American 77, thank you ma'am. Good day.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-washington-center",
    clockSeconds: secondsOfDay("08:25:49"),
    timeLabel: "08:25:49",
    speaker: "AAL77",
    summary: "Washington Center check-in",
    transcript: "Center, American 77 with you passing one three decimal zero for one seven thousand.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-fl270-readback",
    clockSeconds: secondsOfDay("08:26:00"),
    timeLabel: "08:26:00",
    speaker: "AAL77",
    summary: "FL270 readback",
    transcript: "Two seven zero, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-frequency-13327",
    clockSeconds: secondsOfDay("08:30:42"),
    timeLabel: "08:30:42",
    speaker: "AAL77",
    summary: "Frequency change",
    transcript: "Ah thirty three twenty seven, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-passing-fl251",
    clockSeconds: secondsOfDay("08:31:08"),
    timeLabel: "08:31:08",
    speaker: "AAL77",
    summary: "Passing FL251",
    transcript: "American 77 passing two five decimal one for two seven oh.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-fl290-readback",
    clockSeconds: secondsOfDay("08:31:30"),
    timeLabel: "08:31:30",
    speaker: "AAL77",
    summary: "FL290 readback",
    transcript: "Two niner zero, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-turn-20-right",
    clockSeconds: secondsOfDay("08:34:19"),
    timeLabel: "08:34:19",
    speaker: "AAL77",
    summary: "Turn 20 right readback",
    transcript: "Turn twenty right, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-request-final-altitude",
    clockSeconds: secondsOfDay("08:37:39"),
    timeLabel: "08:37:39",
    speaker: "AAL77",
    summary: "Requests FL350 final",
    transcript: "Direct Henderson out of two nine for three nine oh, requesting three five zero for a final, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-repeat-final-altitude-request",
    clockSeconds: secondsOfDay("08:37:57"),
    timeLabel: "08:37:57",
    speaker: "AAL77",
    summary: "Repeats FL350 request",
    transcript: "Center, American 77, you copy request for three five zero as a final?",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-fl350-final-readback",
    clockSeconds: secondsOfDay("08:38:03"),
    timeLabel: "08:38:03",
    speaker: "AAL77",
    summary: "FL350 final readback",
    transcript: "Three five zero for a final, American 77, thank you sir.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-stop-fl330",
    clockSeconds: secondsOfDay("08:39:36"),
    timeLabel: "08:39:36",
    speaker: "AAL77",
    summary: "Stop at FL330",
    transcript: "American 77 stop at three three zero.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-indy-frequency",
    clockSeconds: secondsOfDay("08:40:06"),
    timeLabel: "08:40:06",
    speaker: "AAL77",
    summary: "Indy Center handoff",
    transcript: "Twenty five seven, American 77, thanks sir. Good day.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-indy-checkin",
    clockSeconds: secondsOfDay("08:40:14"),
    timeLabel: "08:40:14",
    speaker: "AAL77",
    summary: "Indianapolis Center check-in",
    transcript: "Center, American 77 with you level three three zero.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-squawk-readback",
    clockSeconds: secondsOfDay("08:40:18"),
    timeLabel: "08:40:18",
    speaker: "AAL77",
    summary: "Squawk readback",
    transcript: "Three seven four three, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-fl350-readback",
    clockSeconds: secondsOfDay("08:43:54"),
    timeLabel: "08:43:54",
    speaker: "AAL77",
    summary: "FL350 readback",
    transcript: "Thirty three for three five oh, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-turn-right-readback",
    clockSeconds: secondsOfDay("08:47:23"),
    timeLabel: "08:47:23",
    speaker: "AAL77",
    summary: "Traffic-vector readback",
    transcript: "Ten right, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-turn-right-repeat",
    clockSeconds: secondsOfDay("08:47:33"),
    timeLabel: "08:47:33",
    speaker: "AAL77",
    summary: "Traffic-vector repeat",
    transcript: "Ten right, American 77.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  },
  {
    id: "aa77-last-routine-radio",
    clockSeconds: secondsOfDay("08:50:51"),
    timeLabel: "08:50:51",
    speaker: "AAL77",
    summary: "Last routine radio call",
    transcript: "Uh, direct Falmouth, American 77, thank you.",
    source: transcriptSource,
    sourceUrl: transcriptSourceUrl
  }
];
