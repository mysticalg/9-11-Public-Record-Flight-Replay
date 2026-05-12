import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ASCE_FT_TO_M, asceDamageGrid, type AsceFacadeColumnStatus } from "../data/asceDamageGrid";
import { satelliteOverlaySource, satelliteOverlaySources, type SatelliteOverlayMode } from "../data/imagerySources";
import osmPentagonFootprint from "../data/osmPentagonFootprint.generated.json";
import { getSecurityVideoSource } from "../data/securitySources";
import siteContext from "../data/siteContext.generated.json";
import { siteDefinitions, terminalSiteForFlight, wtcTowerDefinitions } from "../data/siteDefinitions";
import { publicFlightPathDefinitions } from "../data/publicFlightPaths";
import { eventMarkers, trajectoryPoints } from "../data/trajectoryLocked";
import { formatHistoricalClock } from "../engine/clock";
import { cameraPresets, effectiveCameraFov, securityCameraPlacement, type CameraFovOverrides } from "../engine/cameraPresets";
import { evidenceImpactReferencePoint, impactReferenceHeightMeters } from "../engine/impactReference";
import {
  allPublicFlightPathWorldPoints,
  getFlightReplayState,
  isFlightReplayDataVisible,
  publicFlightPathWorldPoints
} from "../engine/multiFlightPlayer";
import {
  PENTAGON_HEIGHT_M,
  aircraftReferenceDimensionsForFlight,
  boeing757200ReferenceDimensions,
  pentagonReferenceDimensions
} from "../engine/siteGeometry";
import { fdrReplayDuration, getReplayState, replayDuration } from "../engine/trajectoryPlayer";
import { useReplayStore, type CameraPoseSnapshot } from "../store/replayStore";
import type { CameraMode, FlightId, ReplayState, SiteId } from "../types";

interface ReplaySceneProps {
  currentTime: number;
  timelineTime: number;
  activeFlightId: FlightId;
  cameraMode: CameraMode;
  cameraFovOverrides: CameraFovOverrides;
  cameraResetRevision: number;
  showLabels: boolean;
  showFlightPath: boolean;
  showPlannedRoute: boolean;
  showAircraftMarker: boolean;
  showSourceMarkers: boolean;
  showUncertainty: boolean;
  showSiteContext: boolean;
  showSatelliteOverlay: boolean;
  satelliteOverlayMode: SatelliteOverlayMode;
  showCameraFrustums: boolean;
  showOriginalSecurityFrames: boolean;
  smoothReplay: boolean;
}

interface SceneHandles {
  aircraft: THREE.Group;
  aircraftDistanceGlyph: THREE.Sprite;
  allAircraftMarkers: THREE.Group;
  terrainGrid: THREE.GridHelper;
  flightPath: THREE.Object3D;
  plannedRoute: THREE.Object3D;
  satelliteOverlay: THREE.Group;
  historicalSatelliteOverlay: THREE.Group;
  multiSiteContext: THREE.Group;
  siteContext: THREE.Group;
  siteTerrainMesh: THREE.Mesh;
  labels: THREE.Group;
  sourceMarkers: THREE.Group;
  uncertainty: THREE.Group;
  cameraFrustums: THREE.Group;
}

interface TerrainHandles {
  group: THREE.Group;
  grid: THREE.GridHelper;
}

interface RingIntersectionSample {
  inner: { x: number; z: number };
  outer: { x: number; z: number };
}

interface WingPanelOptions {
  side: -1 | 1;
  rootChord: number;
  semiSpan: number;
  tipChord: number;
  sweep: number;
  thickness: number;
  dihedral: number;
  rootOffset: number;
}

interface SiteTerrainSample {
  row: number;
  col: number;
  lat: number;
  lon: number;
  x: number;
  z: number;
  relativeMeters: number;
}

interface SiteRoad {
  id: string;
  name?: string | null;
  ref?: string | null;
  highway: string;
  layer: number;
  bridge: boolean;
  tunnel: boolean;
  widthMeters: number;
  points: Array<{ x: number; z: number }>;
}

interface SiteTerrainSampler {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  stepX: number;
  stepZ: number;
  rows: number;
  cols: number;
  heights: number[][];
}

interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface SatelliteOverlayArea {
  name: string;
  bounds: GeoBounds;
  zoom: number;
  purpose: "regional" | "site" | "runway";
}

interface FootprintEdge {
  start: { x: number; z: number };
  end: { x: number; z: number };
}

const flightForward = new THREE.Vector3(1, 0, 0);
const satelliteOverlayY = 0.48;
const laxAirport = { lat: 33.9416, lon: -118.4085 };
const replayWorldBounds = computeReplayWorldBounds();
const replaySceneSpan = Math.max(
  replayWorldBounds.maxX - replayWorldBounds.minX,
  replayWorldBounds.maxZ - replayWorldBounds.minZ,
  56000
);
const cameraFarPlane = Math.max(90000, replaySceneSpan * 4.5);
const orbitMaxDistance = Math.max(68000, replaySceneSpan * 2.9);
const terrainWorldSize = Math.max(56000, replaySceneSpan * 1.25);
const radioAltimeterToModelCenterMeters = 5.2;
const aircraftLowerGeometryClearanceMeters = 6.4;
const flightMarkerIds: FlightId[] = ["aa11", "ua175", "aa77", "ua93"];
const flightMarkerColors: Record<FlightId, string> = {
  aa11: "#ff9b54",
  ua175: "#63d7ff",
  aa77: "#f0c847",
  ua93: "#88e08a"
};
const terrainWorldCenter = new THREE.Vector3(
  (replayWorldBounds.minX + replayWorldBounds.maxX) / 2,
  0,
  (replayWorldBounds.minZ + replayWorldBounds.maxZ) / 2
);
const siteTerrainSampler = createSiteTerrainSampler();

export function ReplayScene(props: ReplaySceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const originalVideoRef = useRef<HTMLVideoElement | null>(null);
  const compassRingRef = useRef<HTMLDivElement | null>(null);
  const compassReadoutRef = useRef<HTMLElement | null>(null);
  const propsRef = useRef(props);
  const isSecurityView =
    props.cameraMode === "security_cam_01" ||
    props.cameraMode === "security_cam_02" ||
    props.cameraMode === "split_screen";
  const securityVideo = getSecurityVideoSource(props.cameraMode);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    const video = originalVideoRef.current;
    if (!video || !props.showOriginalSecurityFrames || !isSecurityView) {
      return;
    }

    const sourceTime = (securityVideo.replayOffsetSeconds + props.currentTime) % securityVideo.durationSeconds;
    if (Number.isFinite(video.duration) && Math.abs(video.currentTime - sourceTime) > 0.45) {
      video.currentTime = Math.min(sourceTime, video.duration - 0.1);
    }

    void video.play().catch(() => undefined);
  }, [isSecurityView, props.cameraMode, props.currentTime, props.showOriginalSecurityFrames, securityVideo]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141513);
    scene.fog = new THREE.Fog(0x141513, Math.min(12000, replaySceneSpan * 0.05), cameraFarPlane * 0.72);

    const camera = new THREE.PerspectiveCamera(46, 1, 1, cameraFarPlane);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "three-canvas";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = orbitMaxDistance;
    controls.minDistance = 80;
    controls.minPolarAngle = Math.PI * 0.06;
    controls.maxPolarAngle = Math.PI * 0.44;
    const center = footprintCenter();
    controls.target.set(center.x, 25, center.z);
    const persistCameraPose = () => {
      const mode = propsRef.current.cameraMode;
      if (!isCameraPosePersistable(mode)) {
        return;
      }

      const pose = cameraPoseSnapshot(camera, controls);
      const state = useReplayStore.getState();
      if (!cameraPoseSnapshotsAreClose(state.cameraPoseOverrides[mode], pose)) {
        state.setCameraPoseOverride(mode, pose);
      }
    };
    controls.addEventListener("end", persistCameraPose);

    buildLighting(scene);
    const terrain = createGroundPlane();
    scene.add(terrain.group);
    scene.add(createPentagonMassing());

    const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const handles = createReplayObjects(terrain.grid, maxAnisotropy);
    scene.add(handles.satelliteOverlay);
    scene.add(handles.historicalSatelliteOverlay);
    scene.add(handles.multiSiteContext);
    scene.add(handles.siteContext);
    scene.add(handles.uncertainty);
    scene.add(handles.flightPath);
    scene.add(handles.plannedRoute);
    scene.add(handles.sourceMarkers);
    scene.add(handles.labels);
    scene.add(handles.cameraFrustums);
    scene.add(handles.aircraftDistanceGlyph);
    scene.add(handles.allAircraftMarkers);
    scene.add(handles.aircraft);

    let lastMode: CameraMode | null = null;
    let lastActiveFlightId: FlightId = propsRef.current.activeFlightId;
    let lastCameraResetRevision = propsRef.current.cameraResetRevision;
    let lastChaseTarget: THREE.Vector3 | null = null;

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const renderLoop = () => {
      const currentProps = propsRef.current;
      const replayState = getFlightReplayState(currentProps.activeFlightId, currentProps.currentTime, {
        interpolationMode: currentProps.smoothReplay ? "smooth" : "linear"
      });
      const position = displayPositionForReplayState(replayState);
      const tangent = new THREE.Vector3(...replayState.tangent).normalize();
      const activeAircraftVisible = isFlightReplayDataVisible(currentProps.activeFlightId, currentProps.currentTime);

      applyAircraftScale(handles.aircraft, currentProps.activeFlightId);
      handles.aircraft.position.copy(position);
      applyAircraftAttitude(handles.aircraft, replayState);
      handles.aircraft.visible = activeAircraftVisible;
      updateAircraftDistanceGlyph(
        handles.aircraftDistanceGlyph,
        camera,
        position,
        currentProps.cameraMode,
        currentProps.showAircraftMarker && activeAircraftVisible
      );
      updateAllAircraftMarkers(
        handles.allAircraftMarkers,
        camera,
        currentProps.timelineTime,
        currentProps.activeFlightId,
        currentProps.cameraMode,
        currentProps.showAircraftMarker,
        currentProps.smoothReplay
      );
      handles.labels.visible = currentProps.showLabels;
      setSceneLabelVisibility(scene, currentProps.showLabels);
      handles.flightPath.visible = currentProps.showFlightPath;
      handles.plannedRoute.visible = currentProps.showPlannedRoute;
      handles.sourceMarkers.visible = currentProps.showSourceMarkers;
      handles.uncertainty.visible = currentProps.showUncertainty;
      handles.siteContext.visible = currentProps.showSiteContext;
      handles.multiSiteContext.visible = currentProps.showSiteContext;
      handles.satelliteOverlay.visible =
        currentProps.showSatelliteOverlay && currentProps.satelliteOverlayMode === "modern";
      handles.historicalSatelliteOverlay.visible =
        currentProps.showSatelliteOverlay && currentProps.satelliteOverlayMode === "ikonos_2001_reference";
      terrain.group.visible = !currentProps.showSatelliteOverlay;
      handles.siteTerrainMesh.visible = !currentProps.showSatelliteOverlay;
      handles.cameraFrustums.visible = currentProps.showCameraFrustums;
      handles.terrainGrid.visible = !currentProps.showSatelliteOverlay;

      const modeChanged = currentProps.cameraMode !== lastMode;
      const activeFlightChanged = currentProps.activeFlightId !== lastActiveFlightId;
      const cameraResetRequested = currentProps.cameraResetRevision !== lastCameraResetRevision;
      if (modeChanged || activeFlightChanged || cameraResetRequested) {
        applyCameraPreset(
          currentProps.cameraMode,
          camera,
          controls,
          position,
          tangent,
          currentProps.cameraFovOverrides,
          currentProps.activeFlightId
        );
        if (!cameraResetRequested && !activeFlightChanged) {
          restoreCameraPoseOverride(currentProps.cameraMode, camera, controls);
        }
        lastMode = currentProps.cameraMode;
        lastActiveFlightId = currentProps.activeFlightId;
        lastCameraResetRevision = currentProps.cameraResetRevision;
        lastChaseTarget =
          currentProps.cameraMode === "chase_locked" ? getChaseTarget(position, tangent) : null;
      } else if (currentProps.cameraMode === "chase_locked") {
        lastChaseTarget = followChaseTarget(camera, controls, position, tangent, lastChaseTarget);
      } else if (cameraPresets[currentProps.cameraMode].type !== "orbit") {
        applyCameraPreset(
          currentProps.cameraMode,
          camera,
          controls,
          position,
          tangent,
          currentProps.cameraFovOverrides,
          currentProps.activeFlightId
        );
        lastChaseTarget = null;
      } else {
        lastChaseTarget = null;
      }

      updateCameraFrustums(handles.cameraFrustums, currentProps.cameraFovOverrides);

      if (controls.enabled) {
        controls.update();
      } else {
        camera.lookAt(controls.target);
      }
      updateCompassOverlay(compassRingRef.current, compassReadoutRef.current, camera);
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(renderLoop);

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      controls.removeEventListener("end", persistCameraPose);
      controls.dispose();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`scene-stage ${isSecurityView ? "security-stage" : ""} ${
        props.cameraMode === "split_screen" ? "split-stage" : ""
      } ${props.cameraMode === "chase_locked" ? "chase-stage" : ""
      }`}
    >
      {props.cameraMode === "split_screen" ? (
        <div className="comparison-pane" aria-hidden="true">
          {props.showOriginalSecurityFrames ? (
            <video
              ref={originalVideoRef}
              key={securityVideo.id}
              src={securityVideo.src}
              muted
              playsInline
              autoPlay
              loop
              className="security-video"
            />
          ) : null}
          <div className="comparison-caption">
            <span>Original public footage</span>
            <strong>{props.showOriginalSecurityFrames ? securityVideo.label : "Hidden"}</strong>
            <small>{securityVideo.note}</small>
          </div>
        </div>
      ) : null}
      {isSecurityView && props.showOriginalSecurityFrames && props.cameraMode !== "split_screen" ? (
        <div className="original-frame-overlay" aria-hidden="true">
          <video
            ref={originalVideoRef}
            key={securityVideo.id}
            src={securityVideo.src}
            muted
            playsInline
            autoPlay
            loop
            className="security-video"
          />
          <div className="original-frame-label">Original reference overlay</div>
        </div>
      ) : null}
      {isSecurityView ? (
        <div className="security-overlay" aria-hidden="true">
          <div className="scanlines" />
          <div className="timestamp">{formatHistoricalClock(props.currentTime)} CAM RECONSTRUCTION</div>
        </div>
      ) : null}
      {props.showSatelliteOverlay ? (
        <div className="map-credit" aria-hidden="true">
          {satelliteOverlaySources[props.satelliteOverlayMode].label} -{" "}
          {satelliteOverlaySources[props.satelliteOverlayMode].credit}
        </div>
      ) : null}
      <div className="scale-orientation-badge" aria-hidden="true">
        <strong>Scale</strong>
        <span>{scaleBadgeText(props.activeFlightId)}</span>
      </div>
      <div className="compass-overlay" aria-label="Compass">
        <div ref={compassRingRef} className="compass-ring">
          <span className="compass-north">N</span>
          <span className="compass-east">E</span>
          <span className="compass-south">S</span>
          <span className="compass-west">W</span>
          <div className="compass-arrow" />
        </div>
        <small ref={compassReadoutRef}>View heading -- deg</small>
      </div>
      {isSecurityView ? (
        <div className="camera-calibration-badge" aria-hidden="true">
          {cameraPresets[props.cameraMode].calibration}
        </div>
      ) : null}
    </div>
  );
}

