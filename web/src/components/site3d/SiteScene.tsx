"use client";
import { CameraControls, Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin, GoogleCloudAuthPlugin, ReorientationPlugin, TileCompressionPlugin, TilesFadePlugin,
} from "3d-tiles-renderer/plugins";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { LAND, stepSpring, type SpringState } from "../house3d/spring";
import { dropOrder, panelPose, quantile, segmentHeights, toScene, type PanelPose, type Placement, type SunFrame } from "./geo";

const DRACO = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
/** Germany's geoid sits ≈ 36–50 m above the ellipsoid; Google gives roof heights above sea level. A first guess only: rays refine it. */
const GEOID_M = 47;
/** How far the measured geoid offset may stray from the first guess (it is 36–50 m across Germany). */
const PLAUSIBLE_M = 60;
const LIFT = 0.35; // panel above the plane: photogrammetry roofs are lumpy, a panel sunk into one reads as broken
const DROP = 2.2;
const ROW_STAGGER = 0.07;
const VIEW = new THREE.Vector3(30, 52, 42); // camera offset from the roof: south-east, high enough to clear garden trees

export interface SiteSceneProps {
  apiKey: string;
  placement: Placement;
  /** Annual sunshine image to drape on every roof (d-voice /api/solar/layers), and whether it shows. */
  sun: { image: string; frame: SunFrame } | null;
  sunOn: boolean;
  /** New panels are on stage (the /live reveal). */
  panelsOn: boolean;
  reduced: boolean;
  /** Projector label above the roof, e.g. "9.45 kWp". null hides it. */
  pvLabel: string | null;
  onFirstTiles: () => void;
  onError: (reason: string) => void;
  onAttribution: (text: string) => void;
}

interface Heights { roof: number; segments: Map<number, number> }

type SunUniforms = Record<"uSunMap" | "uSunAmt" | "uSunC" | "uSunR" | "uSunU" | "uSunS", THREE.IUniform>;

/**
 * Drapes the sun map on whatever the tiles show: each tile material maps its world x/z into the image. Off the
 * image or on transparent pixels (off-roof) the photo stays as it is. Mixed after the colour-space conversion,
 * so the PNG's sRGB colours go in unchanged.
 */
function patchSun(root: THREE.Object3D, u: SunUniforms) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m.userData.sunMap) continue;
      m.userData.sunMap = true;
      m.customProgramCacheKey = () => "sunmap";
      const prev = m.onBeforeCompile.bind(m); // the fade plugin chains too: keep whatever ran before
      m.onBeforeCompile = (sh, r) => {
        prev(sh, r);
        Object.assign(sh.uniforms, u);
        sh.vertexShader = "varying vec3 vSunW;\n" + sh.vertexShader.replace(
          "#include <project_vertex>",
          "#include <project_vertex>\n  vSunW = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
        sh.fragmentShader = "uniform sampler2D uSunMap;\nuniform float uSunAmt;\nuniform vec2 uSunC, uSunR, uSunU, uSunS;\nvarying vec3 vSunW;\n" +
          sh.fragmentShader.replace("#include <dithering_fragment>", `
  if (uSunAmt > 0.001) {
    vec2 dSun = vSunW.xz - uSunC;
    vec2 sUv = vec2(0.5) + vec2(dot(dSun, uSunR), dot(dSun, uSunU)) / uSunS;
    if (all(greaterThanEqual(sUv, vec2(0.0))) && all(lessThanEqual(sUv, vec2(1.0)))) {
      vec4 sCol = texture2D(uSunMap, sUv);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, sCol.rgb, sCol.a * uSunAmt * 0.85);
    }
  }
  #include <dithering_fragment>`);
      };
      m.needsUpdate = true;
    }
  });
}

