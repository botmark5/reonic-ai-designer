/**
 * A detached German family house, built from simple three.js primitives (no Blender available):
 * two storeys, gable roof with concrete-tile banding, attached garage with a shallow mono-pitch roof,
 * driveway, a couple of trees. World axes: y up, +z south, +x east. The main roof plane faces +z.
 */
import * as THREE from "three";
import type { RoofPlane } from "./layout";
import type { Palette } from "./palette";

export const HOUSE = {
  length: 12, // along x (ridge direction)
  depth: 9, // along z
  eaveHeight: 5.6,
  eaveOverhang: 0.5,
  gableOverhang: 0.5,
  roofThickness: 0.22,
  garage: { width: 4, depth: 6.5, height: 2.9, pitchDeg: 8, overhang: 0.3 },
} as const;

const GARAGE_X0 = HOUSE.length / 2; // west wall of the garage = east wall of the house
const GARAGE_CX = GARAGE_X0 + HOUSE.garage.width / 2;
const FRONT_Z = HOUSE.depth / 2; // south facade

export interface PlaneFrame {
  plane: RoofPlane;
  /** Centre of the eave line on the roof's top surface. */
  origin: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface Mount {
  position: THREE.Vector3;
  /** Rotation about y so the item's local +z faces away from its wall. */
  yaw: number;
}

export interface Anchors {
  inverter: Mount;
  battery: Mount;
  wallbox: Mount;
  car: Mount;
  heatpump: Mount;
  /** Where energy enters the house (flow endpoint). */
  house: THREE.Vector3;
  sun: THREE.Vector3;
}

export interface BuiltHouse {
  group: THREE.Group;
  frames: { main: PlaneFrame; garage: PlaneFrame };
  anchors: Anchors;
}

const rad = (d: number) => (d * Math.PI) / 180;

export function roofPlanes(pitchDeg: number): RoofPlane[] {
  const g = HOUSE.garage;
  return [
    {
      id: "main",
      width: HOUSE.length + 2 * HOUSE.gableOverhang,
      slope: (HOUSE.depth / 2 + HOUSE.eaveOverhang) / Math.cos(rad(pitchDeg)),
      margin: { side: 0.45, eave: 0.35, ridge: 0.3 },
    },
    {
      id: "garage",
      width: g.width + 2 * g.overhang,
      slope: (g.depth + 2 * g.overhang) / Math.cos(rad(g.pitchDeg)),
      margin: { side: 0.45, eave: 0.3, ridge: 0.45 },
    },
  ];
}

export function slotToWorld(frame: PlaneFrame, u: number, v: number, lift = 0): THREE.Vector3 {
  return frame.origin.clone()
    .addScaledVector(frame.uAxis, u)
    .addScaledVector(frame.vAxis, v)
    .addScaledVector(frame.normal, lift);
}

export function countTriangles(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    n += tris * inst;
  });
  return n;
}

/** Plane frame for a roof sloping up from an eave at z = eaveZ towards -sign·z... sign=+1 faces south. */
function frameFor(plane: RoofPlane, sign: 1 | -1, pitchDeg: number, eave: THREE.Vector3): PlaneFrame {
  const s = Math.sin(rad(pitchDeg));
  const c = Math.cos(rad(pitchDeg));
  return {
    plane,
    origin: eave,
    uAxis: new THREE.Vector3(sign, 0, 0),
    vAxis: new THREE.Vector3(0, s, -sign * c),
    normal: new THREE.Vector3(0, c, sign * s),
  };
}

// ---------- small builders ----------

type Mats = ReturnType<typeof materials>;

function materials(p: Palette) {
  const std = (color: string, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    wall: std(p.wall),
    plinth: std(p.plinth),
    roof: std(p.roof, 0.85),
    roofEdge: std(p.roofEdge, 0.8),
    trim: std(p.trim, 0.6),
    glass: std(p.glass, 0.25, 0.1),
    door: std(p.door, 0.7),
    ground: std(p.ground, 1),
    paving: std(p.paving, 1),
    trunk: std("#8b6f56", 1),
    leaves: std(p.ground === "#e3e8dc" ? "#9fb38c" : "#4d5e45", 1),
    garageDoor: std(p.plinth, 0.6),
  };
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** A box laid on a roof plane: x along u, y along the normal (thickness), z along -v. */
function onPlane(frame: PlaneFrame, w: number, t: number, len: number, u: number, v: number, lift: number, mat: THREE.Material) {
  const m = mesh(new THREE.BoxGeometry(w, t, len), mat);
  const back = frame.vAxis.clone().negate();
  m.applyMatrix4(new THREE.Matrix4().makeBasis(frame.uAxis, frame.normal, back).setPosition(slotToWorld(frame, u, v, lift)));
  return m;
}

/** A window on a wall: `face` is the outward normal axis. */
function windowAt(g: THREE.Group, m: Mats, face: "s" | "n" | "e" | "w", along: number, y: number, w: number, h: number) {
  const t = 0.08;
  const out = 0.02;
  const pos = (offset: number) => {
    switch (face) {
      case "s": return new THREE.Vector3(along, y, FRONT_Z + offset);
      case "n": return new THREE.Vector3(along, y, -FRONT_Z - offset);
      case "e": return new THREE.Vector3(HOUSE.length / 2 + offset, y, along);
      case "w": return new THREE.Vector3(-HOUSE.length / 2 - offset, y, along);
    }
  };
  const yaw = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, offset: number, dy = 0) => {
    const mm = mesh(geo, mat, false, true);
    mm.position.copy(pos(offset)).add(new THREE.Vector3(0, dy, 0));
    mm.rotation.y = yaw;
    g.add(mm);
  };
  add(new THREE.BoxGeometry(w + 0.14, h + 0.14, t), m.trim, out);
  add(new THREE.BoxGeometry(w, h, t), m.glass, out + 0.015);
  add(new THREE.BoxGeometry(0.06, h, t), m.trim, out + 0.03); // mullion
  add(new THREE.BoxGeometry(w + 0.3, 0.06, 0.18), m.plinth, out + 0.06, -h / 2 - 0.1); // sill
}

