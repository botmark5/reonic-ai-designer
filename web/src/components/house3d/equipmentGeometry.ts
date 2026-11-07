/**
 * Low-poly equipment. Each group's origin is the back-bottom-centre of the item (against its wall or on the ground)
 * and it faces local +z. Component accent colours are the design tokens.
 */
import * as THREE from "three";
import type { Palette } from "./palette";

export type EquipmentKey = "inverter" | "battery" | "wallbox" | "heatpump" | "car";

const std = (color: string, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function part(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function inverter(p: Palette) {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.5, 0.62, 0.2), std(p.appliance), 0, 0.31, 0.1);
  part(g, new THREE.BoxGeometry(0.22, 0.1, 0.01), std(p.ink, 0.3), 0, 0.46, 0.205);
  part(g, new THREE.BoxGeometry(0.36, 0.025, 0.01), std(p.pv, 0.4), 0, 0.12, 0.205);
  return g;
}

function battery(p: Palette) {
  const g = new THREE.Group();
  const shell = std(p.appliance);
  part(g, new THREE.BoxGeometry(0.66, 0.08, 0.3), std(p.inkMuted, 0.8), 0, 0.04, 0.15);
  part(g, new THREE.BoxGeometry(0.62, 1.2, 0.26), shell, 0, 0.68, 0.15);
  part(g, new THREE.BoxGeometry(0.04, 0.9, 0.01), std(p.battery, 0.4), -0.2, 0.7, 0.285);
  for (const y of [0.42, 0.82]) part(g, new THREE.BoxGeometry(0.6, 0.012, 0.01), std(p.border, 0.8), 0, y, 0.282);
  return g;
}

function wallbox(p: Palette) {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.3, 0.42, 0.13), std(p.wallbox, 0.5), 0, 0.21, 0.065);
  part(g, new THREE.CircleGeometry(0.045, 16), std("#10b981", 0.3), 0, 0.3, 0.131);
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.1),
    new THREE.Vector3(0.05, -0.35, 0.18),
    new THREE.Vector3(0.22, -0.55, 0.12),
    new THREE.Vector3(0.28, -0.2, 0.05),
  ]);
  part(g, new THREE.TubeGeometry(cable, 16, 0.018, 5), std(p.ink, 0.7), 0, 0, 0);
  return g;
}

function heatpump(p: Palette) {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(1.2, 0.1, 0.55), std(p.plinth, 1), 0, 0.05, 0.3);
  part(g, new THREE.BoxGeometry(1.05, 0.78, 0.4), std(p.appliance), 0, 0.5, 0.3);
  const front = 0.5 + 0.001;
  part(g, new THREE.CircleGeometry(0.27, 24), std(p.ink, 0.9), -0.16, 0.52, front);
  const ring = part(g, new THREE.TorusGeometry(0.28, 0.025, 6, 28), std(p.heatpump, 0.4), -0.16, 0.52, front);
  ring.castShadow = false;
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const blade = part(g, new THREE.BoxGeometry(0.46, 0.05, 0.01), std(p.inkMuted, 0.6), -0.16, 0.52, front + 0.005);
    blade.rotation.z = a;
  }
  part(g, new THREE.BoxGeometry(0.18, 0.5, 0.01), std(p.border, 0.8), 0.32, 0.5, front);
  return g;
}

function car(p: Palette) {
  const g = new THREE.Group();
  // side profile (z = length, y = height), extruded across x
  const s = new THREE.Shape();
  s.moveTo(-2.05, 0.32);
  s.lineTo(2.05, 0.32);
  s.lineTo(2.1, 0.75);
  s.lineTo(1.85, 0.9);
  s.lineTo(0.95, 0.98);
  s.lineTo(0.35, 1.45);
  s.lineTo(-1.35, 1.45);
  s.lineTo(-1.95, 1.0);
  s.lineTo(-2.1, 0.8);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.76, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  body.rotateY(Math.PI / 2); // shape x → world -z; extrusion → world x
  body.translate(-0.88, 0, 0);
  part(g, body, std(p.car, 0.45, 0.2), 0, 0, 0);
  // glasshouse
  const glass = std(p.glass, 0.2, 0.1);
  part(g, new THREE.BoxGeometry(1.8, 0.36, 1.5), glass, 0, 1.2, 0.45);
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14);
  wheel.rotateZ(Math.PI / 2);
  const tyre = std(p.ink, 0.9);
  for (const x of [-0.82, 0.82]) for (const z of [-1.35, 1.35]) part(g, wheel, tyre, x, 0.33, z);
  return g;
}

export function buildEquipment(p: Palette): Record<EquipmentKey, THREE.Group> {
  return { inverter: inverter(p), battery: battery(p), wallbox: wallbox(p), heatpump: heatpump(p), car: car(p) };
}
