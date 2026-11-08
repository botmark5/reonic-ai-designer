"use client";
import { CameraControls, ContactShadows, Html } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BATTERY_MODULE, batteryModuleCount, buildEquipment } from "./equipmentGeometry";
import { ALLOWED, WALL_Z, ZONE_ORDER, ZONES, slotPosition, type InsideKey, type Placement, type Zone } from "./insideRules";
import type { Palette } from "./palette";
import { SETTLE, stepSpring, type SpringState } from "./spring";

export interface InsideProps {
  palette: Palette;
  reduced: boolean;
  keys: readonly InsideKey[];
  placement: Placement;
  /** Size text per part for the labels, e.g. "7 kWh". */
  sizes: Partial<Record<InsideKey, string | null>>;
  batteryKwh: number | null;
  /** The viewer let go of `key` at board x. */
  onDrop: (key: InsideKey, x: number) => void;
  onReady?: () => void;
}

const NAME: Record<InsideKey, string> = { battery: "Battery", inverter: "Inverter", heatpump: "Heat pump", wallbox: "Wallbox" };
const DOT: Record<InsideKey, string> = { battery: "bg-comp-battery", inverter: "bg-comp-pv", heatpump: "bg-comp-heatpump", wallbox: "bg-comp-wallbox" };
/** Height above the zone floor: wall-mounted parts hang, the others stand. */
const MOUNT_Y: Record<InsideKey, number> = { battery: 0, inverter: 1.25, heatpump: 0, wallbox: 1.05 };
const LIFT = 0.35; // while dragged
const WALL_H = 2.5;
const DEPTH = [-2.4, 2.2] as const; // board z range

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** The cutaway: a sunk basement, the garage, a piece of outside wall; matte model white like the house. */
function buildRoom(p: Palette) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: p.wall, roughness: 0.92 });
  const board = new THREE.MeshStandardMaterial({ color: p.board, roughness: 0.95 });
  const edge = new THREE.MeshStandardMaterial({ color: p.board, roughness: 0.95 });
  const paving = new THREE.MeshStandardMaterial({ color: p.paving, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: p.glass, roughness: 0.4 });
  const [z0, z1] = DEPTH;
  const depth = z1 - z0;
  const b = ZONES.basement;
  const bottom = b.floorY - 0.4;
  // ground block with the basement pit cut out (open to the front: a section)
  g.add(box(ZONES.outside.x1 + 0.4 - (b.x1), -bottom, depth, edge, (b.x1 + ZONES.outside.x1 + 0.4) / 2, bottom / 2, (z0 + z1) / 2, false));
  g.add(box(0.4, -bottom, depth, edge, b.x0 - 0.2, bottom / 2, (z0 + z1) / 2, false));
  g.add(box(b.x1 - b.x0, 0.4, depth, edge, (b.x0 + b.x1) / 2, bottom + 0.2, (z0 + z1) / 2, false));
  g.add(box(b.x1 - b.x0, -b.floorY, WALL_Z - z0, edge, (b.x0 + b.x1) / 2, b.floorY / 2, (z0 + WALL_Z) / 2, false));
  // floors: board white indoors, paving outside
  g.add(box(b.x1 - b.x0, 0.02, z1 - WALL_Z, board, (b.x0 + b.x1) / 2, b.floorY + 0.01, (WALL_Z + z1) / 2, false));
  g.add(box(ZONES.outside.x0 - b.x1, 0.02, depth, board, (b.x1 + ZONES.outside.x0) / 2, 0.01, (z0 + z1) / 2, false));
  g.add(box(ZONES.outside.x1 + 0.4 - ZONES.outside.x0, 0.02, depth, paving, (ZONES.outside.x0 + ZONES.outside.x1 + 0.4) / 2, 0.012, (z0 + z1) / 2, false));
  // back wall across basement and garage; a thicker facade outside with a window
  const backX0 = b.x0 - 0.4;
  const backX1 = ZONES.garage.x1 + 0.3;
  g.add(box(backX1 - backX0, WALL_H, 0.3, wall, (backX0 + backX1) / 2, WALL_H / 2, WALL_Z - 0.15));
  g.add(box(ZONES.outside.x1 + 0.4 - backX1, WALL_H + 0.6, 0.4, wall, (backX1 + ZONES.outside.x1 + 0.4) / 2, (WALL_H + 0.6) / 2, WALL_Z - 0.2));
  g.add(box(0.9, 0.9, 0.05, glass, 4.6, 2.2, WALL_Z + 0.01, false));
  // dividers: basement | garage (half height, so the room reads as a section) and garage | outside
  g.add(box(0.3, WALL_H, 2.6, wall, (b.x1 + ZONES.garage.x0) / 2, WALL_H / 2, WALL_Z + 1.3));
  g.add(box(0.3, WALL_H, 2.6, wall, (ZONES.garage.x1 + ZONES.outside.x0) / 2, WALL_H / 2, WALL_Z + 1.3));
  return g;
}

