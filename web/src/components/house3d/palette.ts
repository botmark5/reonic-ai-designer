import type { ThemeName } from "./types";

/**
 * Scene colours. The house is an architectural model: matte warm white and zinc neutrals only.
 * Colour belongs to the energy system: component tokens from docs/design/tokens.json and the AI gradient for flows.
 */
export interface Palette {
  surface0: string;
  surface1: string;
  border: string;
  ink: string;
  inkMuted: string;
  // energy system (tokens)
  pv: string;
  battery: string;
  heatpump: string;
  wallbox: string;
  /** AI gradient for energy flows: amber → orange → salmon. */
  flow: readonly [string, string, string];
  // model materials
  board: string;
  boardEdge: string;
  street: string;
  paving: string;
  wall: string;
  plinth: string;
  roof: string;
  roofEdge: string;
  trim: string;
  glass: string;
  door: string;
  tree: string;
  trunk: string;
  car: string;
  carGlass: string;
  tyre: string;
  appliance: string;
  panel: string;
  panelFrame: string;
  // light
  sky: string;
  groundBounce: string;
}

const LIGHT: Palette = {
  surface0: "#fdfdfb",
  surface1: "#ffffff",
  border: "#e4e4e7",
  ink: "#1b1d20",
  inkMuted: "#71717a",
  pv: "#e9a23b",
  battery: "#2f9fd0",
  heatpump: "#d4604a",
  wallbox: "#52525b",
  flow: ["#e9a23b", "#ef8a4c", "#ec8a7c"],
  board: "#f4f4f2",
  boardEdge: "#e4e4e1",
  street: "#e8e8e5",
  paving: "#ededea",
  wall: "#fcfcfa",
  plinth: "#e8e8e5",
  roof: "#e7e7e4",
  roofEdge: "#dcdcd9",
  trim: "#ffffff",
  glass: "#d4d4d8",
  door: "#e4e4e7",
  tree: "#f6f6f4",
  trunk: "#d4d4d8",
  car: "#f7f7f5",
  carGlass: "#c4c5cb",
  tyre: "#a1a1aa",
  appliance: "#fbfbfa",
  panel: "#0e141e",
  panelFrame: "#b9bdc4",
  sky: "#ffffff",
  groundBounce: "#ecebe8",
};

const DARK: Palette = {
  ...LIGHT,
  surface0: "#121315",
  surface1: "#1b1d20",
  border: "#2e3035",
  ink: "#f4f4f5",
  inkMuted: "#8b8b94",
  pv: "#eaa94a",
  battery: "#6cc8ef",
  heatpump: "#ef9a8e",
  wallbox: "#a1a1aa",
  flow: ["#eaa94a", "#f0955c", "#ef9a8e"],
  board: "#1d1f22",
  boardEdge: "#26282c",
  street: "#232528",
  paving: "#25272a",
  sky: "#c9d2e0",
  groundBounce: "#2a2723",
};

export function getPalette(theme: ThemeName): Palette {
  return theme === "dark" ? DARK : LIGHT;
}
