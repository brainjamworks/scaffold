export const builtInThemeFonts = deepFreeze([
  {
    id: "scaffold-satoshi",
    label: "Satoshi",
    category: "sans",
    family: "Satoshi",
    fallback: "sans-serif",
    weights: [400, 500, 600, 700, 800],
  },
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
    id: "scaffold-atkinson-hyperlegible",
    label: "Atkinson Hyperlegible",
    category: "sans",
    family: "Atkinson Hyperlegible",
    fallback: "sans-serif",
    weights: [400, 700],
  },
  {
    id: "scaffold-silkscreen",
    label: "Silkscreen",
    category: "sans",
    family: "Silkscreen",
    fallback: "sans-serif",
    weights: [400, 700],
  },
  {
    id: "scaffold-jetbrains-mono",
    label: "JetBrains Mono",
    category: "mono",
    family: "JetBrains Mono Variable",
    fallback: "monospace",
    weights: [400, 500, 600, 700, 800],
  },
] as const);
export type BuiltInThemeFontId = (typeof builtInThemeFonts)[number]["id"];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