function buildLighting(scene: THREE.Scene) {
  const ambient = new THREE.HemisphereLight(0xe9f2dd, 0x2c302b, 1.35);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff0c7, 2.7);
  sun.position.set(-850, 1250, -950);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -1200;
  sun.shadow.camera.right = 1200;
  sun.shadow.camera.top = 1200;
  sun.shadow.camera.bottom = -1200;
  scene.add(sun);
}

function scaleBadgeText(activeFlightId: FlightId) {
  const site = terminalSiteForFlight(activeFlightId);
  if (site.id === "wtc") {
    return "WTC 1/2 scale massing; 208 ft 10 in exterior boxes; heights 1,368 / 1,362 ft";
  }

  if (site.id === "shanksville") {
    return "UA93 Shanksville satellite marker; terminal path uses public black-box coordinate samples";
  }

  return `OSM Pentagon footprint, local meters; height ${pentagonReferenceDimensions.heightFeet.toFixed(1)} ft`;
}

function computeReplayWorldBounds() {
  const publicPoints = allPublicFlightPathWorldPoints();
  const sitePoints = Object.values(siteDefinitions).map((site) => {
    const point = geoToWorld(site.center.lat, site.center.lon);
    return { x: point.x, z: point.z };
  });
  const allPoints = [...trajectoryPoints, ...publicPoints, ...sitePoints];

  return allPoints.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minZ: Math.min(bounds.minZ, point.z),
      maxZ: Math.max(bounds.maxZ, point.z)
    }),
    {
      minX: Infinity,
      maxX: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity
    }
  );
}

function createGroundPlane(): TerrainHandles {
  const group = new THREE.Group();
  group.position.copy(terrainWorldCenter);
  const terrainSize = terrainWorldSize;
  const gridSize = terrainWorldSize;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(terrainSize, terrainSize),
    new THREE.MeshStandardMaterial({ color: 0x596549, roughness: 0.96, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const grid = new THREE.GridHelper(gridSize, 192, 0x96a08d, 0x6f7669);
  grid.position.y = 0.08;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.opacity = 0.16;
  gridMaterial.transparent = true;
  group.add(grid);

  return { group, grid };
}

function createSatelliteOverlay(maxAnisotropy: number) {
  const group = new THREE.Group();
  group.name = "Georeferenced satellite tile overlay: regional routes plus terminal sites";
  group.visible = false;

  const loader = new THREE.TextureLoader();
  loader.crossOrigin = "anonymous";
  const loadedTiles = new Set<string>();

  for (const area of satelliteOverlayAreas()) {
    const zoom = area.zoom;
    const bounds = area.bounds;

    for (let x = lonToTileX(bounds.minLon, zoom); x <= lonToTileX(bounds.maxLon, zoom); x += 1) {
      for (let y = latToTileY(bounds.maxLat, zoom); y <= latToTileY(bounds.minLat, zoom); y += 1) {
        const tileKey = `${satelliteOverlaySources.modern.id}/${zoom}/${x}/${y}`;
        if (loadedTiles.has(tileKey)) {
          continue;
        }
        loadedTiles.add(tileKey);

        const tileBounds = tileToGeoBounds(x, y, zoom);
        const material = new THREE.MeshBasicMaterial({
          color: 0x3f4636,
          transparent: false,
          opacity: 1,
          polygonOffset: true,
          polygonOffsetFactor: -12,
          polygonOffsetUnits: -12,
          depthTest: true,
          depthWrite: true,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(createSatelliteTileTerrainGeometry(tileBounds), material);
        mesh.name = `${area.name} ${area.purpose} satellite tile ${tileKey}`;
        mesh.renderOrder = 6;
        mesh.frustumCulled = false;
        group.add(mesh);

        loader.load(
          satelliteOverlaySource.tileTemplate
            .replace("{z}", String(zoom))
            .replace("{y}", String(y))
            .replace("{x}", String(x)),
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = maxAnisotropy;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            material.map = texture;
            material.color.set(0xffffff);
            material.needsUpdate = true;
          },
          undefined,
          () => undefined
        );
      }
    }
  }

  return group;
}

function createHistoricalSatelliteOverlay(maxAnisotropy: number) {
  const source = satelliteOverlaySources.ikonos_2001_reference;
  const placement = source.approximatePlacement;
  const group = new THREE.Group();
  group.name = "Approximate 2001 archival reference overlays";
  group.visible = false;

  const material = new THREE.MeshBasicMaterial({
    color: 0x77715d,
    transparent: true,
    opacity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -14,
    polygonOffsetUnits: -14,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(placement.widthMeters, placement.heightMeters), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = degToRad(placement.rotationDeg);
  mesh.position.set(placement.centerX, satelliteOverlayY + 0.35, placement.centerZ);
  mesh.renderOrder = 7;
  mesh.frustumCulled = false;
  group.add(mesh);

  const loader = new THREE.TextureLoader();
  loader.load(
    source.imagePath,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    },
    undefined,
    () => undefined
  );

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(placement.widthMeters, placement.heightMeters)),
    new THREE.LineBasicMaterial({ color: 0xf0c847, transparent: true, opacity: 0.58, depthTest: false })
  );
  outline.rotation.copy(mesh.rotation);
  outline.position.copy(mesh.position).add(new THREE.Vector3(0, 0.15, 0));
  outline.renderOrder = 20;
  group.add(outline);

  const label = createTextSprite("IKONOS reference: Sep 12 2001, approximate hand-fit", "#f4e7b6", "rgba(34, 27, 6, 0.82)");
  label.position.set(placement.centerX - placement.widthMeters * 0.26, 48, placement.centerZ - placement.heightMeters * 0.46);
  label.scale.set(340, 34, 1);
  group.add(label);

  const wtc = siteWorldCenter("wtc");
  const wtcLabel = createTextSprite(
    "WTC archival imagery: reference links only; modern tiles remain georeferenced",
    "#dff2ff",
    "rgba(6, 28, 44, 0.82)"
  );
  wtcLabel.position.copy(wtc).add(new THREE.Vector3(0, 520, 0));
  wtcLabel.scale.set(590, 48, 1);
  group.add(wtcLabel);

  return group;
}

function satelliteOverlayAreas(): SatelliteOverlayArea[] {
  const dullesTakeoffPoints = trajectoryPoints
    .flatMap((point) =>
      point.t <= satelliteOverlaySource.runwayReplaySeconds &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lon)
        ? [{ lat: point.lat as number, lon: point.lon as number }]
        : []
    );

  const routePoints = [
    ...trajectoryPoints.flatMap((point) =>
      Number.isFinite(point.lat) && Number.isFinite(point.lon)
        ? [{ lat: point.lat as number, lon: point.lon as number }]
        : []
    ),
    ...Object.values(publicFlightPathDefinitions).flatMap((definition) =>
      definition.waypoints.map((waypoint) => ({ lat: waypoint.lat, lon: waypoint.lon }))
    ),
    ...Object.values(siteDefinitions).map((site) => site.center)
  ];

  const areas: SatelliteOverlayArea[] = [
    {
      name: "Low-fidelity shared route context",
      bounds: expandedGeoBounds(routePoints, satelliteOverlaySource.regionalPaddingMeters),
      zoom: satelliteOverlaySource.regionalZoomLevel,
      purpose: "regional"
    },
    {
      name: "Pentagon high-detail terminal site",
      bounds: expandedGeoBounds([siteDefinitions.pentagon.center], siteDefinitions.pentagon.highDetailPaddingMeters),
      zoom: satelliteOverlaySource.siteZoomLevel,
      purpose: "site"
    }
  ];

  areas.push(
    ...Object.values(siteDefinitions)
      .filter((site) => site.id !== "pentagon")
      .map((site) => ({
        name: `${site.shortLabel} high-detail terminal site`,
        bounds: expandedGeoBounds([site.center], site.highDetailPaddingMeters),
        zoom: site.highDetailZoom,
        purpose: "site" as const
      }))
  );

  if (dullesTakeoffPoints.length > 1) {
    areas.push({
      name: "Dulles runway and takeoff",
      bounds: expandedGeoBounds(dullesTakeoffPoints, satelliteOverlaySource.runwayPaddingMeters),
      zoom: satelliteOverlaySource.runwayZoomLevel,
      purpose: "runway"
    });
  }

  return areas;
}

function createSatelliteTileTerrainGeometry(bounds: { north: number; south: number; west: number; east: number }) {
  const subdivisions = 8;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= subdivisions; row += 1) {
    const v = row / subdivisions;
    const lat = bounds.north + (bounds.south - bounds.north) * v;
    for (let col = 0; col <= subdivisions; col += 1) {
      const u = col / subdivisions;
      const lon = bounds.west + (bounds.east - bounds.west) * u;
      const world = geoToWorld(lat, lon);
      vertices.push(world.x, siteTerrainHeightAt(world.x, world.z) + satelliteOverlayY, world.z);
      uvs.push(u, 1 - v);
    }
  }

  const columns = subdivisions + 1;
  for (let row = 0; row < subdivisions; row += 1) {
    for (let col = 0; col < subdivisions; col += 1) {
      const a = row * columns + col;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createSiteContextLayer() {
  const group = new THREE.Group();
  group.name = "Public-data 3D site context: OSM roads and NED terrain";
  const terrainMesh = createSiteTerrainMesh();
  group.add(terrainMesh);
  group.add(createRoadNetwork());

  const label = createTextSprite("3D roads / terrain: OSM + NED10m", "#f4f0da", "rgba(18, 24, 18, 0.74)");
  label.position.set(-860, siteTerrainHeightAt(-860, -720) + 52, -720);
  label.scale.set(260, 36, 1);
  group.add(label);

  return group;
}

function createMultiSiteContextLayer() {
  const group = new THREE.Group();
  group.name = "Scale-correct multi-site context for WTC and Shanksville";
  group.add(createWorldTradeCenterContext());
  group.add(createShanksvilleContext());
  return group;
}

function createWorldTradeCenterContext() {
  const group = new THREE.Group();
  group.name = "Scale-correct WTC 1 and WTC 2 massing from public footprint references";

  const site = siteDefinitions.wtc;
  wtcTowerDefinitions.forEach((tower) => {
    group.add(createWtcTowerMassing(tower));
  });

  const label = createTextSprite(
    "WTC scale massing - 911maps footprints, NIST heights",
    "#eaf7ff",
    "rgba(8, 27, 43, 0.82)"
  );
  label.position.copy(siteWorldCenter(site.id)).add(new THREE.Vector3(0, 520, 0));
  label.scale.set(540, 46, 1);
  group.add(label);

  const caveat = createTextSprite("Impact bands are visual references, not damage/physics simulation", "#ffe0b5", "rgba(48, 26, 8, 0.82)");
  caveat.position.copy(siteWorldCenter(site.id)).add(new THREE.Vector3(0, 455, 70));
  caveat.scale.set(540, 42, 1);
  group.add(caveat);

  return group;
}

function createWtcTowerMassing(tower: (typeof wtcTowerDefinitions)[number]) {
  const group = new THREE.Group();
  group.name = `${tower.label} scale-correct massing`;
  const footprint = tower.footprint.map((point) => geoPointToWorld(point.lat, point.lon));
  const center = polygonCentroid(footprint);
  const towerColor = tower.id === "wtc1" ? 0xaeb8b9 : 0xa2abad;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: towerColor,
    roughness: 0.68,
    metalness: 0.18,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide
  });
  const roofMaterial = new THREE.MeshBasicMaterial({
    color: 0xd6dcdd,
    transparent: true,
    opacity: 0.76,
    side: THREE.DoubleSide
  });

  const walls = new THREE.Mesh(createFootprintWallGeometry(footprint, tower.heightMeters), wallMaterial);
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const roof = new THREE.Mesh(createPolygonTopGeometry(footprint, tower.heightMeters + 0.7), roofMaterial);
  roof.renderOrder = 13;
  group.add(roof);

  group.add(createPolygonOutline(footprint, 0.9, 0xeff6f5, 0.54));
  group.add(createPolygonOutline(footprint, tower.heightMeters + 1.4, 0xf4ffff, 0.86));

  const impactY = Math.min(tower.heightMeters - 6, tower.impactAltitudeFeet * 0.3048);
  const impactColor = tower.flightId === "aa11" ? 0xff9b54 : 0x63d7ff;
  const impactPath = closedPathFromFootprint(footprint, impactY);
  group.add(
    createSegmentedTubePath(
      impactPath,
      2.0,
      new THREE.MeshBasicMaterial({
        color: impactColor,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
        depthWrite: false,
        fog: false
      }),
      76
    )
  );

  const label = createTextSprite(`${tower.label} ${Math.round(tower.heightFeet)} ft`, "#f7fbfb", "rgba(16, 24, 27, 0.8)");
  label.position.set(center.x, tower.heightMeters + 42, center.z);
  label.scale.set(280, 42, 1);
  group.add(label);

  const impactLabel = createTextSprite(
    `${tower.impactLabel} ~${tower.impactAltitudeFeet.toLocaleString()} ft`,
    tower.flightId === "aa11" ? "#ffd9bd" : "#d2f5ff",
    tower.flightId === "aa11" ? "rgba(64, 29, 8, 0.82)" : "rgba(8, 38, 50, 0.82)"
  );
  impactLabel.position.set(center.x, impactY + 28, center.z);
  impactLabel.scale.set(320, 38, 1);
  group.add(impactLabel);

  return group;
}

function createShanksvilleContext() {
  const group = new THREE.Group();
  group.name = "Shanksville UA93 terminal site satellite marker context";
  const site = siteDefinitions.shanksville;
  const center = siteWorldCenter(site.id);
  const marker = createMarkerPin("medium");
  marker.position.copy(center).add(new THREE.Vector3(0, 18, 0));
  group.add(marker);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(44, 52, 64),
    new THREE.MeshBasicMaterial({
      color: 0x88e08a,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(center).add(new THREE.Vector3(0, 1.2, 0));
  ring.renderOrder = 72;
  group.add(ring);

  const ua93TerminalPoints = publicFlightPathWorldPoints("ua93", 8, "smooth").slice(-96);
  if (ua93TerminalPoints.length > 1) {
    group.add(
      createSegmentedTubePath(
        ua93TerminalPoints,
        3.4,
        new THREE.MeshBasicMaterial({
          color: 0x88e08a,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
          fog: false
        }),
        73
      )
    );
  }

  const label = createTextSprite("UA93 Shanksville crash-site marker - satellite/marker only", "#d7ffd9", "rgba(11, 41, 18, 0.82)");
  label.position.copy(center).add(new THREE.Vector3(0, 92, 0));
  label.scale.set(520, 42, 1);
  group.add(label);
  return group;
}

function siteWorldCenter(siteId: SiteId) {
  const site = siteDefinitions[siteId];
  const world = geoPointToWorld(site.center.lat, site.center.lon);
  return new THREE.Vector3(world.x, 0, world.z);
}

function geoPointToWorld(lat: number, lon: number) {
  const world = geoToWorld(lat, lon);
  return { x: world.x, z: world.z };
}

function createPolygonTopGeometry(points: Array<{ x: number; z: number }>, y: number) {
  const vertices: number[] = [];
  const center = polygonCentroid(points);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    pushTriangle(vertices, center.x, y, center.z, point.x, y, point.z, next.x, y, next.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createPolygonOutline(points: Array<{ x: number; z: number }>, y: number, color: number, opacity: number) {
  const linePoints = closedPathFromFootprint(points, y);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePoints),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  line.renderOrder = 74;
  return line;
}

function closedPathFromFootprint(points: Array<{ x: number; z: number }>, y: number) {
  const path = points.map((point) => new THREE.Vector3(point.x, y, point.z));
  path.push(path[0].clone());
  return path;
}

function createSiteTerrainMesh() {
  const samples = siteContext.terrain.samples as SiteTerrainSample[];
  const rows = (siteContext.terrain.gridSegments as number) + 1;
  const cols = rows;
  const vertices: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const low = siteContext.terrain.minElevationMeters - siteContext.terrain.baseElevationMeters;
  const high = siteContext.terrain.maxElevationMeters - siteContext.terrain.baseElevationMeters;
  const lowColor = new THREE.Color(0x445237);
  const highColor = new THREE.Color(0x7b7757);

  for (const sample of samples) {
    vertices.push(sample.x, sample.relativeMeters, sample.z);
    const ratio = high > low ? THREE.MathUtils.clamp((sample.relativeMeters - low) / (high - low), 0, 1) : 0;
    const color = lowColor.clone().lerp(highColor, ratio * 0.72);
    colors.push(color.r, color.g, color.b);
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92
    })
  );
  mesh.name = "NED10m sampled terrain mesh, relative meters";
  mesh.receiveShadow = true;
  return mesh;
}

function createRoadNetwork() {
  const group = new THREE.Group();
  group.name = "OSM road surfaces with layer/bridge elevation offsets";
  const roads = siteContext.roads as SiteRoad[];
  const roadClasses = [
    {
      name: "motorway",
      predicate: (road: SiteRoad) => road.highway.includes("motorway") || road.highway.includes("trunk"),
      color: 0x343834,
      opacity: 0.96
    },
    {
      name: "arterial",
      predicate: (road: SiteRoad) => road.highway.includes("primary") || road.highway.includes("secondary"),
      color: 0x3f423e,
      opacity: 0.94
    },
    {
      name: "local",
      predicate: (road: SiteRoad) =>
        road.highway.includes("tertiary") ||
        road.highway === "residential" ||
        road.highway === "unclassified" ||
        road.highway === "service",
      color: 0x4a4b45,
      opacity: 0.9
    },
    {
      name: "pedestrian",
      predicate: (road: SiteRoad) => road.highway === "pedestrian",
      color: 0x746f61,
      opacity: 0.72
    }
  ];

  roadClasses.forEach((roadClass, index) => {
    const geometry = createRoadSurfaceGeometry(roads.filter(roadClass.predicate));
    if (!geometry) {
      return;
    }

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: roadClass.color,
        roughness: 0.86,
        metalness: 0.05,
        transparent: true,
        opacity: roadClass.opacity,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3 - index,
        polygonOffsetUnits: -3 - index
      })
    );
    mesh.name = `OSM ${roadClass.name} road surface mesh`;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  group.add(createRoadCenterlines(roads));
  group.add(createMajorRoadGuardrails(roads));
  return group;
}

function createRoadSurfaceGeometry(roads: SiteRoad[]) {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexIndex = 0;

  roads.forEach((road) => {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index];
      const end = road.points[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.4) {
        continue;
      }

      const nx = -dz / length;
      const nz = dx / length;
      const halfWidth = Math.max(road.widthMeters / 2, 1.2);
      const roadLift = roadElevationOffset(road);
      const yStart = siteTerrainHeightAt(start.x, start.z) + roadLift;
      const yEnd = siteTerrainHeightAt(end.x, end.z) + roadLift;
      vertices.push(
        start.x + nx * halfWidth,
        yStart,
        start.z + nz * halfWidth,
        start.x - nx * halfWidth,
        yStart,
        start.z - nz * halfWidth,
        end.x - nx * halfWidth,
        yEnd,
        end.z - nz * halfWidth,
        end.x + nx * halfWidth,
        yEnd,
        end.z + nz * halfWidth
      );
      indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
      vertexIndex += 4;
    }
  });

  if (vertices.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRoadCenterlines(roads: SiteRoad[]) {
  const points: THREE.Vector3[] = [];
  const majorRoads = roads.filter((road) =>
    ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary"].includes(road.highway)
  );

  majorRoads.forEach((road) => {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index];
      const end = road.points[index + 1];
      const lift = roadElevationOffset(road) + 0.08;
      points.push(
        new THREE.Vector3(start.x, siteTerrainHeightAt(start.x, start.z) + lift, start.z),
        new THREE.Vector3(end.x, siteTerrainHeightAt(end.x, end.z) + lift, end.z)
      );
    }
  });

  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xd7d0b8, transparent: true, opacity: 0.42, depthWrite: false })
  );
  line.name = "Approximate road center/edge highlight lines";
  line.renderOrder = 4;
  return line;
}