function dispose(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}

function buildBattery(p: Palette, modules: number) {
  const g = new THREE.Group();
  const housing = new THREE.MeshStandardMaterial({ color: p.appliance, roughness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: p.battery, roughness: 0.4 });
  const { w, h, d } = BATTERY_MODULE;
  g.add(box(w + 0.04, 0.08, d + 0.04, housing, 0, 0.04, d / 2 + 0.02));
  for (let i = 0; i < Math.max(1, modules); i++) {
    g.add(box(w, h - 0.012, d, housing, 0, 0.08 + i * h + h / 2, d / 2 + 0.02));
    g.add(box(w - 0.06, 0.012, 0.006, accent, 0, 0.08 + i * h + 0.03, d + 0.025, false));
  }
  return g;
}

function fade(m: THREE.Material, to: number, dt: number) {
  m.opacity += (to - m.opacity) * (1 - Math.exp(-12 * Math.min(dt, 0.1)));
}

function setEnabled(c: React.RefObject<CameraControls | null>, on: boolean) {
  if (c.current) c.current.enabled = on;
}

/** Zone floors light up while a part is dragged: allowed zones in the part's colour, the others stay plain. */
function ZoneTint({ zone, active, colour }: { zone: Zone; active: boolean; colour: string }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, depthWrite: false }), [colour]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => fade(mat, active ? 0.22 : 0, dt));
  const z = ZONES[zone];
  return (
    <mesh material={mat} position={[(z.x0 + z.x1) / 2, z.floorY + 0.03, (WALL_Z + DEPTH[1]) / 2]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[z.x1 - z.x0, DEPTH[1] - WALL_Z]} />
    </mesh>
  );
}

const PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const HIT = new THREE.Vector3();

