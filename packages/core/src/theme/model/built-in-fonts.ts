import type { CourseThemeFontDefinition } from "./theme-extension-schema";

export const builtInThemeFonts = deepFreeze([
  {
    id: "scaffold-poppins",
    label: "Poppins",
    category: "sans",
    family: "Poppins",
    fallback: "sans-serif",
    weights: [400, 500, 600, 700, 800],
  },
  {
    id: "scaffold-source-serif-4",
    label: "Source Serif 4",
    category: "serif",
    family: "Source Serif 4",
    fallback: "serif",
    weights: [400, 500, 600, 700, 800],
  },
  {
    id: "scaffold-inter",
    label: "Inter",
    category: "sans",
    family: "Inter",
    fallback: "sans-serif",
    weights: [400, 500, 600, 700, 800],
  },
  {
    id: "scaffold-jetbrains-mono",
    label: "JetBrains Mono",
    category: "mono",
    family: "JetBrains Mono Variable",
    fallback: "monospace",
    weights: [400, 500, 600, 700, 800],
  },
] satisfies CourseThemeFontDefinition[]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