function createMajorRoadGuardrails(roads: SiteRoad[]) {
  const points: THREE.Vector3[] = [];
  const guardrailRoads = roads.filter((road) =>
    ["motorway", "motorway_link", "trunk", "trunk_link", "primary_link", "secondary_link"].includes(road.highway)
  );

  guardrailRoads.forEach((road) => {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index];
      const end = road.points[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.4) {
        continue;
      }

      const nx = -dz / length;
      const nz = dx / length;
      const lift = roadElevationOffset(road) + 0.62;
      const halfWidth = road.widthMeters / 2 + 0.7;
      [-1, 1].forEach((side) => {
        points.push(
          new THREE.Vector3(
            start.x + nx * halfWidth * side,
            siteTerrainHeightAt(start.x, start.z) + lift,
            start.z + nz * halfWidth * side
          ),
          new THREE.Vector3(
            end.x + nx * halfWidth * side,
            siteTerrainHeightAt(end.x, end.z) + lift,
            end.z + nz * halfWidth * side
          )
        );
      });
    }
  });

  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xaeb4aa, transparent: true, opacity: 0.5, depthWrite: false })
  );
  line.name = "Approximate elevated ramp and motorway guardrails";
  line.renderOrder = 5;
  return line;
}

function roadElevationOffset(road: SiteRoad) {
  if (road.tunnel) {
    return -1.6;
  }

  const layerLift = Math.max(0, road.layer) * 4.2;
  const bridgeLift = road.bridge ? 3.8 : 0;
  const linkLift = road.highway.includes("_link") ? 0.4 : 0;
  return 0.34 + layerLift + bridgeLift + linkLift;
}

function createSiteTerrainSampler(): SiteTerrainSampler {
  const samples = siteContext.terrain.samples as SiteTerrainSample[];
  const rows = (siteContext.terrain.gridSegments as number) + 1;
  const cols = rows;
  const minX = Math.min(...samples.map((sample) => sample.x));
  const maxX = Math.max(...samples.map((sample) => sample.x));
  const minZ = Math.min(...samples.map((sample) => sample.z));
  const maxZ = Math.max(...samples.map((sample) => sample.z));
  const heights = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

  samples.forEach((sample) => {
    heights[sample.row][sample.col] = sample.relativeMeters;
  });

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    stepX: (maxX - minX) / Math.max(cols - 1, 1),
    stepZ: (maxZ - minZ) / Math.max(rows - 1, 1),
    rows,
    cols,
    heights
  };
}

function siteTerrainHeightAt(x: number, z: number) {
  const sampler = siteTerrainSampler;
  if (x < sampler.minX || x > sampler.maxX || z < sampler.minZ || z > sampler.maxZ) {
    return 0;
  }

  const gridX = (x - sampler.minX) / sampler.stepX;
  const gridZ = (z - sampler.minZ) / sampler.stepZ;
  const col = Math.min(Math.max(Math.floor(gridX), 0), sampler.cols - 2);
  const row = Math.min(Math.max(Math.floor(gridZ), 0), sampler.rows - 2);
  const tx = gridX - col;
  const tz = gridZ - row;
  const h00 = sampler.heights[row][col];
  const h10 = sampler.heights[row][col + 1];
  const h01 = sampler.heights[row + 1][col];
  const h11 = sampler.heights[row + 1][col + 1];
  const hx0 = h00 + (h10 - h00) * tx;
  const hx1 = h01 + (h11 - h01) * tx;
  return hx0 + (hx1 - hx0) * tz;
}

function displayPositionForReplayState(replayState: ReplayState) {
  const position = new THREE.Vector3(...replayState.position);

  if (!usesTerrainRelativeAltitude(replayState.altitudeSource)) {
    return position;
  }

  const terrainY = siteTerrainHeightAt(position.x, position.z);
  const radioHeightMeters = Math.max(0, position.y);
  const modelCenterY = terrainY + radioHeightMeters + radioAltimeterToModelCenterMeters;
  const floorY = terrainY + aircraftLowerGeometryClearanceMeters;
  position.y = Math.max(modelCenterY, floorY);
  return position;
}

function usesTerrainRelativeAltitude(source: string | undefined) {
  return source === "fdr_radio_height";
}

function sampleDisplayedTrajectory(steps = 160, interpolationMode: "linear" | "smooth" = "linear") {
  return displayedTrajectorySampleTimes(steps).map((t) => {
    const state = getReplayState(t, { interpolationMode });
    return displayPositionForReplayState(state);
  });
}

function displayedTrajectorySampleTimes(steps: number) {
  const times: number[] = [];
  const wholeReplaySamples = Math.max(steps, 1);

  for (let index = 0; index <= wholeReplaySamples; index += 1) {
    times.push((index / wholeReplaySamples) * replayDuration);
  }

  const terminalDenseStart = Math.max(0, fdrReplayDuration - 18);
  for (let t = terminalDenseStart; t < replayDuration; t += 0.08) {
    times.push(t);
  }

  times.push(fdrReplayDuration, replayDuration);
  return Array.from(new Set(times.map((t) => Number(t.toFixed(3))))).sort((a, b) => a - b);
}

function expandedGeoBounds(points: Array<{ lat: number; lon: number }>, paddingMeters: number): GeoBounds {
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLon = Math.min(...points.map((point) => point.lon));
  const maxLon = Math.max(...points.map((point) => point.lon));
  const anchorLat = osmPentagonFootprint.coordinateSystem.anchor.lat;
  const latPadding = metersToLatitudeDegrees(paddingMeters);
  const lonPadding = metersToLongitudeDegrees(paddingMeters, anchorLat);

  return {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLon: minLon - lonPadding,
    maxLon: maxLon + lonPadding
  };
}

function geoToWorld(lat: number, lon: number) {
  const earthRadius = 6378137;
  const anchor = osmPentagonFootprint.coordinateSystem.anchor;
  const anchorLatRad = degToRad(anchor.lat);
  return {
    x: degToRad(lon - anchor.lon) * earthRadius * Math.cos(anchorLatRad),
    z: -degToRad(lat - anchor.lat) * earthRadius
  };
}

function metersToLatitudeDegrees(meters: number) {
  return (meters / 6378137) * (180 / Math.PI);
}

function metersToLongitudeDegrees(meters: number, latitude: number) {
  return (meters / (6378137 * Math.cos(degToRad(latitude)))) * (180 / Math.PI);
}

function lonToTileX(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number) {
  const latRad = degToRad(lat);
  const n = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - n / Math.PI) / 2) * 2 ** zoom);
}

function tileToGeoBounds(x: number, y: number, zoom: number) {
  return {
    north: tileYToLat(y, zoom),
    south: tileYToLat(y + 1, zoom),
    west: tileXToLon(x, zoom),
    east: tileXToLon(x + 1, zoom)
  };
}

function tileXToLon(x: number, zoom: number) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function createCheckpointGates() {
  const group = new THREE.Group();
  group.name = "Approximate west-wall/south-parking security-camera checkpoint geometry";
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb4b29d, roughness: 0.88 });
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x8d927d, roughness: 0.76, metalness: 0.05 });
  const coneOrange = new THREE.MeshStandardMaterial({ color: 0xe96a29, roughness: 0.66 });
  const coneWhite = new THREE.MeshBasicMaterial({ color: 0xf2ead7 });
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x171a16, transparent: true, opacity: 0.28 });
  const kioskCenter = securityCameraPlacement.camera1Position.clone();
  kioskCenter.y = 0;

  const pad = new THREE.Mesh(new THREE.PlaneGeometry(150, 90), concrete);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(kioskCenter.x + 4, 0.23, kioskCenter.z + 6);
  pad.rotation.z = -0.18;
  group.add(pad);

  [
    [kioskCenter.x - 24, kioskCenter.z - 8, 8.5],
    [kioskCenter.x + 10, kioskCenter.z + 2, 10],
    [kioskCenter.x + 38, kioskCenter.z + 14, 9]
  ].forEach(([x, z, h]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(12, h * 2, 12), postMaterial);
    post.position.set(x, h, z);
    post.castShadow = true;
    group.add(post);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(15, 2, 15), postMaterial);
    cap.position.set(x, h * 2 + 1, z);
    cap.castShadow = true;
    group.add(cap);
  });

  [
    [kioskCenter.x - 18, kioskCenter.z + 24],
    [kioskCenter.x + 22, kioskCenter.z + 32],
    [kioskCenter.x + 52, kioskCenter.z + 38]
  ].forEach(([x, z]) => {
    const cone = createTrafficCone(coneOrange, coneWhite);
    cone.position.set(x, 0.3, z);
    group.add(cone);
  });

  const curb = new THREE.Mesh(new THREE.TorusGeometry(54, 1.1, 8, 64, Math.PI * 1.4), concrete);
  curb.rotation.x = Math.PI / 2;
  curb.rotation.z = -0.35;
  curb.position.set(kioskCenter.x - 30, 0.7, kioskCenter.z + 28);
  group.add(curb);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(82, 2.2, 4), new THREE.MeshBasicMaterial({ color: 0xf4f0df }));
  arm.position.set(kioskCenter.x + 18, 18, kioskCenter.z + 10);
  arm.rotation.y = -0.18;
  arm.castShadow = true;
  group.add(arm);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(132, 28), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.rotation.z = -0.45;
  shadow.position.set(kioskCenter.x + 8, 0.31, kioskCenter.z + 16);
  group.add(shadow);

  return group;
}

