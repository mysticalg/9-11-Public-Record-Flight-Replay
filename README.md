# 9/11 Public Record Flight Replay

Live GitHub Pages build: https://mysticalg.github.io/Pentaboom/

A non-operational historical visualization of public-record flight paths and terminal-site context for AA11, UA175, AA77, and UA93.

This project is a passive, source-attributed replay and camera-reconstruction tool. It is not a flight simulator, flight-training tool, targeting system, or procedural aviation guide.

## Current MVP Scope

- React, TypeScript, Vite, Three.js, and Zustand.
- Pentagon exterior massing generated from OpenStreetMap footprint geometry.
- Scale-context WTC 1 and WTC 2 massing from public footprint/height references.
- Boeing 757-200 and 767-200 aircraft dimension mapping by selected flight.
- Esri World Imagery satellite overlay rendered from georeferenced Web Mercator tiles with route and terminal-site LOD.
- Locked, non-editable replay data.
- Shared timeline controls, flight tabs, camera presets, source markers, and uncertainty corridor.
- Fixed security-camera reconstruction presets with archival styling.
- Launch disclaimer and ethics notice.

The bundled trajectory uses decoded public FDR CSV rows and ends at the last decoded FDR row without appending an app-inferred endpoint. Security-camera positions/FOV and former diagram-style site objects are not treated as exact; uncalibrated heliport, generator, trailer, and checkpoint objects have been removed until they have documented coordinates.

## Commands

```bash
npm install
npm run dev
npm run build
npm run build:pages
```
