export type SatelliteOverlayMode = "modern" | "ikonos_2001_reference";

export const satelliteOverlaySources = {
  modern: {
    id: "modern",
    label: "Modern LOD imagery",
    shortLabel: "Modern LOD",
    type: "tile",
    tileTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    servicePage: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
    credit: "Esri World Imagery service",
    note:
      "Low-zoom regional tiles cover the wider aircraft paths, while high-zoom site tiles cover the Pentagon, WTC, Shanksville, and the AA77 Dulles runway segment. Tiles are positioned from Web Mercator bounds against the same local ENU anchor as the flight paths. Imagery date and horizontal error vary by source tile."
  },
  ikonos_2001_reference: {
    id: "ikonos_2001_reference",
    label: "2001 archival reference overlays",
    shortLabel: "2001 refs",
    type: "single_image",
    imagePath: "/sources/pentagon_ikonos_2001_09_12_spaceflightnow.jpg",
    servicePage: "https://spaceflightnow.com/news/n0109/12ikonospentagon/",
    credit: "Space Imaging/GeoEye IKONOS image via Spaceflight Now",
    acquired: "2001-09-12 11:46 EDT",
    // The public reference image is not distributed as a georeferenced tile. These
    // values hand-fit the raster over the OSM Pentagon footprint for visual comparison.
    approximatePlacement: {
      centerX: 202,
      centerZ: 52,
      widthMeters: 520,
      heightMeters: 632,
      rotationDeg: 0
    },
    note:
      "Reference-only 2001 overlays where local assets are available. The bundled Pentagon IKONOS public JPG is not an orthorectified/georeferenced map tile, so it is hand-fit against the Pentagon footprint and should not be used for scale or coordinate claims."
  }
} as const;

export const satelliteOverlayModeOptions: SatelliteOverlayMode[] = ["modern", "ikonos_2001_reference"];
export const satelliteOverlaySource = {
  ...satelliteOverlaySources.modern,
  tileTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  servicePage: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
  zoomLevel: 18,
  paddingMeters: 520,
  siteZoomLevel: 17,
  sitePaddingMeters: 120,
  regionalZoomLevel: 8,
  regionalPaddingMeters: 2200,
  wtcZoomLevel: 18,
  wtcPaddingMeters: 620,
  shanksvilleZoomLevel: 17,
  shanksvillePaddingMeters: 900,
  runwayZoomLevel: 17,
  runwayPaddingMeters: 650,
  runwayReplaySeconds: 100,
  approximateMetersPerPixelAtSite: 0.47
};
