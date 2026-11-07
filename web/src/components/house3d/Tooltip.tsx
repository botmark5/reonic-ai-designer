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
        role="status"
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