function Tiles({ apiKey, placement, sunUniforms, onFirstTiles, onError, onAttribution, onHeights }: Omit<SiteSceneProps, "panelsOn" | "reduced" | "pvLabel" | "sun" | "sunOn"> & {
  sunUniforms: RefObject<SunUniforms>;
  onHeights: (h: Heights) => void;
}) {
  const { camera, gl } = useThree();
  const { lat, lng } = placement.center;
  const tiles = useMemo(() => {
    const t = new TilesRenderer();
    t.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
    t.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: new DRACOLoader().setDecoderPath(DRACO) }));
    t.registerPlugin(new TileCompressionPlugin());
    t.registerPlugin(new TilesFadePlugin());
    t.registerPlugin(new ReorientationPlugin({ lat: THREE.MathUtils.degToRad(lat), lon: THREE.MathUtils.degToRad(lng), height: 0, recenter: true }));
    return t;
  }, [apiKey, lat, lng]);

  const cb = useRef({ onFirstTiles, onError, onAttribution, onHeights });
  useEffect(() => { cb.current = { onFirstTiles, onError, onAttribution, onHeights }; });

  useEffect(() => {
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, gl);
    let first = false;
    let timer = 0;
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const hitY = (x: number, z: number) => {
      ray.set(new THREE.Vector3(x, 9000, z), down);
      const hit = ray.intersectObject(tiles.group, true)[0];
      return hit ? hit.point.y : Number.NaN;
    };
    const around = (x: number, z: number) => quantile([0, 0.8, -0.8].flatMap((dx) => [0, 0.8, -0.8].map((dz) => hitY(x + dx, z + dz))), 0.25);
    // rays straight down onto the photogrammetry calibrate Google's plane heights; refined as finer tiles arrive
    const measure = () => {
      const hits = new Map<number, number>();
      for (const s of placement.segments) {
        const [x, z] = toScene(s.center.x_m, s.center.y_m);
        const y = around(x, z);
        if (y !== null) hits.set(s.index, y);
      }
      if (!hits.size) return;
      const { offset, heights } = segmentHeights(placement.segments, hits, GEOID_M);
      // coarse tiles are chords far below the real surface: wait for detail before trusting the rays
      if (Math.abs(offset - GEOID_M) > PLAUSIBLE_M) return;
      const ys = [...heights.values()];
      cb.current.onHeights({ roof: Math.max(...ys), segments: heights });
    };
    const onModel = (e: { scene?: THREE.Object3D }) => {
      if (e.scene) patchSun(e.scene, sunUniforms.current);
      if (!first) { first = true; cb.current.onFirstTiles(); }
    };
    patchSun(tiles.group, sunUniforms.current);
    const onEnd = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
      const text = tiles.getAttributions().filter((a) => a.type === "string").map((a) => String(a.value)).join(" · ");
      cb.current.onAttribution(text);
    };
    const onFail = (e: { error?: unknown }) => {
      if (!first) cb.current.onError(`tiles: ${e.error instanceof Error ? e.error.message : "load error"}`);
    };
    tiles.addEventListener("load-model", onModel);
    tiles.addEventListener("tiles-load-end", onEnd);
    tiles.addEventListener("load-error", onFail);
    return () => {
      window.clearTimeout(timer);
      tiles.removeEventListener("load-model", onModel);
      tiles.removeEventListener("tiles-load-end", onEnd);
      tiles.removeEventListener("load-error", onFail);
      tiles.dispose();
    };
  }, [tiles, camera, gl, placement, sunUniforms]);

  useFrame(() => {
    tiles.setResolutionFromRenderer(camera, gl);
    camera.updateMatrixWorld();
    tiles.update();
  });

  return <primitive object={tiles.group} />;
}

interface Drop { s: SpringState; wait: number }

