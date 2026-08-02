import { describe, expect, it } from "vite-plus/test";

import { builtInThemeFonts } from "./built-in-fonts";
import { builtInCourseThemeRegistry, createBuiltInCourseThemeRegistry } from "./presets";
import { SCAFFOLD_FLOW_V1 } from "./presets/scaffold-flow/v1";

describe("Scaffold Flow revision 1", () => {
  it("is immutable application-owned data with the approved identity and author defaults", () => {
    expect(SCAFFOLD_FLOW_V1).toMatchObject({
      id: "scaffold-flow",
      revision: "1",
      label: "Scaffold Flow",
      description: "A calm, focused course presentation built around clear learning moments.",
      authorDefaults: {
        colors: {
          light: {
            background: "#FFFFFF",
            surface: "#FFFFFF",
            bodyText: "#18181B",
            headingText: "#111113",
            primary: "#303A8F",
            secondary: "#5A62B4",
            accent1: "#087F66",
            accent2: "#A15C00",
            accent3: "#0E7490",
            accent4: "#B4236A",
            link: "#303A8F",
          },
          dark: {
            background: "#111113",
            surface: "#1A1A1E",
            bodyText: "#F7F7F8",
            headingText: "#FFFFFF",
            primary: "#AEB5FF",
            secondary: "#C8CBFF",
            accent1: "#5ADBB8",
            accent2: "#F7C76C",
            accent3: "#67E8F9",
            accent4: "#F9A8D4",
            link: "#BEC3FF",
          },
        },
        typography: {
          headingFontId: "scaffold-satoshi",
          bodyFontId: "scaffold-satoshi",
          codeFontId: "scaffold-jetbrains-mono",
          headingWeight: 600,
          bodyWeight: 400,
        },
        design: {
          roundness: 0.67,
          stroke: 1,
          shadow: "soft",
          density: "comfortable",
        },
      },
    });
    expect(Object.isFrozen(SCAFFOLD_FLOW_V1)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_FLOW_V1.functional.light)).toBe(true);
  });

  it("registers Satoshi as a supported Course font", () => {
    expect(builtInThemeFonts).toContainEqual({
      id: "scaffold-satoshi",
      label: "Satoshi",
      category: "sans",
      family: "Satoshi",
      fallback: "sans-serif",
      weights: [400, 500, 600, 700, 800],
    });
  });

  it("looks up exact immutable revisions without fallback", () => {
    expect(builtInCourseThemeRegistry.get("scaffold-flow", "1")).toBe(SCAFFOLD_FLOW_V1);
    expect(builtInCourseThemeRegistry.get("scaffold-flow", "2")).toBeNull();
    expect(builtInCourseThemeRegistry.get("unknown", "1")).toBeNull();
  });

  it("rejects duplicate preset revisions", () => {
    expect(() => createBuiltInCourseThemeRegistry([SCAFFOLD_FLOW_V1, SCAFFOLD_FLOW_V1])).toThrow(
      'Duplicate built-in Course theme revision "scaffold-flow@1"',
    );
  });
});