function createWestSideReferenceObjects() {
  const group = new THREE.Group();
  group.name = "Reference-diagram west-side context objects - uncalibrated";

  const heliportMaterial = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.82 });
  const markingMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const serviceMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb2a4, roughness: 0.74 });
  const trailerMaterial = new THREE.MeshStandardMaterial({ color: 0x626963, roughness: 0.86 });
  const generatorMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5552, roughness: 0.7 });

  const heliport = new THREE.Mesh(new THREE.PlaneGeometry(96, 72), heliportMaterial);
  heliport.rotation.x = -Math.PI / 2;
  heliport.rotation.z = 0.08;
  heliport.position.set(-430, 0.38, 158);
  group.add(heliport);

  const hStrokeA = new THREE.Mesh(new THREE.BoxGeometry(62, 0.08, 5), markingMaterial);
  hStrokeA.position.set(-430, 0.5, 158);
  hStrokeA.rotation.y = 0.08;
  group.add(hStrokeA);

  const hStrokeB = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 44), markingMaterial);
  hStrokeB.position.set(-452, 0.52, 158);
  hStrokeB.rotation.y = 0.08;
  group.add(hStrokeB);

  const hStrokeC = hStrokeB.clone();
  hStrokeC.position.set(-408, 0.52, 158);
  group.add(hStrokeC);

  const fireStation = new THREE.Mesh(new THREE.BoxGeometry(52, 24, 36), serviceMaterial);
  fireStation.position.set(-205, 12, 126);
  fireStation.castShadow = true;
  group.add(fireStation);

  const awning = new THREE.Mesh(new THREE.BoxGeometry(70, 4, 16), serviceMaterial);
  awning.position.set(-205, 20, 102);
  awning.castShadow = true;
  group.add(awning);

  const generator = new THREE.Mesh(new THREE.BoxGeometry(54, 13, 24), generatorMaterial);
  generator.position.set(-82, 7, -118);
  generator.rotation.y = -0.18;
  generator.castShadow = true;
  group.add(generator);

  for (let index = 0; index < 5; index += 1) {
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(44, 11, 18), trailerMaterial);
    trailer.position.set(18 + index * 38, 6, -146 - index * 5);
    trailer.rotation.y = -0.18;
    trailer.castShadow = true;
    group.add(trailer);
  }

  const contextLabels = [
    ["Reference heliport", new THREE.Vector3(-470, 38, 208)],
    ["Reference fire station", new THREE.Vector3(-226, 48, 150)],
    ["Reference generator", new THREE.Vector3(-96, 34, -92)],
    ["Reference trailers", new THREE.Vector3(96, 34, -112)]
  ] as const;

  contextLabels.forEach(([text, position]) => {
    const label = createTextSprite(text, "#f4f0da", "rgba(20, 21, 19, 0.68)");
    label.position.copy(position);
    label.scale.set(118, 30, 1);
    group.add(label);
  });

  return group;
}

function createTrafficCone(orange: THREE.Material, white: THREE.Material) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 10), orange);
  base.position.y = 0.6;
  group.add(base);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 15, 18), orange);
  cone.position.y = 8.6;
  cone.castShadow = true;
  group.add(cone);

  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 3, 1.2, 18), white);
  stripe.position.y = 9.5;
  group.add(stripe);
  return group;
}

function createPentagonMassing() {
  const group = new THREE.Group();
  group.name = "Pentagon exterior massing from OSM footprint";

  const outer = orientShapeRing(footprintRingToShape(osmPentagonFootprint.outer), true);
  const inner = orientShapeRing(footprintRingToShape(osmPentagonFootprint.courtyard), false);
  const geometry = createFootprintWallGeometry(osmPentagonFootprint.outer, PENTAGON_HEIGHT_M);

  const building = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xbeb69d,
      roughness: 0.86,
      metalness: 0.02,
      side: THREE.DoubleSide
    })
  );
  building.castShadow = true;
  building.receiveShadow = true;
  group.add(building);

  const courtyardWalls = new THREE.Mesh(
    createFootprintWallGeometry(osmPentagonFootprint.courtyard, PENTAGON_HEIGHT_M),
    new THREE.MeshStandardMaterial({
      color: 0xaaa18b,
      roughness: 0.88,
      metalness: 0.02,
      side: THREE.DoubleSide
    })
  );
  courtyardWalls.castShadow = true;
  courtyardWalls.receiveShadow = true;
  group.add(courtyardWalls);

  const roofDeck = new THREE.Mesh(
    createFootprintRingTopGeometry(osmPentagonFootprint.outer, osmPentagonFootprint.courtyard, PENTAGON_HEIGHT_M + 0.35),
    new THREE.MeshBasicMaterial({ color: 0xc8bea2, side: THREE.DoubleSide })
  );
  roofDeck.renderOrder = 2;
  group.add(roofDeck);

  const courtyardShape = new THREE.Shape(orientShapeRing(footprintRingToShape(osmPentagonFootprint.courtyard), true));
  const courtyard = new THREE.Mesh(
    new THREE.ShapeGeometry(courtyardShape),
    new THREE.MeshStandardMaterial({ color: 0x4f6b46, roughness: 0.9, side: THREE.DoubleSide })
  );
  courtyard.rotation.x = -Math.PI / 2;
  courtyard.position.y = 0.28;
  courtyard.receiveShadow = true;
  group.add(courtyard);

  group.add(createPentagonWindowBands(outer, 14.5, 0x615f56));
  group.add(createPentagonWindowBands(outer, 8.2, 0x6b695f));
  group.add(createPentagonWindowBands(inner, 12.8, 0x68665d));
  group.add(createPentagonOutline(outer, PENTAGON_HEIGHT_M + 0.6, 0xe6dfc7));
  group.add(createPentagonOutline(inner, PENTAGON_HEIGHT_M + 0.8, 0xd1c9ad));
  group.add(createPentagonOutline(outer, 0.55, 0x776f5b));

  const label = createTextSprite("OSM footprint - site objects removed", "#f2ead3", "rgba(20, 21, 19, 0.72)");
  const center = footprintCenter();
  label.position.set(center.x, 72, osmPentagonFootprint.bounds.maxZ + 56);
  group.add(label);

  return group;
}

function createFootprintWallGeometry(points: Array<{ x: number; z: number }>, height: number) {
  const vertices: number[] = [];

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    pushTriangle(vertices, point.x, 0, point.z, next.x, 0, next.z, next.x, height, next.z);
    pushTriangle(vertices, point.x, 0, point.z, next.x, height, next.z, point.x, height, point.z);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createFootprintRingTopGeometry(
  outerPoints: Array<{ x: number; z: number }>,
  innerPoints: Array<{ x: number; z: number }>,
  y: number
) {
  const vertices: number[] = [];
  const center = polygonCentroid(innerPoints);
  const samples = 180;
  const raySamples: Array<{
    inner: { x: number; z: number } | null;
    outer: { x: number; z: number } | null;
  }> = Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    const direction = { x: Math.cos(angle), z: Math.sin(angle) };
    return {
      inner: rayPolygonIntersection(center, direction, innerPoints, "nearest"),
      outer: rayPolygonIntersection(center, direction, outerPoints, "farthest")
    };
  });
  const ringPoints: RingIntersectionSample[] = raySamples.filter(hasRingIntersections);

  if (ringPoints.length < 3) {
    return new THREE.BufferGeometry();
  }

  ringPoints.forEach((point, index) => {
    const next = ringPoints[(index + 1) % ringPoints.length];
    pushTriangle(vertices, point.inner.x, y, point.inner.z, point.outer.x, y, point.outer.z, next.outer.x, y, next.outer.z);
    pushTriangle(vertices, point.inner.x, y, point.inner.z, next.outer.x, y, next.outer.z, next.inner.x, y, next.inner.z);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function hasRingIntersections(sample: {
  inner: { x: number; z: number } | null;
  outer: { x: number; z: number } | null;
}): sample is RingIntersectionSample {
  return Boolean(sample.inner && sample.outer);
}

function polygonCentroid(points: Array<{ x: number; z: number }>) {
  return points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, z: sum.z + point.z / points.length }),
    { x: 0, z: 0 }
  );
}

function rayPolygonIntersection(
  origin: { x: number; z: number },
  direction: { x: number; z: number },
  points: Array<{ x: number; z: number }>,
  mode: "nearest" | "farthest"
) {
  let selectedDistance = mode === "nearest" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  let selectedPoint: { x: number; z: number } | null = null;

  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const edge = { x: end.x - start.x, z: end.z - start.z };
    const denominator = cross2d(direction, edge);
    if (Math.abs(denominator) < 1e-6) {
      return;
    }

    const offset = { x: start.x - origin.x, z: start.z - origin.z };
    const rayDistance = cross2d(offset, edge) / denominator;
    const edgeRatio = cross2d(offset, direction) / denominator;

    if (rayDistance <= 0 || edgeRatio < -1e-4 || edgeRatio > 1 + 1e-4) {
      return;
    }

    const shouldSelect =
      mode === "nearest" ? rayDistance < selectedDistance : rayDistance > selectedDistance;
    if (shouldSelect) {
      selectedDistance = rayDistance;
      selectedPoint = {
        x: origin.x + direction.x * rayDistance,
        z: origin.z + direction.z * rayDistance
      };
    }
  });

  return selectedPoint;
}

function cross2d(a: { x: number; z: number }, b: { x: number; z: number }) {
  return a.x * b.z - a.z * b.x;
}

function pushTriangle(
  vertices: number[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
) {
  vertices.push(ax, ay, az, bx, by, bz, cx, cy, cz);
}

function pushQuadPoints(
  vertices: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3
) {
  vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  vertices.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
}

function footprintRingToShape(points: Array<{ x: number; z: number }>) {
  return points.map((point) => new THREE.Vector2(point.x, -point.z));
}

function orientShapeRing(points: THREE.Vector2[], clockwise: boolean) {
  const isClockwise = THREE.ShapeUtils.isClockWise(points);
  return isClockwise === clockwise ? points : [...points].reverse();
}

function footprintCenter() {
  return {
    x: (osmPentagonFootprint.bounds.minX + osmPentagonFootprint.bounds.maxX) / 2,
    z: (osmPentagonFootprint.bounds.minZ + osmPentagonFootprint.bounds.maxZ) / 2
  };
}

function createPentagonOutline(points: THREE.Vector2[], y: number, color: number) {
  const linePoints = points.map((point) => new THREE.Vector3(point.x, y, -point.y));
  linePoints.push(linePoints[0].clone());
  const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82 })
  );
  return line;
}

function createPentagonWindowBands(points: THREE.Vector2[], y: number, color: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62 });

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const side = new THREE.Vector2(end.x - start.x, end.y - start.y);
    const length = side.length();
    if (length < 18) {
      continue;
    }

    const angle = Math.atan2(side.y, side.x);
    const center = new THREE.Vector2((start.x + end.x) / 2, (start.y + end.y) / 2);
    const band = new THREE.Mesh(new THREE.BoxGeometry(length * 0.72, 1.3, 1.2), material);
    band.position.set(center.x, y, -center.y);
    band.rotation.y = -angle;
    group.add(band);

    const verticals = 9;
    for (let tick = 1; tick < verticals; tick += 1) {
      const alpha = tick / verticals;
      const px = start.x + side.x * alpha;
      const py = start.y + side.y * alpha;
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.5, 1.3), material);
      mullion.position.set(px, y, -py);
      mullion.rotation.y = -angle;
      group.add(mullion);
    }
  }

  return group;
}

function createRoofRing(outerRadius: number, innerRadius: number, y: number, color: number) {
  const outer = orientShapeRing(footprintRingToShape(osmPentagonFootprint.outer), true);
  const inner = orientShapeRing(footprintRingToShape(osmPentagonFootprint.courtyard), false);
  const shape = new THREE.Shape(outer);
  shape.holes.push(new THREE.Path(inner));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide })
  );
  mesh.position.y = y;
  return mesh;
}

function createReplayObjects(terrainGrid: THREE.GridHelper, maxAnisotropy: number): SceneHandles {
  const aircraft = createAircraftModel();
  const aircraftDistanceGlyph = createAircraftDistanceGlyph();
  const allAircraftMarkers = createAllAircraftMarkers();
  const flightPath = createFlightPath();
  const plannedRoute = createPlannedRouteReference();
  const satelliteOverlay = createSatelliteOverlay(maxAnisotropy);
  const historicalSatelliteOverlay = createHistoricalSatelliteOverlay(maxAnisotropy);
  const multiSiteContext = createMultiSiteContextLayer();
  const siteContextLayer = createSiteContextLayer();
  const siteTerrainMesh = siteContextLayer.getObjectByName("NED10m sampled terrain mesh, relative meters") as THREE.Mesh;
  const labels = new THREE.Group();
  const sourceMarkers = new THREE.Group();
  const uncertainty = new THREE.Group();
  const cameraFrustums = new THREE.Group();

  const pathPoints = sampleDisplayedTrajectory(Math.min(pathSampleCount(), 900), "linear");
  uncertainty.add(
    createSegmentedTubePath(
      pathPoints,
      34,
      new THREE.MeshBasicMaterial({
        color: 0xd7c26b,
        transparent: true,
        opacity: 0.13,
        depthTest: false,
        depthWrite: false,
        fog: false
      }),
      5
    )
  );

  const pathLabel = createTextSprite("Locked replay path", "#f4d66d", "rgba(35, 31, 15, 0.78)");
  pathLabel.position.copy(pathPoints[Math.floor(pathPoints.length * 0.48)]).add(new THREE.Vector3(20, 42, 0));
  labels.add(pathLabel);

  const startLabel = createTextSprite("Dulles runway / FDR ground row", "#dff8ff", "rgba(8, 35, 46, 0.78)");
  startLabel.position.copy(pathPoints[0]).add(new THREE.Vector3(20, 46, 0));
  labels.add(startLabel);

  const endLabel = createTextSprite("Last decoded FDR row", "#f7a65b", "rgba(42, 22, 8, 0.78)");
  endLabel.position.copy(pathPoints[pathPoints.length - 1]).add(new THREE.Vector3(30, 34, 0));
  labels.add(endLabel);

  sourceMarkers.add(createEvidenceAlignmentOverlay());

  eventMarkers.filter(shouldRenderEventMarkerInScene).forEach((marker) => {
    const state = getReplayState(marker.t);
    const point = displayPositionForReplayState(state);
    const pin = createMarkerPin(marker.confidence);
    pin.position.copy(point);
    sourceMarkers.add(pin);

    const markerLabel = createTextSprite(marker.timeLabel, "#f4f0da", "rgba(24, 28, 24, 0.76)");
    markerLabel.position.copy(point).add(new THREE.Vector3(0, 34, 0));
    sourceMarkers.add(markerLabel);
  });

  updateCameraFrustums(cameraFrustums, {});

  return {
    aircraft,
    aircraftDistanceGlyph,
    allAircraftMarkers,
    terrainGrid,
    flightPath,
    plannedRoute,
    satelliteOverlay,
    historicalSatelliteOverlay,
    multiSiteContext,
    siteContext: siteContextLayer,
    siteTerrainMesh,
    labels,
    sourceMarkers,
    uncertainty,
    cameraFrustums
  };
}

function shouldRenderEventMarkerInScene(marker: (typeof eventMarkers)[number]) {
  if (marker.timelineOnly) {
    return false;
  }

  // Keep terminal diagnostics in the timeline/source panel only; a 3D pin at
  // the last decoded row reads like a waypoint or target for the aircraft.
  return marker.t < fdrReplayDuration - 3;
}

