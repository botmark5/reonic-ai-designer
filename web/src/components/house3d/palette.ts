import type { ThemeName } from "./types";

/** Scene colours. Component and surface colours are the values in docs/design/tokens.json. */
export interface Palette {
  surface0: string;
  surface1: string;
  border: string;
  ink: string;
  inkMuted: string;
  pv: string;
  battery: string;
  heatpump: string;
  wallbox: string;
  // scene materials (not tokens: a calm, slightly stylised house)
  roof: string;
  roofEdge: string;
  wall: string;
  plinth: string;
  trim: string;
  glass: string;
  door: string;
  ground: string;
  paving: string;
  panel: string;
  panelFrame: string;
  appliance: string;
  car: string;
  sky: string;
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
  roof: "#55585e",
  roofEdge: "#3f4146",
  wall: "#f3efe8",
  plinth: "#c9c4bb",
  trim: "#ffffff",
  glass: "#7b93a6",
  door: "#6b4f3a",
  ground: "#e3e8dc",
  paving: "#d6d3cd",
  panel: "#1f2a3a",
  panelFrame: "#c8ccd2",
  appliance: "#f7f7f5",
  car: "#8a9aa8",
  sky: "#fdfdfb",
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
  roof: "#4a4c51",
  roofEdge: "#36383c",
  wall: "#d8d3cb",
  plinth: "#9b968e",
  ground: "#2a302a",
  paving: "#3a3936",
  sky: "#121315",
};

export function getPalette(theme: ThemeName): Palette {
  return theme === "dark" ? DARK : LIGHT;
}