/** One part: springs to its slot, follows the pointer along the wall while dragged. */
function Item({ k, object, placement, size, reduced, settled, onGrab, onDrop, controls }: {
  k: InsideKey; object: THREE.Object3D; placement: Placement; size: string | null | undefined; reduced: boolean; settled: boolean;
  onGrab: (k: InsideKey | null) => void; onDrop: (k: InsideKey, x: number) => void;
  controls: React.RefObject<CameraControls | null>;
}) {
  const ref = useRef<THREE.Group>(null);
  const spot = placement[k];
  const home = useMemo(() => (spot ? slotPosition(spot.zone, spot.slot) : null), [spot]);
  const x = useRef<SpringState | null>(null);
  const y = useRef<SpringState | null>(null);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !home) return;
    const tx = drag.current ? drag.current.x : home[0];
    const ty = home[1] + MOUNT_Y[k] + (drag.current ? LIFT : 0);
    if (!x.current || !y.current) { x.current = { x: tx, v: 0 }; y.current = { x: ty, v: 0 }; }
    if (reduced || drag.current) { x.current.x = tx; x.current.v = 0; }
    else stepSpring(x.current, tx, dt, SETTLE);
    if (reduced) { y.current.x = ty; y.current.v = 0; } else stepSpring(y.current, ty, dt, SETTLE);
    // over the basement the part sinks with the floor while dragged
    g.position.set(x.current.x, y.current.x, WALL_Z + 0.02);
  });

  if (!home) return null;
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture?.(e.pointerId);
    e.ray.intersectPlane(PLANE, HIT);
    drag.current = { x: ref.current?.position.x ?? home[0], dx: (ref.current?.position.x ?? home[0]) - HIT.x };
    setEnabled(controls, false);
    setDragging(true);
    onGrab(k);
    document.body.style.cursor = "grabbing";
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    if (e.ray.intersectPlane(PLANE, HIT)) drag.current.x = Math.min(ZONES.outside.x1, Math.max(ZONES.basement.x0, HIT.x + drag.current.dx));
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
    const at = drag.current.x;
    drag.current = null;
    setEnabled(controls, true);
    setDragging(false);
    onGrab(null);
    document.body.style.cursor = "";
    onDrop(k, at);
  };

  return (
    <group
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerOver={() => { if (!drag.current) document.body.style.cursor = "grab"; }}
      onPointerOut={() => { if (!drag.current) document.body.style.cursor = ""; }}
    >
      <primitive object={object} />
      {/* label on the floor in front of the part, so neighbours on the same wall never collide */}
      {settled && (
        <Html position={[0, -MOUNT_Y[k] + 0.02, 1.0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className={`hidden w-max flex-col items-center rounded-md sm:flex border border-border bg-surface-1/95 px-2 py-1 text-ink shadow-[0_6px_18px_rgba(16,17,20,0.12)] transition-transform duration-150 ${dragging ? "scale-105" : ""}`}>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-4">
              <span aria-hidden className={`size-2 rounded-full ${DOT[k]}`} />
              {NAME[k]}
            </span>
            {size && <span className="font-mono text-[12px] leading-4 tabular-nums text-ink-body">{size}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

const COLOUR = (p: Palette): Record<InsideKey, string> => ({ battery: p.battery, inverter: p.pv, heatpump: p.heatpump, wallbox: p.wallbox });

export default function Inside({ palette, reduced, keys, placement, sizes, batteryKwh, onDrop, onReady }: InsideProps) {
  const room = useMemo(() => buildRoom(palette), [palette]);
  useEffect(() => () => dispose(room), [room]);
  const equipment = useMemo(() => buildEquipment(palette), [palette]);
  useEffect(() => () => Object.values(equipment).forEach(dispose), [equipment]);
  const modules = batteryModuleCount(batteryKwh);
  const battery = useMemo(() => buildBattery(palette, modules), [palette, modules]);
  useEffect(() => () => dispose(battery), [battery]);
  const objects: Record<InsideKey, THREE.Object3D> = { battery, inverter: equipment.inverter, heatpump: equipment.heatpump, wallbox: equipment.wallbox };
  const [grabbed, setGrabbed] = useState<InsideKey | null>(null);
  // drei's Html mounted in the very first commit can lose its root; mount labels a frame later
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  const controls = useRef<CameraControls>(null);
  const colours = COLOUR(palette);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 30, near: 0.5, far: 120, position: [1.6, 9.5, 17.5] }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; onReady?.(); }}
      style={{ touchAction: "pan-y" }}
    >
      <hemisphereLight args={["#ffffff", palette.groundBounce, 1.7]} />
      <directionalLight position={[-5, 12, 10]} intensity={1.6} color="#fffaf2" castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-bias={-0.0004} />
      <primitive object={room} />
      {ZONE_ORDER.map((z) => (
        <ZoneTint key={z} zone={z} active={!!grabbed && ALLOWED[grabbed].includes(z)} colour={grabbed ? colours[grabbed] : palette.border} />
      ))}
      {/* drei's first Html in a canvas can lose its root under React 19: a placeholder takes that hit */}
      {settled && <Html position={[0, -50, 0]} style={{ display: "none" }}><span /></Html>}
      {settled && ZONE_ORDER.map((z) => (
        <Html key={z} position={[(ZONES[z].x0 + ZONES[z].x1) / 2, ZONES[z].floorY + 0.05, DEPTH[1] - 0.3]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap text-[13px] font-medium uppercase tracking-[0.08em] text-ink-muted">{ZONES[z].label}</span>
        </Html>
      ))}
      {keys.map((k) => (
        <Item key={k} k={k} object={objects[k]} placement={placement} size={sizes[k]} reduced={reduced} settled={settled} onGrab={setGrabbed} onDrop={onDrop} controls={controls} />
      ))}
      <ContactShadows position={[0, 0.02, 0]} scale={16} resolution={512} blur={2.4} far={4} opacity={0.3} frames={reduced ? 1 : Infinity} color="#1b1d20" />
      <CameraControls
        ref={controls}
        makeDefault
        minDistance={12}
        maxDistance={28}
        minPolarAngle={0.5}
        maxPolarAngle={1.25}
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.7}
        truckSpeed={0}
      />
      <LookAt controls={controls} />
    </Canvas>
  );
}

function LookAt({ controls }: { controls: React.RefObject<CameraControls | null> }) {
  useEffect(() => { void controls.current?.setLookAt(1.6, 9.5, 17.5, 0.2, -0.2, -0.2, false); }, [controls]);
  return null;
}
