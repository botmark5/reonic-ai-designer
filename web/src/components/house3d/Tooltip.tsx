"use client";
import { Html } from "@react-three/drei";
import type * as THREE from "three";
import type { CompSpec } from "./sceneSpec";

const DOT: Record<CompSpec["key"], string> = {
  pv: "bg-comp-pv",
  inverter: "bg-comp-pv",
  battery: "bg-comp-battery",
  wallbox: "bg-comp-wallbox",
  heatpump: "bg-comp-heatpump",
};

/** Label card above a component: name, size with unit, the engine's first reason. */
export function Tooltip({ spec, position }: { spec: CompSpec; position: THREE.Vector3 }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div
        aria-hidden
        className="hidden w-max max-w-64 -translate-y-[calc(50%+10px)] rounded-md border border-border bg-surface-1/95 px-3 py-2 text-ink shadow-[0_12px_32px_rgba(16,17,20,0.10)] backdrop-blur-sm sm:block"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[spec.key]}`} />
          {spec.title}
          {spec.size && <span className="font-mono text-[13px] font-medium tabular-nums text-ink-body">{spec.size}</span>}
        </div>
        {spec.reason && <p className="mt-1 text-[13px] leading-[18px] text-ink-body">{spec.reason}</p>}
        {spec.note && <p className="mt-1 text-[13px] leading-[18px] text-warning-text">{spec.note}</p>}
      </div>
    </Html>
  );
}

const SHORT: Record<CompSpec["key"], string> = {
  pv: "Solar", inverter: "Inverter", battery: "Battery", wallbox: "Wallbox", heatpump: "Heat pump",
};

/** Always-on label for a projector: name and size, big enough to read from the back of the room. */
/** Which side of its point a label sits on, so neighbours (battery and wallbox on the garage) never overlap. */
export type LabelSide = "left" | "right" | "above";
const SIDE: Record<LabelSide, string> = {
  left: "-translate-x-[calc(50%+14px)] -translate-y-1/2",
  right: "translate-x-[calc(50%+14px)] -translate-y-1/2",
  above: "-translate-y-[calc(100%+6px)]",
};

export function Label({ spec, position, side = "above" }: { spec: CompSpec; position: THREE.Vector3; side?: LabelSide }) {
  const size = spec.size?.split(" (")[0];
  return (
    <Html position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div
        aria-hidden
        className={`flex w-max ${SIDE[side]} items-center gap-2 rounded-full border border-border bg-surface-1/95 py-1.5 pl-2.5 pr-3.5 text-ink shadow-[0_8px_24px_rgba(16,17,20,0.12)] backdrop-blur-sm`}
      >
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${DOT[spec.key]}`} />
        <span className="text-base font-semibold">{SHORT[spec.key]}</span>
        {size && <span className="font-mono text-base font-medium tabular-nums text-ink-body">{size}</span>}
      </div>
    </Html>
  );
}