function createFlightPath() {
  const path = new THREE.Group();
  const points = sampleDisplayedTrajectory(pathSampleCount(), "smooth");
  path.add(createSegmentedTubePath(
    points,
    4.5,
    new THREE.MeshBasicMaterial({
      color: 0xf0c847,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      fog: false
    }),
    120
  ));
  path.add(createFlightPathOverlayLine(points));
  path.add(createPublicRouteProxyPaths());
  path.name = "Locked trajectory line - smoothed visual interpolation between decoded FDR samples";
  path.renderOrder = 120;
  path.frustumCulled = false;
  return path;
}

function createPublicRouteProxyPaths() {
  const group = new THREE.Group();
  group.name = "Low-confidence public route proxy paths for non-AA77 aircraft tabs";

  const colors: Record<keyof typeof publicFlightPathDefinitions, number> = {
    aa11: 0xff9b54,
    ua175: 0x63d7ff,
    ua93: 0x88e08a
  };

  (Object.keys(publicFlightPathDefinitions) as Array<keyof typeof publicFlightPathDefinitions>).forEach((flightId) => {
    const points = publicFlightPathWorldPoints(flightId, 72, "smooth");
    const material = new THREE.LineBasicMaterial({
      color: colors[flightId],
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
      fog: false
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    line.name = `${publicFlightPathDefinitions[flightId].label} line`;
    line.renderOrder = 131;
    line.frustumCulled = false;
    group.add(line);

    const label = createTextSprite(publicFlightPathDefinitions[flightId].label, "#f4f0da", "rgba(18, 22, 19, 0.82)");
    label.position.copy(points[Math.floor(points.length * 0.52)]).add(new THREE.Vector3(0, 2600, 0));
    label.scale.set(6200, 1100, 1);
    group.add(label);
  });

  return group;
}

function createPlannedRouteReference() {
  const route = new THREE.Group();
  route.name = "Original IAD-to-LAX great-circle reference, clipped to replay extent";
  route.visible = true;

  const points = plannedRouteWorldPoints();
  route.add(
    createSegmentedTubePath(
      points,
      5.5,
      new THREE.MeshBasicMaterial({
        color: 0x49a7ff,
        transparent: true,
        opacity: 0.86,
        depthTest: false,
        depthWrite: false,
        fog: false
      }),
      118
    )
  );

  const overlayGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const overlay = new THREE.Line(
    overlayGeometry,
    new THREE.LineBasicMaterial({
      color: 0xaedcff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  overlay.name = "Always-visible planned route overlay";
  overlay.renderOrder = 132;
  overlay.frustumCulled = false;
  route.add(overlay);

  const label = createTextSprite("Planned IAD to LAX route reference", "#dff2ff", "rgba(8, 32, 54, 0.82)");
  label.position.copy(points[Math.floor(points.length * 0.55)]).add(new THREE.Vector3(0, 12000, 0));
  label.scale.set(5200, 1100, 1);
  route.add(label);

  return route;
}

function plannedRouteWorldPoints() {
  const first = trajectoryPoints.find((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  const start = first ? { lat: first.lat as number, lon: first.lon as number } : { lat: 38.92748, lon: -77.45447 };
  const maxDistance = Math.min(Math.max(replaySceneSpan * 1.08, 180000), 620000);
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= 360; index += 1) {
    const fraction = index / 360;
    const geo = interpolateGreatCircle(start, laxAirport, fraction);
    const world = geoToWorld(geo.lat, geo.lon);
    const distance = Math.hypot(world.x - (first?.x ?? world.x), world.z - (first?.z ?? world.z));
    if (distance > maxDistance) {
      break;
    }

    points.push(new THREE.Vector3(world.x, 95, world.z));
  }

  return points.length > 1 ? points : [new THREE.Vector3(start.lon, 95, start.lat), new THREE.Vector3(start.lon - 1, 95, start.lat)];
}

function interpolateGreatCircle(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  fraction: number
) {
  const lat1 = degToRad(start.lat);
  const lon1 = degToRad(start.lon);
  const lat2 = degToRad(end.lat);
  const lon2 = degToRad(end.lon);
  const delta =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
      )
    );

  if (delta === 0) {
    return start;
  }

  const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
  const b = Math.sin(fraction * delta) / Math.sin(delta);
  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  return {
    lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
    lon: (Math.atan2(y, x) * 180) / Math.PI
  };
}

function pathSampleCount() {
  return Math.min(Math.max(Math.ceil(replayDuration), 320), 2200);
}

function createFlightPathOverlayLine(points: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xffe36b,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  line.name = "Always-visible flight path overlay";
  line.renderOrder = 130;
  line.frustumCulled = false;
  return line;
}

function createAircraftDistanceGlyph() {
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, size, size);
    context.translate(size / 2, size / 2);

    context.fillStyle = "rgba(20, 21, 19, 0.82)";
    context.strokeStyle = "rgba(255, 223, 85, 0.98)";
    context.lineWidth = 9;
    context.beginPath();
    context.arc(0, 0, 96, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.strokeStyle = "rgba(255, 244, 172, 0.7)";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(0, 0, 112, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = "rgba(255, 223, 85, 0.92)";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(0, -126);
    context.lineTo(0, -98);
    context.moveTo(0, 98);
    context.lineTo(0, 126);
    context.moveTo(-126, 0);
    context.lineTo(-98, 0);
    context.moveTo(98, 0);
    context.lineTo(126, 0);
    context.stroke();

    context.fillStyle = "#f0c847";
    context.beginPath();
    context.moveTo(0, -82);
    context.lineTo(10, -40);
    context.lineTo(80, -8);
    context.lineTo(82, 11);
    context.lineTo(13, 0);
    context.lineTo(9, 58);
    context.lineTo(32, 77);
    context.lineTo(32, 91);
    context.lineTo(0, 76);
    context.lineTo(-32, 91);
    context.lineTo(-32, 77);
    context.lineTo(-9, 58);
    context.lineTo(-13, 0);
    context.lineTo(-82, 11);
    context.lineTo(-80, -8);
    context.lineTo(-10, -40);
    context.closePath();
    context.fill();

    context.fillStyle = "#ebe8dc";
    context.font = "800 27px Inter, ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("PLANE", 0, 124);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = "Toggleable aircraft locator marker";
  sprite.renderOrder = 180;
  sprite.visible = false;
  return sprite;
}

function updateAircraftDistanceGlyph(
  glyph: THREE.Sprite,
  camera: THREE.PerspectiveCamera,
  aircraftPosition: THREE.Vector3,
  cameraMode: CameraMode,
  showAircraftMarker: boolean
) {
  if (!showAircraftMarker) {
    glyph.visible = false;
    return;
  }

  const distance = camera.position.distanceTo(aircraftPosition);
  const isOverview = cameraMode === "full_path" || cameraMode === "top_down";
  const shouldShow = !isOverview && distance > 3500;
  if (!shouldShow) {
    glyph.visible = false;
    return;
  }

  const worldSize = THREE.MathUtils.clamp(
    distance * (isOverview ? 0.24 : 0.09),
    isOverview ? 5200 : 240,
    isOverview ? 32000 : 4200
  );
  const altitudeOffset = THREE.MathUtils.clamp(distance * 0.004, isOverview ? 2600 : 72, isOverview ? 12000 : 1800);
  glyph.visible = true;
  glyph.position.copy(aircraftPosition).add(new THREE.Vector3(0, altitudeOffset, 0));
  glyph.scale.set(worldSize, worldSize, 1);
  glyph.material.rotation = 0;
}

function createAllAircraftMarkers() {
  const group = new THREE.Group();
  group.name = "Current shared-timeline aircraft direction markers";

  flightMarkerIds.forEach((flightId) => {
    const sprite = createDirectionalAircraftSprite(flightId, flightMarkerColors[flightId]);
    sprite.userData.flightId = flightId;
    group.add(sprite);
  });

  return group;
}

function createDirectionalAircraftSprite(flightId: FlightId, color: string) {
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const label = flightId.toUpperCase();

  if (context) {
    context.clearRect(0, 0, size, size);
    context.translate(size / 2, size / 2);

    context.fillStyle = "rgba(14, 17, 14, 0.78)";
    context.strokeStyle = color;
    context.lineWidth = 8;
    context.beginPath();
    context.arc(0, 0, 88, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.strokeStyle = "rgba(255, 255, 255, 0.66)";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, -116);
    context.lineTo(0, -94);
    context.moveTo(0, 94);
    context.lineTo(0, 116);
    context.moveTo(-116, 0);
    context.lineTo(-94, 0);
    context.moveTo(94, 0);
    context.lineTo(116, 0);
    context.stroke();

    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, -78);
    context.lineTo(12, -32);
    context.lineTo(78, -3);
    context.lineTo(79, 15);
    context.lineTo(13, 5);
    context.lineTo(9, 54);
    context.lineTo(30, 72);
    context.lineTo(30, 87);
    context.lineTo(0, 73);
    context.lineTo(-30, 87);
    context.lineTo(-30, 72);
    context.lineTo(-9, 54);
    context.lineTo(-13, 5);
    context.lineTo(-79, 15);
    context.lineTo(-78, -3);
    context.lineTo(-12, -32);
    context.closePath();
    context.fill();

    context.fillStyle = "#f6f0db";
    context.font = "800 24px Inter, ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 0, 112);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    fog: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = `${label} current direction marker`;
  sprite.renderOrder = 190;
  sprite.frustumCulled = false;
  return sprite;
}

function updateAllAircraftMarkers(
  group: THREE.Group,
  camera: THREE.PerspectiveCamera,
  timelineTime: number,
  activeFlightId: FlightId,
  cameraMode: CameraMode,
  showAircraftMarker: boolean,
  smoothReplay: boolean
) {
  group.visible = showAircraftMarker;
  if (!showAircraftMarker) {
    return;
  }

  const isOverview = cameraMode === "full_path" || cameraMode === "top_down" || cameraMode === "wide_aerial";
  const interpolationMode = smoothReplay ? "smooth" : "linear";

  group.children.forEach((child) => {
    const marker = child as THREE.Sprite;
    const flightId = marker.userData.flightId as FlightId | undefined;
    if (!flightId) {
      return;
    }
    if (!isFlightReplayDataVisible(flightId, timelineTime)) {
      marker.visible = false;
      return;
    }

    const state = getFlightReplayState(flightId, timelineTime, { interpolationMode });
    const position = displayPositionForReplayState(state);
    const tangent = new THREE.Vector3(...state.tangent);
    if (tangent.lengthSq() < 0.000001) {
      tangent.set(1, 0, 0);
    } else {
      tangent.normalize();
    }

    const distance = camera.position.distanceTo(position);
    const worldSize = THREE.MathUtils.clamp(
      distance * (isOverview ? 0.19 : 0.055),
      isOverview ? 7800 : 180,
      isOverview ? 42000 : 2800
    );
    const altitudeOffset = THREE.MathUtils.clamp(distance * 0.003, isOverview ? 1600 : 64, isOverview ? 7800 : 1200);
    const active = flightId === activeFlightId;

    marker.visible = true;
    marker.position.copy(position).add(new THREE.Vector3(0, altitudeOffset + (active ? 500 : 0), 0));
    marker.scale.set(worldSize * (active ? 1.18 : 1), worldSize * (active ? 1.18 : 1), 1);
    marker.material.opacity = active ? 1 : 0.82;
    marker.material.rotation = projectedDirectionRotation(marker.position, tangent, camera);
  });
}

function projectedDirectionRotation(position: THREE.Vector3, tangent: THREE.Vector3, camera: THREE.Camera) {
  const start = position.clone().project(camera);
  const end = position.clone().add(tangent.clone().multiplyScalar(1200)).project(camera);
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.hypot(dx, dy) < 0.000001) {
    return 0;
  }

  return -Math.atan2(dx, dy);
}

function createSegmentedTubePath(points: THREE.Vector3[], radius: number, material: THREE.Material, renderOrder: number) {
  const group = new THREE.Group();
  group.renderOrder = renderOrder;
  group.frustumCulled = false;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (length < 0.001) {
      continue;
    }

    const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
    segment.position.copy(start).add(end).multiplyScalar(0.5);
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    segment.renderOrder = renderOrder;
    segment.frustumCulled = false;
    group.add(segment);
  }

  return group;
}

function createAircraftModel() {
  const group = new THREE.Group();
  group.name = "Dimension-scaled historical aircraft model, 757 base geometry with 767 visual scaling";

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xe9e7dd,
    roughness: 0.42,
    metalness: 0.32,
    emissive: 0x1b1b17
  });
  const bellyMaterial = new THREE.MeshStandardMaterial({
    color: 0xa9adb0,
    roughness: 0.54,
    metalness: 0.2,
    emissive: 0x121414
  });
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0x8d2938 });
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0xd3d9d7,
    roughness: 0.5,
    metalness: 0.32,
    emissive: 0x222624,
    side: THREE.DoubleSide
  });
  const wingUndersideMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fa6a5,
    roughness: 0.62,
    metalness: 0.22,
    side: THREE.DoubleSide
  });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x232826, roughness: 0.7, metalness: 0.1 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2a2d, roughness: 0.28, metalness: 0.16 });

  const length = boeing757200ReferenceDimensions.lengthMeters;
  const wingspan = boeing757200ReferenceDimensions.wingspanMeters;
  const tailHeight = boeing757200ReferenceDimensions.tailHeightMeters;
  const halfLength = length / 2;
  const fuselageRadius = 1.9;
  const noseLength = 5.0;
  const tailConeLength = 4.0;
  const noseStart = halfLength - noseLength;
  const tailConeStart = -halfLength + tailConeLength;
  const tubeLength = noseStart - tailConeStart;
  const tubeCenterX = (noseStart + tailConeStart) / 2;

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(fuselageRadius, fuselageRadius * 1.04, tubeLength, 32), bodyMaterial);
  fuselage.rotation.z = Math.PI / 2;
  fuselage.position.x = tubeCenterX;
  fuselage.castShadow = true;
  group.add(fuselage);

  const belly = new THREE.Mesh(new THREE.CylinderGeometry(fuselageRadius * 1.01, fuselageRadius * 1.04, tubeLength * 0.86, 28, 1, true), bellyMaterial);
  belly.rotation.z = Math.PI / 2;
  belly.rotation.x = Math.PI;
  belly.position.set(tubeCenterX - 0.4, -0.44, 0);
  group.add(belly);

  [-1, 1].forEach((side) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(length * 0.74, 0.26, 0.12), stripeMaterial);
    stripe.position.set(-1.6, 0.42, side * (fuselageRadius + 0.06));
    group.add(stripe);
  });

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), bodyMaterial);
  nose.scale.set(noseLength, fuselageRadius * 0.98, fuselageRadius * 0.98);
  nose.position.x = noseStart;
  nose.castShadow = true;
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(fuselageRadius * 0.95, tailConeLength, 28), bodyMaterial);
  tailCone.rotation.z = Math.PI / 2;
  tailCone.position.x = -halfLength + tailConeLength / 2;
  tailCone.castShadow = true;
  group.add(tailCone);

  const wingRootFairing = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.72, 4.7), wingUndersideMaterial);
  wingRootFairing.position.set(-2.2, -0.42, 0);
  wingRootFairing.castShadow = true;
  group.add(wingRootFairing);

  [-1, 1].forEach((side) => {
    const mainWingOptions: WingPanelOptions = {
      side: side as -1 | 1,
      rootChord: 11.8,
      semiSpan: wingspan / 2,
      tipChord: 4.1,
      sweep: 6.4,
      thickness: 0.48,
      dihedral: 0.8,
      rootOffset: fuselageRadius * 0.82
    };
    const mainWing = new THREE.Mesh(createSweptWingPanelGeometry(mainWingOptions), wingMaterial);
    mainWing.position.set(-1.4, -0.08, 0);
    mainWing.castShadow = true;
    mainWing.receiveShadow = true;
    group.add(mainWing);
    group.add(createWingOutline(mainWingOptions, new THREE.Vector3(-1.4, -0.08, 0), 0x596060));
    group.add(createWingEdgeTubes(mainWingOptions, new THREE.Vector3(-1.4, -0.08, 0), 0x5d6864));

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.25, 0.7), wingUndersideMaterial);
    pylon.position.set(0.2, -1.08, side * 7.55);
    pylon.rotation.z = -0.08;
    pylon.castShadow = true;
    group.add(pylon);

    const nacelle = createEngineNacelle(bodyMaterial, darkMaterial);
    nacelle.position.set(0.5, -2.45, side * 7.75);
    group.add(nacelle);

    const wingtipLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 8),
      new THREE.MeshBasicMaterial({ color: side > 0 ? 0x78e08a : 0xd64f4f })
    );
    wingtipLight.position.set(-7.4, 0.58, side * (wingspan / 2 + 0.05));
    group.add(wingtipLight);
  });

  [-1, 1].forEach((side) => {
    const stabilizerOptions: WingPanelOptions = {
      side: side as -1 | 1,
      rootChord: 5.0,
      semiSpan: 7.45,
      tipChord: 2.4,
      sweep: 2.6,
      thickness: 0.28,
      dihedral: 0.22,
      rootOffset: 0.92
    };
    const tailWing = new THREE.Mesh(createSweptWingPanelGeometry(stabilizerOptions), wingMaterial);
    tailWing.position.set(-20.2, 2.62, 0);
    tailWing.castShadow = true;
    group.add(tailWing);
    group.add(createWingOutline(stabilizerOptions, new THREE.Vector3(-20.2, 2.62, 0), 0x596060));
    group.add(createWingEdgeTubes(stabilizerOptions, new THREE.Vector3(-20.2, 2.62, 0), 0x5d6864));
  });

  const verticalTail = new THREE.Mesh(createTailGeometry(7.4, tailHeight - fuselageRadius, 0.82), darkMaterial);
  verticalTail.position.set(-20.5, fuselageRadius, 0);
  verticalTail.castShadow = true;
  group.add(verticalTail);

  for (let side = -1; side <= 1; side += 2) {
    for (let index = 0; index < 14; index += 1) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.06), darkMaterial);
      window.position.set(14.2 - index * 2.45, 1.12, side * (fuselageRadius + 0.08));
      group.add(window);
    }
  }

  [-1, 1].forEach((side) => {
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.34, 0.08), glassMaterial);
    cockpit.position.set(18.4, 1.35, side * 1.05);
    cockpit.rotation.y = side * -0.28;
    cockpit.rotation.z = 0.08;
    group.add(cockpit);
  });

  return group;
}