function tree(g: THREE.Group, m: Mats, x: number, z: number, s: number) {
  const trunk = mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.6 * s, 6), m.trunk);
  trunk.position.set(x, 0.8 * s, z);
  const crown = mesh(new THREE.IcosahedronGeometry(1.5 * s, 1), m.leaves);
  crown.position.set(x, 2.6 * s, z);
  crown.scale.set(1, 1.15, 1);
  g.add(trunk, crown);
}

// ---------- the house ----------

export function buildHouse(pitchDeg: number, palette: Palette): BuiltHouse {
  const m = materials(palette);
  const g = new THREE.Group();
  g.name = "house";
  const { length: L, depth: D, eaveHeight: H, eaveOverhang: oh } = HOUSE;
  const tanP = Math.tan(rad(pitchDeg));
  const ridgeH = H + (D / 2) * tanP;
  const [mainPlane, garagePlane] = roofPlanes(pitchDeg);

  // Ground, lawn and paving
  const ground = mesh(new THREE.CircleGeometry(34, 48), m.ground, false, true);
  ground.rotation.x = -Math.PI / 2;
  g.add(ground);
  const drive = mesh(new THREE.BoxGeometry(HOUSE.garage.width + 0.6, 0.04, 9), m.paving, false, true);
  drive.position.set(GARAGE_CX, 0.02, FRONT_Z + 4.5);
  const path = mesh(new THREE.BoxGeometry(1.4, 0.04, 6), m.paving, false, true);
  path.position.set(1.2, 0.02, FRONT_Z + 3);
  const terrace = mesh(new THREE.BoxGeometry(5.5, 0.06, 3), m.paving, false, true);
  terrace.position.set(-3.2, 0.03, FRONT_Z + 1.5);
  g.add(drive, path, terrace);

  // Walls: pentagon cross-section extruded along x
  const section = new THREE.Shape();
  section.moveTo(-D / 2, 0);
  section.lineTo(D / 2, 0);
  section.lineTo(D / 2, H);
  section.lineTo(0, ridgeH - 0.18);
  section.lineTo(-D / 2, H);
  section.closePath();
  const wallsGeo = new THREE.ExtrudeGeometry(section, { depth: L, bevelEnabled: false });
  wallsGeo.rotateY(Math.PI / 2); // local z → world x, local x → world -z (symmetric section)
  wallsGeo.translate(-L / 2, 0, 0);
  g.add(mesh(wallsGeo, m.wall));
  g.add(box(L + 0.06, 0.45, D + 0.06, m.plinth, 0, 0.225, 0));

  // Roof planes
  const mainFrame = frameFor(mainPlane, 1, pitchDeg, new THREE.Vector3(0, H - oh * tanP, D / 2 + oh));
  const northFrame = frameFor({ ...mainPlane }, -1, pitchDeg, new THREE.Vector3(0, H - oh * tanP, -D / 2 - oh));
  for (const f of [mainFrame, northFrame]) {
    const slope = f.plane.slope;
    g.add(onPlane(f, f.plane.width, HOUSE.roofThickness, slope, 0, slope / 2, -HOUSE.roofThickness / 2, m.roof));
    // concrete-tile banding
    for (let v = 0.32; v < slope - 0.1; v += 0.34) g.add(onPlane(f, f.plane.width, 0.03, 0.05, 0, v, 0.012, m.roofEdge));
    // eave fascia
    g.add(onPlane(f, f.plane.width + 0.04, 0.3, 0.06, 0, 0.03, -0.12, m.roofEdge));
    // verge boards along the gable edges
    for (const side of [-1, 1]) g.add(onPlane(f, 0.08, 0.32, slope, side * (f.plane.width / 2), slope / 2, -0.05, m.roofEdge));
  }
  g.add(box(mainPlane.width + 0.04, 0.16, 0.36, m.roofEdge, 0, ridgeH + 0.02, 0)); // ridge cap

  // Chimney on the north plane (keeps the south plane free for panels)
  g.add(box(0.6, 2.4, 0.6, m.plinth, -2.6, ridgeH - 0.6, -1.6));
  g.add(box(0.72, 0.1, 0.72, m.roofEdge, -2.6, ridgeH + 0.65, -1.6));

  // South facade: door, windows (ground floor, upper floor)
  g.add(box(1.1, 2.15, 0.1, m.door, 1.2, 1.08 + 0.45, FRONT_Z + 0.03));
  g.add(box(1.4, 0.08, 0.9, m.trim, 1.2, 2.75, FRONT_Z + 0.45)); // canopy
  for (const x of [-4.4, -2.0]) windowAt(g, m, "s", x, 1.75, 1.5, 1.4);
  windowAt(g, m, "s", 3.6, 1.75, 1.0, 1.2);
  for (const x of [-4.4, -1.6, 1.2, 3.8]) windowAt(g, m, "s", x, 4.15, 1.1, 1.25);
  // Gables and north
  for (const z of [-2, 2]) {
    windowAt(g, m, "w", z, 1.75, 1.1, 1.3);
    windowAt(g, m, "w", z, 4.15, 1.0, 1.2);
    windowAt(g, m, "e", z, 4.15, 1.0, 1.2);
  }
  windowAt(g, m, "w", 0, H + 1.0, 0.7, 0.8);
  windowAt(g, m, "e", 0, H + 1.0, 0.7, 0.8);
  for (const x of [-3.5, 0, 3.5]) windowAt(g, m, "n", x, 4.15, 1.0, 1.2);

  // Garage: trapezoid section (higher at the back) extruded along x
  const G = HOUSE.garage;
  const gTan = Math.tan(rad(G.pitchDeg));
  const gBackZ = FRONT_Z - G.depth;
  const gs = new THREE.Shape();
  gs.moveTo(-gBackZ, 0); // shape x = -world z
  gs.lineTo(-FRONT_Z, 0);
  gs.lineTo(-FRONT_Z, G.height);
  gs.lineTo(-gBackZ, G.height + G.depth * gTan);
  gs.closePath();
  const gGeo = new THREE.ExtrudeGeometry(gs, { depth: G.width, bevelEnabled: false });
  gGeo.rotateY(Math.PI / 2);
  gGeo.translate(GARAGE_X0, 0, 0);
  g.add(mesh(gGeo, m.wall));
  g.add(box(G.width + 0.04, 0.45, G.depth + 0.04, m.plinth, GARAGE_CX, 0.225, FRONT_Z - G.depth / 2));
  const garageFrame = frameFor(garagePlane, 1, G.pitchDeg, new THREE.Vector3(GARAGE_CX, G.height - G.overhang * gTan, FRONT_Z + G.overhang));
  g.add(onPlane(garageFrame, garagePlane.width, 0.2, garagePlane.slope, 0, garagePlane.slope / 2, -0.1, m.roofEdge));
  g.add(onPlane(garageFrame, garagePlane.width + 0.04, 0.26, 0.06, 0, 0.03, -0.1, m.roofEdge));
  // Sectional garage door with grooves
  g.add(box(2.6, 2.2, 0.08, m.garageDoor, GARAGE_CX - 0.3, 1.1, FRONT_Z + 0.04));
  for (let y = 0.55; y < 2.2; y += 0.55) g.add(box(2.6, 0.03, 0.1, m.plinth, GARAGE_CX - 0.3, y, FRONT_Z + 0.05));

  // Garden
  tree(g, m, -10, -3, 1.2);
  tree(g, m, -9, 6.5, 0.9);
  tree(g, m, 3, -9.5, 1.1);
  g.add(box(0.5, 0.9, 7, m.leaves, -11.5, 0.45, 3)); // hedge

  const gEast = GARAGE_X0 + G.width;
  const anchors: Anchors = {
    inverter: { position: new THREE.Vector3(gEast + 0.01, 1.55, FRONT_Z - 1.0), yaw: Math.PI / 2 },
    battery: { position: new THREE.Vector3(gEast + 0.01, 0, FRONT_Z - 2.1), yaw: Math.PI / 2 },
    wallbox: { position: new THREE.Vector3(GARAGE_CX + 1.55, 1.25, FRONT_Z + 0.01), yaw: 0 },
    car: { position: new THREE.Vector3(GARAGE_CX, 0, FRONT_Z + 4.0), yaw: Math.PI },
    heatpump: { position: new THREE.Vector3(-HOUSE.length / 2 + 1.6, 0, FRONT_Z + 0.65), yaw: 0 },
    house: new THREE.Vector3(1.2, 2.2, FRONT_Z),
    sun: new THREE.Vector3(-14, 24, 30),
  };

  return { group: g, frames: { main: mainFrame, garage: garageFrame }, anchors };
}
