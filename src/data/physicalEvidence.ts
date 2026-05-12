export const physicalEvidenceNotice =
  "Evidence overlay is source-attributed, not survey-grade. NTSB documents the FDR/radar/ATC flight-path basis; the NIST-hosted ASCE report documents the level approach, generator/vent contacts, approximately 42-degree structural damage angle, Ring E/D/C damage path, exterior column-line damage, and first-story interior column references. The current facade contact reference is shifted about 49 m south along the west facade from the original local map anchor to align the visible contact/collapse zone with the ASCE-described damaged facade region; it is still a best-fit visualization, not a surveyed coordinate. The ASCE grid overlay is encoded from report distances/column labels and mapped to that facade reference; it is not a structural damage simulation. The final decoded FDR heading diagnostic is calculated from the last decoded FDR row and remains separate from the evidence-aligned impact visualization. Only the five documented struck light poles are drawn; their exact surveyed coordinates are still not loaded.";

export const physicalEvidenceSources = [
  {
    label: "NTSB Flight Path Study",
    reference: "https://www.ntsb.gov/about/Documents/Flight_Path_Study_AA77.pdf"
  },
  {
    label: "NIST-hosted ASCE Pentagon Building Performance Report",
    reference: "https://www.nist.gov/publications/pentagon-building-performance-report"
  }
];