function createSweptWingPanelGeometry(options: WingPanelOptions) {
  const vertices: number[] = [];
  const points = wingPanelPoints(options);
  const pushQuad =
    options.side > 0
      ? pushQuadPoints
      : (target: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) =>
          pushQuadPoints(target, d, c, b, a);

  pushQuad(vertices, points.topRootLeading, points.topRootTrailing, points.topTipTrailing, points.topTipLeading);
  pushQuad(vertices, points.bottomRootLeading, points.bottomTipLeading, points.bottomTipTrailing, points.bottomRootTrailing);
  pushQuad(vertices, points.topRootLeading, points.topTipLeading, points.bottomTipLeading, points.bottomRootLeading);
  pushQuad(vertices, points.topRootTrailing, points.bottomRootTrailing, points.bottomTipTrailing, points.topTipTrailing);
  pushQuad(vertices, points.topTipLeading, points.topTipTrailing, points.bottomTipTrailing, points.bottomTipLeading);
  pushQuad(vertices, points.topRootLeading, points.bottomRootLeading, points.bottomRootTrailing, points.topRootTrailing);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function wingPanelPoints(options: WingPanelOptions) {
  const rootZ = options.side * options.rootOffset;
  const tipZ = options.side * options.semiSpan;
  const rootLeadingX = options.rootChord / 2;
  const rootTrailingX = -options.rootChord / 2;
  const tipLeadingX = rootLeadingX - options.sweep;
  const tipTrailingX = tipLeadingX - options.tipChord;
  const topRootY = options.thickness / 2;
  const bottomRootY = -options.thickness / 2;
  const topTipY = options.dihedral + options.thickness / 2;
  const bottomTipY = options.dihedral - options.thickness / 2;

  return {
    topRootLeading: new THREE.Vector3(rootLeadingX, topRootY, rootZ),
    topRootTrailing: new THREE.Vector3(rootTrailingX, topRootY, rootZ),
    topTipLeading: new THREE.Vector3(tipLeadingX, topTipY, tipZ),
    topTipTrailing: new THREE.Vector3(tipTrailingX, topTipY, tipZ),
    bottomRootLeading: new THREE.Vector3(rootLeadingX, bottomRootY, rootZ),
    bottomRootTrailing: new THREE.Vector3(rootTrailingX, bottomRootY, rootZ),
    bottomTipLeading: new THREE.Vector3(tipLeadingX, bottomTipY, tipZ),
    bottomTipTrailing: new THREE.Vector3(tipTrailingX, bottomTipY, tipZ)
  };
}

function createWingOutline(options: WingPanelOptions, offset: THREE.Vector3, color: number) {
  const points = wingPanelPoints(options);
  const top = [
    points.topRootLeading,
    points.topTipLeading,
    points.topTipTrailing,
    points.topRootTrailing,
    points.topRootLeading
  ].map((point) => point.clone().add(offset));
  const geometry = new THREE.BufferGeometry().setFromPoints(top);
  const outline = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  outline.renderOrder = 64;
  return outline;
}

function createWingEdgeTubes(options: WingPanelOptions, offset: THREE.Vector3, color: number) {
  const group = new THREE.Group();
  const points = wingPanelPoints(options);
  const edges = [
    [points.topRootLeading, points.topTipLeading],
    [points.topRootTrailing, points.topTipTrailing],
    [points.topTipLeading, points.topTipTrailing]
  ] as const;

  edges.forEach(([start, end]) => {
    group.add(createAircraftEdgeTube(start.clone().add(offset), end.clone().add(offset), 0.13, color));
  });

  return group;
}

function createAircraftEdgeTube(start: THREE.Vector3, end: THREE.Vector3, radius: number, color: number) {
  const geometry = new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 1, radius, 8, false);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  mesh.renderOrder = 65;
  return mesh;
}

function createEngineNacelle(bodyMaterial: THREE.Material, darkMaterial: THREE.Material) {
  const group = new THREE.Group();

  const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.28, 5.3, 28), darkMaterial);
  nacelle.rotation.z = Math.PI / 2;
  nacelle.castShadow = true;
  group.add(nacelle);

  const intakeRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.15, 8, 28), bodyMaterial);
  intakeRing.rotation.y = Math.PI / 2;
  intakeRing.position.x = 2.65;
  group.add(intakeRing);

  const fanDisk = new THREE.Mesh(new THREE.CircleGeometry(0.88, 24), darkMaterial);
  fanDisk.rotation.y = Math.PI / 2;
  fanDisk.position.x = 2.72;
  group.add(fanDisk);

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.98, 0.32, 20), darkMaterial);
  exhaust.rotation.z = Math.PI / 2;
  exhaust.position.x = -2.75;
  group.add(exhaust);

  return group;
}

function createTailGeometry(rootChord: number, height: number, thickness: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-rootChord * 0.54, 0);
  shape.lineTo(rootChord * 0.46, 0);
  shape.lineTo(rootChord * 0.12, height);
  shape.lineTo(-rootChord * 0.44, height * 0.86);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

function createMarkerPin(confidence: "high" | "medium" | "low") {
  const group = new THREE.Group();
  const color = confidence === "high" ? 0x79e28f : confidence === "medium" ? 0xf0c847 : 0xff956e;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 28, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 })
  );
  stem.position.y = -14;
  group.add(stem);

  const head = new THREE.Mesh(new THREE.SphereGeometry(5.5, 18, 18), new THREE.MeshBasicMaterial({ color }));
  group.add(head);

  return group;
}

function updateCameraFrustums(group: THREE.Group, fovOverrides: CameraFovOverrides) {
  const cam1Fov = effectiveCameraFov("security_cam_01", fovOverrides);
  const cam2Fov = effectiveCameraFov("security_cam_02", fovOverrides);
  const signature = `${cam1Fov}:${cam2Fov}`;

  if (group.userData.fovSignature === signature) {
    return;
  }

  disposeObjectChildren(group);
  group.clear();
  group.add(
    createCameraFrustum(
      cameraPresets.security_cam_01.position,
      cameraPresets.security_cam_01.target,
      cameraPresets.security_cam_01.frustumColor ?? 0xc9f0bc,
      cam1Fov
    )
  );
  group.add(
    createCameraFrustum(
      cameraPresets.security_cam_02.position,
      cameraPresets.security_cam_02.target,
      cameraPresets.security_cam_02.frustumColor ?? 0x94d4ff,
      cam2Fov
    )
  );
  group.userData.fovSignature = signature;
}

function createCameraFrustum(position: THREE.Vector3, target: THREE.Vector3, color: number, fov: number) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.58 });
  const direction = target.clone().sub(position).normalize();
  const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, direction).normalize();
  const depth = 210;
  const center = position.clone().add(direction.multiplyScalar(depth));
  const height = Math.tan(degToRad(fov) / 2) * depth;
  const width = height * (312 / 212);
  const corners = [
    center.clone().add(right.clone().multiplyScalar(width)).add(up.clone().multiplyScalar(height)),
    center.clone().add(right.clone().multiplyScalar(-width)).add(up.clone().multiplyScalar(height)),
    center.clone().add(right.clone().multiplyScalar(-width)).add(up.clone().multiplyScalar(-height)),
    center.clone().add(right.clone().multiplyScalar(width)).add(up.clone().multiplyScalar(-height))
  ];

  const points: THREE.Vector3[] = [];
  corners.forEach((corner) => {
    points.push(position, corner);
  });
  points.push(corners[0], corners[1], corners[2], corners[3], corners[0]);

  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material));
  const cameraBody = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 9), new THREE.MeshBasicMaterial({ color }));
  cameraBody.position.copy(position);
  group.add(cameraBody);
  return group;
}

function disposeObjectChildren(group: THREE.Group) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose?.();
    }
  });
}

function createEvidenceAlignmentOverlay() {
  const group = new THREE.Group();
  group.name = "NTSB/ASCE physical evidence alignment overlay - evidence reference separate from replay endpoint";

  const terminal = getReplayState(fdrReplayDuration);
  const inbound = finalHorizontalDirection(terminal);
  const right = new THREE.Vector3().crossVectors(inbound, new THREE.Vector3(0, 1, 0)).normalize();
  const fdrProjection = finalHeadingFacadeIntercept(terminal, inbound);
  const groundImpact = sourceImpactFacadeReference();

  group.add(createAsceDamageGridOverlay(groundImpact, inbound));

  const documentedTrackStart = groundImpact.clone().addScaledVector(inbound, -380);
  const damagePathEnd = groundImpact.clone().addScaledVector(inbound, 165);
  group.add(createEvidenceTube(documentedTrackStart, groundImpact, 1.25, 0x8fd0ff, 0.82));
  group.add(createEvidenceTube(groundImpact, damagePathEnd, 1.55, 0xff956e, 0.9));

  const trackLabel = createTextSprite("South-shifted facade contact reference", "#dff8ff", "rgba(8, 35, 46, 0.78)");
  trackLabel.position.copy(groundImpact).addScaledVector(inbound, -245).addScaledVector(right, -44);
  trackLabel.position.y = 34;
  trackLabel.scale.set(242, 36, 1);
  group.add(trackLabel);

  const projectionOffset = fdrProjection.distanceTo(groundImpact);
  if (projectionOffset > 8) {
    const projectionPin = createMarkerPin("medium");
    projectionPin.position.copy(fdrProjection).add(new THREE.Vector3(0, 16, 0));
    projectionPin.scale.multiplyScalar(0.72);
    projectionPin.name = "Decoded FDR final-heading projection diagnostic";
    group.add(projectionPin);

    const projectionLabel = createTextSprite(
      `Final FDR heading projects ${formatHorizontalOffset(fdrProjection, groundImpact)} from contact reference`,
      "#f5e7bc",
      "rgba(34, 29, 12, 0.78)"
    );
    projectionLabel.position.copy(fdrProjection).addScaledVector(right, 34).add(new THREE.Vector3(0, 28, 0));
    projectionLabel.scale.set(282, 32, 1);
    group.add(projectionLabel);
  }

  const damageLabel = createTextSprite("ASCE: CL8-20 facade damage, ~42 deg path", "#ffd2bd", "rgba(52, 21, 10, 0.82)");
  damageLabel.position.copy(groundImpact).addScaledVector(inbound, 92).add(new THREE.Vector3(0, 38, 0));
  damageLabel.scale.set(286, 36, 1);
  group.add(damageLabel);

  const lightPoleDistances = [350, 298, 246, 194, 142];
  lightPoleDistances.forEach((distance, index) => {
    const pole = createShearedLightPoleCue(index + 1);
    pole.position.copy(groundImpact).addScaledVector(inbound, -distance).addScaledVector(right, (index - 2) * 1.2);
    group.add(pole);
  });

  const poleLabel = createTextSprite("5 documented struck light poles", "#f3e7a4", "rgba(38, 32, 7, 0.82)");
  poleLabel.position.copy(groundImpact).addScaledVector(inbound, -256).addScaledVector(right, 45);
  poleLabel.position.y = 31;
  poleLabel.scale.set(248, 36, 1);
  group.add(poleLabel);

  const wingspanCenter = groundImpact.clone().addScaledVector(inbound, -178);
  const leftWing = wingspanCenter.clone().addScaledVector(right, -boeing757200ReferenceDimensions.wingspanMeters / 2);
  const rightWing = wingspanCenter.clone().addScaledVector(right, boeing757200ReferenceDimensions.wingspanMeters / 2);
  group.add(createEvidenceTube(leftWing, rightWing, 0.95, 0x78d98b, 0.88));

  const wingspanLabel = createTextSprite("757-200 wingspan 38.0 m / 124 ft 10 in", "#c8ffd0", "rgba(14, 44, 21, 0.78)");
  wingspanLabel.position.copy(wingspanCenter).add(new THREE.Vector3(0, 28, 0));
  wingspanLabel.scale.set(286, 34, 1);
  group.add(wingspanLabel);

  const generatorCue = new THREE.Mesh(
    new THREE.BoxGeometry(16, 5, 8),
    new THREE.MeshBasicMaterial({
      color: 0x7c8780,
      transparent: true,
      opacity: 0.84,
      depthTest: false,
      depthWrite: false
    })
  );
  generatorCue.position.copy(groundImpact).addScaledVector(inbound, -72).addScaledVector(right, 23);
  generatorCue.position.y = 3.1;
  generatorCue.rotation.y = -Math.atan2(inbound.z, inbound.x);
  generatorCue.renderOrder = 23;
  group.add(generatorCue);

  const generatorLabel = createTextSprite("ASCE: right wing / generator contact", "#ecf0e8", "rgba(38, 43, 38, 0.82)");
  generatorLabel.position.copy(generatorCue.position).add(new THREE.Vector3(0, 30, 0)).addScaledVector(right, 16);
  generatorLabel.scale.set(282, 36, 1);
  group.add(generatorLabel);

  const impactPin = createMarkerPin("low");
  impactPin.position.copy(groundImpact).add(new THREE.Vector3(0, 18, 0));
  group.add(impactPin);

  const impactLabel = createTextSprite("Facade contact/collapse reference - not replay driver", "#f7a65b", "rgba(42, 22, 8, 0.82)");
  impactLabel.position.copy(groundImpact).addScaledVector(right, -42).add(new THREE.Vector3(0, 34, 0));
  impactLabel.scale.set(306, 36, 1);
  group.add(impactLabel);

  return group;
}

