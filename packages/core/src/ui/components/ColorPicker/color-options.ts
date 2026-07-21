export interface ColorOption {
  label: string;
  value: string;
}

/**
 * Text/background colour palette. Standard colour names come first; Scaffold
 * brand colours stay available without turning authoring chrome into a design
 * tool.
 */
export const SCAFFOLD_TEXT_COLOR_OPTIONS = [
  { label: "Default", value: "" },
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#18181b" },
  { label: "Gray", value: "#71717a" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Yellow", value: "#ca8a04" },
  { label: "Green", value: "#16a34a" },
  { label: "Teal", value: "#00BA92" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Pink", value: "#db2777" },
  { label: "Navy", value: "#161D77" },
  { label: "Coral", value: "#F43A57" },
] as const satisfies readonly ColorOption[];

export const SCAFFOLD_HIGHLIGHT_COLOR_OPTIONS = [
  { label: "None", value: "" },
  { label: "Yellow", value: "#FBF3DB" },
  { label: "Amber", value: "#FAEBDD" },
  { label: "Peach", value: "#F9DCC4" },
  { label: "Red", value: "#FBE4E4" },
  { label: "Pink", value: "#F4DFEB" },
  { label: "Plum", value: "#EAE4F2" },
  { label: "Indigo", value: "#E0E2F4" },
  { label: "Blue", value: "#DDEBF1" },
  { label: "Sky", value: "#D9EBF7" },
  { label: "Teal", value: "#D5EBE6" },
  { label: "Green", value: "#DDEDEA" },
  { label: "Lime", value: "#E3EDD3" },
  { label: "Gray", value: "#EBECED" },
] as const satisfies readonly ColorOption[];

export const DEFAULT_TEXT_COLOR = "#18181b";
export const DEFAULT_HIGHLIGHT_COLOR = "#FBF3DB";
export const DEFAULT_SURFACE_BACKGROUND_COLOR = "#ffffff";