/** The engine's panels on the real roof: dark glass on a thin light frame, dropping in row by row from the eave up. */
function RoofPanels({ placement, heights, on, reduced }: { placement: Placement; heights: Heights; on: boolean; reduced: boolean }) {
  const glass = useRef<THREE.InstancedMesh>(null);
  const rim = useRef<THREE.InstancedMesh>(null);
  const poses = useMemo<PanelPose[]>(() => placement.panels.map((p) => {
    const seg = placement.segments.find((s) => s.index === p.segment_index);
    const y = heights.segments.get(p.segment_index) ?? heights.roof;
    return seg
      ? panelPose(p, seg, y, placement.panel_size)
      : { ...panelPose(p, { pitch_deg: 0, azimuth_deg: 180, center: { lat: 0, lng: 0, x_m: p.x_m, y_m: p.y_m } }, y, placement.panel_size) };
  }), [placement, heights]);
  const order = useMemo(() => dropOrder(poses, placement.panels.map((p) => p.segment_index)), [poses, placement.panels]);
  const drops = useRef<Drop[]>([]);
  const target = on ? 0 : 1;

  // (re)stage the drop when the set of panels changes or they come on stage
  useEffect(() => {
    const rank = new Map(order.map((i, r) => [i, r]));
    drops.current = poses.map((_, i) => ({
      s: { x: reduced ? target : 1, v: 0 },
      wait: reduced ? 0 : Math.floor((rank.get(i) ?? 0) / 4) * ROW_STAGGER * 2,
    }));
  }, [placement, order, poses.length, reduced, on, target]); // eslint-disable-line react-hooks/exhaustive-deps -- re-stage on new placements, not on height refinements

  const { glassGeo, rimGeo, glassMat, rimMat } = useMemo(() => ({
    glassGeo: new THREE.BoxGeometry(1, 0.035, 1),
    rimGeo: new THREE.BoxGeometry(1, 0.03, 1),
    glassMat: new THREE.MeshPhysicalMaterial({ color: "#1e2633", roughness: 0.3, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.1 }),
    rimMat: new THREE.MeshStandardMaterial({ color: "#d9dce1", roughness: 0.5, metalness: 0.4 }),
  }), []);
  useEffect(() => () => { glassGeo.dispose(); rimGeo.dispose(); glassMat.dispose(); rimMat.dispose(); }, [glassGeo, rimGeo, glassMat, rimMat]);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const g = glass.current;
    const r = rim.current;
    if (!g || !r) return;
    let n = 0;
    poses.forEach((p, i) => {
      const d = drops.current[i];
      if (!d) return;
      if (reduced) d.s.x = target;
      else if (d.wait > 0) d.wait -= dt;
      else stepSpring(d.s, target, dt, LAND);
      const up = d.s.x;
      if (up > 0.995 && target === 1) return;
      e.set(p.pitch, p.yaw, 0);
      q.setFromEuler(e);
      pos.set(p.x, p.y + LIFT + up * DROP, p.z);
      scl.set(p.across - 0.04, 1, p.along - 0.04);
      m4.compose(pos, q, scl);
      g.setMatrixAt(n, m4);
      pos.y -= 0.02;
      scl.set(p.across, 1, p.along);
      m4.compose(pos, q, scl);
      r.setMatrixAt(n, m4);
      n++;
    });
    g.count = n;
    r.count = n;
    g.instanceMatrix.needsUpdate = true;
    r.instanceMatrix.needsUpdate = true;
  });

  const max = Math.max(1, poses.length);
  return (
    <group>
      <instancedMesh key={`g${max}`} ref={glass} args={[glassGeo, glassMat, max]} frustumCulled={false} />
      <instancedMesh key={`r${max}`} ref={rim} args={[rimGeo, rimMat, max]} frustumCulled={false} />
    </group>
  );
}

/** Camera: starts at a first guess of the roof height, then glides to the measured roof. */
function Rig({ target }: { target: THREE.Vector3 }) {
  const ref = useRef<CameraControls>(null);
  const placed = useRef(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const p = target.clone().add(VIEW);
    void c.setLookAt(p.x, p.y, p.z, target.x, target.y, target.z, placed.current);
    placed.current = true;
  }, [target]);
  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={18}
      maxDistance={220}
      minPolarAngle={0.2}
      maxPolarAngle={1.3}
      smoothTime={0.6}
      draggingSmoothTime={0.12}
    />
  );
}