function createAsceDamageGridOverlay(groundImpact: THREE.Vector3, inbound: THREE.Vector3) {
  const group = new THREE.Group();
  group.name = "ASCE encoded first-story damage grid and column-line overlay";

  const basis = createAsceDamageBasis(groundImpact, inbound);
  const swathHalfWidth = asceDamageGrid.seriousDamageSwath.widthFt / 2;
  const severeHalfBase = asceDamageGrid.severeDamageTriangle.baseWidthFt / 2;

  const swath = [
    asceDamagePoint(basis, 0, -swathHalfWidth, 1.42),
    asceDamagePoint(basis, asceDamageGrid.seriousDamageSwath.lengthFt, -swathHalfWidth, 1.42),
    asceDamagePoint(basis, asceDamageGrid.seriousDamageSwath.lengthFt, swathHalfWidth, 1.42),
    asceDamagePoint(basis, 0, swathHalfWidth, 1.42)
  ];
  group.add(createAsceDamageArea(swath, 0x8fd0ff, 0.14, asceDamageGrid.seriousDamageSwath.label));
  group.add(createAscePolyline(swath, 0x8fd0ff, 0.82, 0.42, true));

  const severeTriangle = [
    asceDamagePoint(basis, 0, -severeHalfBase, 1.62),
    asceDamagePoint(basis, 0, severeHalfBase, 1.62),
    asceDamagePoint(basis, asceDamageGrid.severeDamageTriangle.lengthFt, 0, 1.62)
  ];
  group.add(createAsceDamageArea(severeTriangle, 0xff956e, 0.23, asceDamageGrid.severeDamageTriangle.label));
  group.add(createAscePolyline(severeTriangle, 0xff956e, 0.9, 0.48, true));

  asceDamageGrid.damageRegions.forEach((region, index) => {
    const points = [
      asceDamagePoint(basis, region.pathStartFt, region.lateralMinFt, 1.86 + index * 0.12),
      asceDamagePoint(basis, region.pathEndFt, region.lateralMinFt, 1.86 + index * 0.12),
      asceDamagePoint(basis, region.pathEndFt, region.lateralMaxFt, 1.86 + index * 0.12),
      asceDamagePoint(basis, region.pathStartFt, region.lateralMaxFt, 1.86 + index * 0.12)
    ];
    group.add(createAsceDamageArea(points, index === 0 ? 0xff4d4d : 0xffd26a, index === 0 ? 0.16 : 0.19, region.label));
    group.add(createAscePolyline(points, index === 0 ? 0xff4d4d : 0xffd26a, 0.8, 0.34, true));

    const label = createTextSprite(region.label, "#fff4d2", "rgba(57, 37, 8, 0.82)");
    label.position.copy(asceDamagePoint(basis, (region.pathStartFt + region.pathEndFt) / 2, region.lateralMaxFt + 10, 24));
    label.scale.set(224, 31, 1);
    label.renderOrder = 28;
    group.add(label);
  });

  const axisStart = asceDamagePoint(basis, -22, 0, 2.2);
  const axisEnd = asceDamagePoint(basis, asceDamageGrid.ringCExit.distanceFt, 0, 2.2);
  group.add(createAsceTube(axisStart, axisEnd, 0.58, 0xffe064, 0.96, 27));

  const axisLabel = createTextSprite("ASCE 42 deg structural damage axis", "#fff0a6", "rgba(42, 33, 7, 0.84)");
  axisLabel.position.copy(asceDamagePoint(basis, 135, -46, 28));
  axisLabel.scale.set(286, 34, 1);
  axisLabel.renderOrder = 29;
  group.add(axisLabel);

  const facadeSevereStart = asceDamagePoint(
    basis,
    0,
    (asceDamageGrid.facadeDamage.severeFromColumnLine - asceDamageGrid.impactColumnLine) *
      asceDamageGrid.columnSpacingFt,
    2.45
  );
  const facadeSevereEnd = asceDamagePoint(
    basis,
    0,
    (asceDamageGrid.facadeDamage.severeToColumnLine - asceDamageGrid.impactColumnLine) *
      asceDamageGrid.columnSpacingFt,
    2.45
  );
  group.add(createAsceTube(facadeSevereStart, facadeSevereEnd, 0.78, 0xffb35a, 0.92, 28));

  const openingStart = asceDamagePoint(
    basis,
    -1,
    (asceDamageGrid.facadeDamage.openingFromColumnLine - asceDamageGrid.impactColumnLine) *
      asceDamageGrid.columnSpacingFt,
    3.05
  );
  const openingEnd = asceDamagePoint(
    basis,
    -1,
    (asceDamageGrid.facadeDamage.openingToColumnLine - asceDamageGrid.impactColumnLine) *
      asceDamageGrid.columnSpacingFt,
    3.05
  );
  group.add(createAsceTube(openingStart, openingEnd, 0.92, 0xff4d4d, 0.96, 29));

  asceDamageGrid.facadeColumns.forEach((column) => {
    const columnPoint = asceDamagePoint(basis, 0, column.offsetFtFromCl14, 0.4);
    const tickEnd = asceDamagePoint(basis, 22, column.offsetFtFromCl14, 0.4);
    group.add(createAsceTube(columnPoint, tickEnd, 0.22, asceFacadeColumnColor(column.status), 0.84, 28));
    group.add(createAsceColumnMarker(columnPoint, column.status, `CL${column.line}`));

    if (column.label || column.line % 2 === 0) {
      const label = createTextSprite(`CL${column.line}`, "#fff3d0", "rgba(27, 24, 17, 0.82)");
      label.position.copy(asceDamagePoint(basis, -12, column.offsetFtFromCl14, 21));
      label.scale.set(48, 26, 1);
      label.renderOrder = 30;
      group.add(label);
    }
  });

  asceDamageGrid.distanceStationsFt.forEach((stationFt) => {
    const stationHalfWidth =
      stationFt === asceDamageGrid.ringCExit.distanceFt ? 23 : Math.max(24, swathHalfWidth - stationFt * 0.045);
    const start = asceDamagePoint(basis, stationFt, -stationHalfWidth, 2.05);
    const end = asceDamagePoint(basis, stationFt, stationHalfWidth, 2.05);
    group.add(createAsceTube(start, end, 0.26, 0xf6f0db, 0.75, 27));

    const label =
      stationFt === asceDamageGrid.ringCExit.distanceFt
        ? "Ring C / AE Drive"
        : stationFt === asceDamageGrid.severeDamageTriangle.lengthFt
          ? "230 ft severe triangle"
          : `${stationFt} ft`;
    const stationLabel = createTextSprite(label, "#f5ecd2", "rgba(30, 30, 24, 0.8)");
    stationLabel.position.copy(asceDamagePoint(basis, stationFt, stationHalfWidth + 12, 23));
    stationLabel.scale.set(stationFt === asceDamageGrid.ringCExit.distanceFt ? 170 : 112, 28, 1);
    stationLabel.renderOrder = 30;
    group.add(stationLabel);
  });

  asceDamageGrid.interiorColumnReferences.forEach((column) => {
    const point = asceDamagePoint(basis, column.pathFt, column.lateralFt, 0.4);
    group.add(createAsceInteriorColumnMarker(point, column.status, column.id));

    const label = createTextSprite(column.id, "#151511", "rgba(246, 226, 130, 0.92)");
    label.position.copy(asceDamagePoint(basis, column.pathFt, column.lateralFt + 8, 20));
    label.scale.set(column.id.length > 3 ? 88 : 50, 26, 1);
    label.renderOrder = 31;
    group.add(label);
  });

  const sourceLabel = createTextSprite("ASCE encoded grid - not a damage simulation", "#ffd7c4", "rgba(52, 21, 10, 0.82)");
  sourceLabel.position.copy(asceDamagePoint(basis, 52, -64, 34));
  sourceLabel.scale.set(318, 34, 1);
  sourceLabel.renderOrder = 31;
  group.add(sourceLabel);

  return group;
}

function createAsceDamageBasis(groundImpact: THREE.Vector3, inbound: THREE.Vector3) {
  const edge = nearestFootprintEdge(groundImpact);
  const aircraftRight = new THREE.Vector3().crossVectors(inbound, new THREE.Vector3(0, 1, 0));
  if (aircraftRight.lengthSq() < 0.000001) {
    aircraftRight.set(1, 0, 0);
  } else {
    aircraftRight.normalize();
  }

  let facadeTangent = edge
    ? new THREE.Vector3(edge.end.x - edge.start.x, 0, edge.end.z - edge.start.z)
    : aircraftRight.clone();
  if (facadeTangent.lengthSq() < 0.000001) {
    facadeTangent.copy(aircraftRight);
  } else {
    facadeTangent.normalize();
  }

  if (facadeTangent.dot(aircraftRight) < 0) {
    facadeTangent.negate();
  }

  const normalA = new THREE.Vector3(-facadeTangent.z, 0, facadeTangent.x).normalize();
  const normalB = normalA.clone().negate();
  const facadeNormal = normalA.dot(inbound) >= normalB.dot(inbound) ? normalA : normalB;
  const damageAngleRad = degToRad(asceDamageGrid.damageAngleDegFromFacadeNormal);
  const normalComponent = facadeNormal.clone().multiplyScalar(Math.cos(damageAngleRad));
  const pathA = normalComponent
    .clone()
    .add(facadeTangent.clone().multiplyScalar(Math.sin(damageAngleRad)))
    .normalize();
  const pathB = normalComponent
    .clone()
    .add(facadeTangent.clone().multiplyScalar(-Math.sin(damageAngleRad)))
    .normalize();
  const pathAxis = pathA.dot(inbound) >= pathB.dot(inbound) ? pathA : pathB;

  return {
    origin: groundImpact.clone(),
    facadeTangent,
    facadeNormal,
    pathAxis
  };
}

function asceDamagePoint(
  basis: ReturnType<typeof createAsceDamageBasis>,
  pathFt: number,
  lateralFt: number,
  heightMeters: number
) {
  const point = basis.origin
    .clone()
    .addScaledVector(basis.pathAxis, pathFt * ASCE_FT_TO_M)
    .addScaledVector(basis.facadeTangent, lateralFt * ASCE_FT_TO_M);
  point.y = siteTerrainHeightAt(point.x, point.z) + heightMeters;
  return point;
}

function createAsceDamageArea(points: THREE.Vector3[], color: number, opacity: number, name: string) {
  const vertices: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    vertices.push(
      points[0].x,
      points[0].y,
      points[0].z,
      points[index].x,
      points[index].y,
      points[index].z,
      points[index + 1].x,
      points[index + 1].y,
      points[index + 1].z
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    })
  );
  mesh.name = name;
  mesh.renderOrder = 24;
  mesh.frustumCulled = false;
  return mesh;
}

function createAscePolyline(points: THREE.Vector3[], color: number, opacity: number, radius: number, closed: boolean) {
  const group = new THREE.Group();
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    group.add(createAsceTube(start, end, radius, color, opacity, 26));
  }

  return group;
}

function createAsceTube(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  color: number,
  opacity: number,
  renderOrder: number
) {
  const tube = createEvidenceTube(start, end, radius, color, opacity);
  tube.name = "ASCE encoded grid segment";
  tube.renderOrder = renderOrder;
  tube.frustumCulled = false;
  return tube;
}

function createAsceColumnMarker(position: THREE.Vector3, status: AsceFacadeColumnStatus, label: string) {
  const height = status === "removed" ? 7.5 : status === "opening_extent" ? 11 : 15;
  const radius = status === "removed" ? 0.82 : 0.54;
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 12),
    new THREE.MeshBasicMaterial({
      color: asceFacadeColumnColor(status),
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  marker.name = `ASCE facade column ${label} ${status}`;
  marker.position.copy(position);
  marker.position.y += height / 2;
  marker.renderOrder = 29;
  marker.frustumCulled = false;
  return marker;
}

function createAsceInteriorColumnMarker(
  position: THREE.Vector3,
  status: (typeof asceDamageGrid.interiorColumnReferences)[number]["status"],
  label: string
) {
  const color =
    status === "last_severed" ? 0xff4d4d : status === "ring_c_exit" ? 0x8fd0ff : status === "distorted_standing" ? 0xffd26a : 0xf6f0db;
  const height = status === "ring_c_exit" ? 12 : status === "last_severed" ? 9 : 13;
  const marker = new THREE.Group();
  marker.name = `ASCE interior column ${label} ${status}`;

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(status === "ring_c_exit" ? 1.15 : 0.72, status === "ring_c_exit" ? 1.15 : 0.72, height, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  column.position.copy(position);
  column.position.y += height / 2;
  column.renderOrder = 30;
  marker.add(column);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.22, 8, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      depthTest: false,
      depthWrite: false,
      fog: false
    })
  );
  halo.position.copy(position);
  halo.position.y += 0.2;
  halo.rotation.x = Math.PI / 2;
  halo.renderOrder = 30;
  marker.add(halo);

  return marker;
}

function asceFacadeColumnColor(status: AsceFacadeColumnStatus) {
  switch (status) {
    case "removed":
      return 0xff4d4d;
    case "severely_damaged":
      return 0xffb35a;
    case "opening_extent":
      return 0xffe064;
    case "second_floor_gash":
      return 0xcab8ff;
    case "reference":
    default:
      return 0xf6f0db;
  }
}

function nearestFootprintEdge(point: THREE.Vector3): FootprintEdge | null {
  let best: FootprintEdge | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const ring = osmPentagonFootprint.outer as Array<{ x: number; z: number }>;

  ring.forEach((start, index) => {
    const end = ring[(index + 1) % ring.length];
    const distance = pointSegmentDistanceSquared2d({ x: point.x, z: point.z }, start, end);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { start, end };
    }
  });

  return best;
}