function setSun(u: SunUniforms, tex: THREE.Texture | null, f: SunFrame | null) {
  u.uSunMap.value = tex;
  if (!f) return;
  (u.uSunC.value as THREE.Vector2).set(f.cx, f.cz);
  (u.uSunR.value as THREE.Vector2).set(f.right[0], f.right[1]);
  (u.uSunU.value as THREE.Vector2).set(f.up[0], f.up[1]);
  (u.uSunS.value as THREE.Vector2).set(f.w, f.h);
}

function fadeSun(u: SunUniforms, target: number, dt: number, reduced: boolean) {
  const cur = u.uSunAmt.value as number;
  u.uSunAmt.value = reduced ? target : cur + (target - cur) * (1 - Math.exp(-6 * Math.min(dt, 0.1)));
}

/** Loads the sun-map texture into the shared uniforms and fades it in and out. */
function SunMap({ sun, on, reduced, uniforms }: { sun: SiteSceneProps["sun"]; on: boolean; reduced: boolean; uniforms: RefObject<SunUniforms> }) {
  useEffect(() => {
    if (!sun) return;
    const tex = new THREE.TextureLoader().load(sun.image);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const u = uniforms.current;
    setSun(u, tex, sun.frame);
    return () => { setSun(u, null, null); tex.dispose(); };
  }, [sun, uniforms]);
  useFrame((_, dt) => fadeSun(uniforms.current, on && sun ? 1 : 0, dt, reduced));
  return null;
}

export default function SiteScene({ apiKey, placement, sun, sunOn, panelsOn, reduced, pvLabel, onFirstTiles, onError, onAttribution }: SiteSceneProps) {
  const sunUniforms = useRef<SunUniforms>({
    uSunMap: { value: null }, uSunAmt: { value: 0 },
    uSunC: { value: new THREE.Vector2() }, uSunR: { value: new THREE.Vector2(1, 0) },
    uSunU: { value: new THREE.Vector2(0, -1) }, uSunS: { value: new THREE.Vector2(60, 60) },
  });
  const guess = useMemo(() => {
    const h = placement.segments.map((s) => s.plane_height_m).find((v): v is number => typeof v === "number" && Number.isFinite(v));
    return new THREE.Vector3(0, (h ?? 500) + GEOID_M, 0);
  }, [placement]);
  const [heights, setHeights] = useState<Heights | null>(null);
  const target = useMemo(() => (heights ? new THREE.Vector3(0, heights.roof, 0) : guess), [heights, guess]);
  const onHeights = (h: Heights) => {
    // ignore tiny refinements: they would only jitter the camera
    setHeights((prev) => (prev && Math.abs(prev.roof - h.roof) < 0.3 && prev.segments.size === h.segments.size ? prev : h));
  };

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 30, near: 1, far: 20000, position: guess.clone().add(VIEW).toArray() }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; }}
      style={{ touchAction: "pan-y" }}
    >
      <hemisphereLight args={["#ffffff", "#d8d2c8", 1.1]} />
      <directionalLight position={[-30, 60, 40]} intensity={2.2} color="#fff1dc" />
      <SunMap sun={sun} on={sunOn} reduced={reduced} uniforms={sunUniforms} />
      <Tiles apiKey={apiKey} placement={placement} sunUniforms={sunUniforms} onFirstTiles={onFirstTiles} onError={onError} onAttribution={onAttribution} onHeights={onHeights} />
      {heights && <RoofPanels placement={placement} heights={heights} on={panelsOn} reduced={reduced} />}
      {heights && pvLabel && panelsOn && (
        <Html position={[0, heights.roof + 4.5, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div aria-hidden className="flex w-max items-center gap-2 rounded-full border border-border bg-surface-1/95 py-1.5 pl-2.5 pr-3.5 text-ink shadow-[0_8px_24px_rgba(16,17,20,0.16)] backdrop-blur-sm">
            <span className="size-2.5 rounded-full bg-comp-pv" />
            <span className="text-base font-semibold">Solar</span>
            <span className="font-mono text-base font-medium tabular-nums text-ink-body">{pvLabel}</span>
          </div>
        </Html>
      )}
      <Rig target={target} />
    </Canvas>
  );
}