function pointSegmentDistanceSquared2d(
  point: { x: number; z: number },
  segmentStart: { x: number; z: number },
  segmentEnd: { x: number; z: number }
) {
  const dx = segmentEnd.x - segmentStart.x;
  const dz = segmentEnd.z - segmentStart.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 0.000001) {
    const sx = point.x - segmentStart.x;
    const sz = point.z - segmentStart.z;
    return sx * sx + sz * sz;
  }

  const t = Math.min(Math.max(((point.x - segmentStart.x) * dx + (point.z - segmentStart.z) * dz) / lengthSq, 0), 1);
  const closestX = segmentStart.x + dx * t;
  const closestZ = segmentStart.z + dz * t;
  const offsetX = point.x - closestX;
  const offsetZ = point.z - closestZ;
  return offsetX * offsetX + offsetZ * offsetZ;
}

function closestPointOnSegment2d(
  point: { x: number; z: number },
  segmentStart: { x: number; z: number },
  segmentEnd: { x: number; z: number }
) {
  const dx = segmentEnd.x - segmentStart.x;
  const dz = segmentEnd.z - segmentStart.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 0.000001) {
    return new THREE.Vector3(segmentStart.x, 0, segmentStart.z);
  }

  const t = Math.min(Math.max(((point.x - segmentStart.x) * dx + (point.z - segmentStart.z) * dz) / lengthSq, 0), 1);
  return new THREE.Vector3(segmentStart.x + dx * t, 0, segmentStart.z + dz * t);
}

function finalHorizontalDirection(replayState: ReplayState) {
  if (Number.isFinite(replayState.headingDeg)) {
    const heading = degToRad(replayState.headingDeg as number);
    return new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading)).normalize();
  }

  const tangent = new THREE.Vector3(...replayState.tangent);
  tangent.y = 0;
  if (tangent.lengthSq() < 0.000001) {
    return new THREE.Vector3(1, 0, 0);
  }

  return tangent.normalize();
}

function finalHeadingFacadeIntercept(replayState: ReplayState, inbound: THREE.Vector3) {
  const origin = new THREE.Vector3(...replayState.position);
  origin.y = 0;
  const hit = firstFootprintRayIntersection(origin, inbound);
  const impact = hit ?? new THREE.Vector3(0, 0, 0);
  impact.y = siteTerrainHeightAt(impact.x, impact.z) + 1.2;
  return impact;
}

function formatHorizontalOffset(point: THREE.Vector3, reference: THREE.Vector3) {
  const dx = point.x - reference.x;
  const dz = point.z - reference.z;
  const distance = Math.hypot(dx, dz);
  const northSouth = dz < -2 ? "north" : dz > 2 ? "south" : "";
  const eastWest = dx > 2 ? "east" : dx < -2 ? "west" : "";
  const direction =
    Math.abs(dz) >= Math.abs(dx) * 1.5
      ? northSouth
      : Math.abs(dx) >= Math.abs(dz) * 1.5
        ? eastWest
        : [northSouth, eastWest].filter(Boolean).join("-");
  return `${Math.round(distance)} m ${direction || "away"}`;
}

function sourceImpactFacadeReference() {
  const impact = evidenceImpactReferencePoint();
  impact.y = siteTerrainHeightAt(impact.x, impact.z) + impactReferenceHeightMeters;
  return impact;
}

function firstFootprintRayIntersection(origin: THREE.Vector3, direction: THREE.Vector3) {
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestPoint: THREE.Vector3 | null = null;
  const ring = osmPentagonFootprint.outer as Array<{ x: number; z: number }>;

  ring.forEach((start, index) => {
    const end = ring[(index + 1) % ring.length];
    const hit = raySegmentIntersection2d(
      { x: origin.x, z: origin.z },
      { x: direction.x, z: direction.z },
      start,
      end
    );

    if (!hit || hit.distance < 0) {
      return;
    }

    if (hit.distance < nearestDistance) {
      nearestDistance = hit.distance;
      nearestPoint = new THREE.Vector3(hit.x, 0, hit.z);
    }
  });

  return nearestPoint;
}

function raySegmentIntersection2d(
  origin: { x: number; z: number },
  direction: { x: number; z: number },
  segmentStart: { x: number; z: number },
  segmentEnd: { x: number; z: number }
) {
  const segment = { x: segmentEnd.x - segmentStart.x, z: segmentEnd.z - segmentStart.z };
  const determinant = cross2d(direction, segment);
  if (Math.abs(determinant) < 0.000001) {
    return null;
  }

  const delta = { x: segmentStart.x - origin.x, z: segmentStart.z - origin.z };
  const distance = cross2d(delta, segment) / determinant;
  const segmentT = cross2d(delta, direction) / determinant;

  if (distance < 0 || segmentT < 0 || segmentT > 1) {
    return null;
  }

  return {
    distance,
    x: origin.x + direction.x * distance,
    z: origin.z + direction.z * distance
  };
}

function createEvidenceTube(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  color: number,
  opacity: number
) {
  const geometry = new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 1, radius, 10, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    fog: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 22;
  return mesh;
}

function createShearedLightPoleCue(index: number) {
  const group = new THREE.Group();
  group.name = `Approximate light-pole evidence cue ${index}`;

  const poleMaterial = new THREE.MeshBasicMaterial({
    color: 0xf0c847,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 7, 10), poleMaterial);
  base.position.y = 3.5;
  base.renderOrder = 23;
  group.add(base);

  const shearedArm = new THREE.Mesh(new THREE.BoxGeometry(13, 0.75, 1.1), poleMaterial);
  shearedArm.position.set(5.2, 8.2, 0);
  shearedArm.rotation.z = -0.34;
  shearedArm.renderOrder = 23;
  group.add(shearedArm);

  const label = createTextSprite(String(index), "#1d1b10", "rgba(240, 200, 71, 0.9)");
  label.position.y = 20;
  label.scale.set(34, 26, 1);
  group.add(label);

  return group;
}

function createTextSprite(text: string, color: string, background: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = 768;
  const height = 160;
  canvas.width = width;
  canvas.height = height;

  if (context) {
    context.clearRect(0, 0, width, height);
    roundRect(context, 12, 18, width - 24, height - 36, 18, background);
    context.font = "600 36px Inter, ui-sans-serif, system-ui, sans-serif";
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, height / 2 + 2, width - 56);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.isSceneLabel = true;
  sprite.scale.set(170, 36, 1);
  return sprite;
}

function setSceneLabelVisibility(scene: THREE.Scene, visible: boolean) {
  scene.traverse((object) => {
    if (object.userData.isSceneLabel) {
      object.visible = visible;
    }
  });
}

function applyAircraftScale(aircraft: THREE.Group, flightId: FlightId) {
  const dimensions = aircraftReferenceDimensionsForFlight(flightId);
  aircraft.scale.set(
    dimensions.lengthMeters / boeing757200ReferenceDimensions.lengthMeters,
    dimensions.tailHeightMeters / boeing757200ReferenceDimensions.tailHeightMeters,
    dimensions.wingspanMeters / boeing757200ReferenceDimensions.wingspanMeters
  );
}

function applyAircraftAttitude(aircraft: THREE.Group, replayState: ReplayState) {
  aircraft.quaternion.copy(attitudeQuaternionFromReplay(replayState));
}

function attitudeQuaternionFromReplay(replayState: ReplayState) {
  const fallbackTangent = new THREE.Vector3(...replayState.tangent);
  if (fallbackTangent.lengthSq() < 0.000001) {
    fallbackTangent.copy(flightForward);
  } else {
    fallbackTangent.normalize();
  }

  const headingDeg = finiteOr(
    replayState.pathBearingDeg ?? replayState.trackDeg,
    finiteOr(replayState.yawDeg ?? replayState.headingDeg, headingFromWorldVector(fallbackTangent))
  );
  const pitchDeg = finiteOr(replayState.pitchDeg, pitchFromWorldVector(fallbackTangent));
  const rollDeg = finiteOr(replayState.visualRollDeg ?? replayState.rollDeg, 0);
  const headingRad = degToRad(headingDeg);
  const pitchRad = degToRad(pitchDeg);
  const forward = new THREE.Vector3(
    Math.sin(headingRad) * Math.cos(pitchRad),
    Math.sin(pitchRad),
    -Math.cos(headingRad) * Math.cos(pitchRad)
  );

  if (forward.lengthSq() < 0.000001) {
    forward.copy(fallbackTangent);
  } else {
    forward.normalize();
  }

  const worldUp = new THREE.Vector3(0, 1, 0);
  const zeroRight = new THREE.Vector3().crossVectors(forward, worldUp);
  if (zeroRight.lengthSq() < 0.000001) {
    zeroRight.set(1, 0, 0);
  } else {
    zeroRight.normalize();
  }

  const zeroUp = new THREE.Vector3().crossVectors(zeroRight, forward).normalize();
  const roll = new THREE.Quaternion().setFromAxisAngle(forward, degToRad(rollDeg));
  const rolledUp = zeroUp.applyQuaternion(roll).normalize();
  const rolledRight = zeroRight.applyQuaternion(roll).normalize();
  const matrix = new THREE.Matrix4().makeBasis(forward, rolledUp, rolledRight);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function headingFromWorldVector(vector: THREE.Vector3) {
  return (Math.atan2(vector.x, -vector.z) * 180) / Math.PI;
}

function updateCompassOverlay(
  compassRing: HTMLDivElement | null,
  compassReadout: HTMLElement | null,
  camera: THREE.Camera
) {
  if (!compassRing) {
    return;
  }

  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);
  const flatForward = new THREE.Vector3(cameraForward.x, 0, cameraForward.z);
  const viewBearingDeg =
    flatForward.lengthSq() > 0.000001 ? normalizeHeadingDeg(headingFromWorldVector(flatForward.normalize())) : null;

  const screenNorth = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion.clone().invert());
  const northScreenAngleDeg =
    Math.hypot(screenNorth.x, screenNorth.y) > 0.000001
      ? (Math.atan2(screenNorth.x, screenNorth.y) * 180) / Math.PI
      : viewBearingDeg !== null
        ? -viewBearingDeg
        : 0;

  compassRing.style.setProperty("--compass-rotation", `${northScreenAngleDeg.toFixed(2)}deg`);
  compassRing.style.setProperty("--compass-label-rotation", `${(-northScreenAngleDeg).toFixed(2)}deg`);

  if (compassReadout) {
    compassReadout.textContent =
      viewBearingDeg === null ? "Top-down view" : `View ${String(Math.round(viewBearingDeg)).padStart(3, "0")} deg`;
  }
}

function normalizeHeadingDeg(value: number) {
  return ((value % 360) + 360) % 360;
}

function pitchFromWorldVector(vector: THREE.Vector3) {
  return (Math.asin(Math.min(Math.max(vector.y, -1), 1)) * 180) / Math.PI;
}

function finiteOr(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function applyCameraPreset(
  mode: CameraMode,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  aircraftPosition: THREE.Vector3,
  aircraftTangent: THREE.Vector3,
  fovOverrides: CameraFovOverrides,
  activeFlightId: FlightId
) {
  const preset = cameraPresetForActiveFlight(mode, activeFlightId);
  controls.enabled = preset.type === "orbit" || mode === "chase_locked";
  camera.fov = effectiveCameraFov(mode, fovOverrides);
  camera.up.set(0, 1, 0);

  if (mode === "chase_locked") {
    const chaseOffset = aircraftTangent.clone().multiplyScalar(-185).add(new THREE.Vector3(0, 46, 0));
    camera.position.copy(aircraftPosition).add(chaseOffset);
    controls.target.copy(getChaseTarget(aircraftPosition, aircraftTangent));
  } else {
    camera.position.copy(preset.position);
    controls.target.copy(preset.target);
  }

  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
}

function cameraPresetForActiveFlight(mode: CameraMode, activeFlightId: FlightId) {
  const base = cameraPresets[mode];
  const site = terminalSiteForFlight(activeFlightId);
  const center = siteWorldCenter(site.id);

  if (mode === "top_down") {
    const altitude = site.id === "wtc" ? 2100 : site.id === "shanksville" ? 1800 : 2200;
    return {
      ...base,
      position: center.clone().add(new THREE.Vector3(1, altitude, -2)),
      target: center.clone(),
      calibration: `${base.calibration} Active flight tab recenters this inspection view on ${site.shortLabel}.`
    };
  }

  if (mode === "wide_aerial" || mode === "free_orbit") {
    const offset =
      site.id === "wtc"
        ? new THREE.Vector3(-1040, 920, -1080)
        : site.id === "shanksville"
          ? new THREE.Vector3(-1180, 760, -980)
          : base.position.clone().sub(cameraPresets.free_orbit.target);
    const targetLift = site.id === "wtc" ? 180 : 45;
    return {
      ...base,
      position: center.clone().add(offset),
      target: center.clone().add(new THREE.Vector3(0, targetLift, 0)),
      calibration: `${base.calibration} Active flight tab recenters this view on ${site.shortLabel}.`
    };
  }

  if (mode === "ground_reference" && site.id !== "pentagon") {
    return {
      ...base,
      position: center.clone().add(new THREE.Vector3(-360, site.id === "wtc" ? 95 : 58, -300)),
      target: center.clone().add(new THREE.Vector3(0, site.id === "wtc" ? 160 : 12, 0)),
      calibration: `Active-flight site reference view centered on ${site.shortLabel}; not a source-matched camera.`
    };
  }

  return base;
}

function restoreCameraPoseOverride(mode: CameraMode, camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  const pose = useReplayStore.getState().cameraPoseOverrides[mode];
  if (!pose || !isCameraPosePersistable(mode)) {
    return;
  }

  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  controls.target.set(pose.target.x, pose.target.y, pose.target.z);
  camera.lookAt(controls.target);
}

function isCameraPosePersistable(mode: CameraMode) {
  return cameraPresets[mode].type === "orbit";
}

function cameraPoseSnapshot(camera: THREE.PerspectiveCamera, controls: OrbitControls): CameraPoseSnapshot {
  return {
    position: vectorSnapshot(camera.position),
    target: vectorSnapshot(controls.target)
  };
}

function vectorSnapshot(vector: THREE.Vector3) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}

function cameraPoseSnapshotsAreClose(first: CameraPoseSnapshot | undefined, second: CameraPoseSnapshot) {
  if (!first) {
    return false;
  }

  return (
    vectorSnapshotsAreClose(first.position, second.position) &&
    vectorSnapshotsAreClose(first.target, second.target)
  );
}

function vectorSnapshotsAreClose(
  first: CameraPoseSnapshot["position"],
  second: CameraPoseSnapshot["position"]
) {
  return (
    Math.abs(first.x - second.x) < 0.05 &&
    Math.abs(first.y - second.y) < 0.05 &&
    Math.abs(first.z - second.z) < 0.05
  );
}

function getChaseTarget(aircraftPosition: THREE.Vector3, aircraftTangent: THREE.Vector3) {
  return aircraftPosition.clone().add(aircraftTangent.clone().multiplyScalar(125));
}

function followChaseTarget(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  aircraftPosition: THREE.Vector3,
  aircraftTangent: THREE.Vector3,
  previousTarget: THREE.Vector3 | null
) {
  const nextTarget = getChaseTarget(aircraftPosition, aircraftTangent);
  if (previousTarget) {
    const targetDelta = nextTarget.clone().sub(previousTarget);
    camera.position.add(targetDelta);
    controls.target.add(targetDelta);
  } else {
    controls.target.copy(nextTarget);
  }

  return nextTarget;
}
