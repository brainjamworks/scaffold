import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { projectLearnerDocument } from "@/authoring/publication/document-projection";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";
import { LearnerActivityRuntimeProvider } from "@/runtime/learner-activity/LearnerActivityRuntimeProvider";
import {
  createScaffoldDefaultTheme,
  createThemeCatalogue,
  materialiseCoursePalette,
  resolveCourseTheme,
  SCAFFOLD_DEFAULT_PRESET,
  SCAFFOLD_EDITORIAL_PRESET,
  type ResolvedCourseTheme,
  type ScaffoldColorMode,
} from "@/theme/model";
import "@/styles/globals.css";

import { PagePlayer } from "@/runtime/players/page/PagePlayer";
import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";

const SURFACE_BACKGROUND = "#123456";
const REPRESENTATIVE_BLOCKS = [
  ".sc-mcq",
  ".sc-callout",
  ".sc-checklist",
  ".sc-chart-block",
  ".sc-resource-link",
  ".sc-text-wrap-image",
  ".sc-code-block",
] as const;

interface MountedPlayer {
  host: HTMLElement;
  root: Root;
}

type MetricProfile = "minimum" | "maximum";

const METRIC_EXPECTATIONS = {
  minimum: {
    bodyWeight: "400",
    calloutBorder: "0px",
    calloutPadding: 12.25,
    calloutRadius: "6px",
    density: "0.875",
    headingWeight: "400",
    stroke: "0px",
  },
  maximum: {
    bodyWeight: "700",
    calloutBorder: "2px",
    calloutPadding: 15.75,
    calloutRadius: "18px",
    density: "1.125",
    headingWeight: "800",
    stroke: "2px",
  },
} as const satisfies Record<MetricProfile, Record<string, number | string>>;

const mountedPlayers: MountedPlayer[] = [];

afterEach(() => {
  while (mountedPlayers.length > 0) {
    const mounted = mountedPlayers.pop();
    mounted?.root.unmount();
    mounted?.host.remove();
  }
});

describe("course theme consumer matrix", () => {
  it("keeps the Page and Slideshow fixtures in parity with every built-in block", () => {
    for (const mode of ["page", "slideshow"] as const) {
      const document = representativeDocument(mode, `consumer-${mode}`);
      const fixtureNodeTypes = new Set(
        collectNodeTypes(document).filter((nodeType) =>
          builtInBlockDefinitions.some((definition) => definition.nodeType === nodeType),
        ),
      );

      expect(fixtureNodeTypes).toEqual(
        new Set(builtInBlockDefinitions.map((definition) => definition.nodeType)),
      );
    }
  });

  it("preserves saved output across preset revisions, fallback, and restoration", () => {
    const savedPreset = hostPreset("1", "#7c3aed");
    const changedPreset = hostPreset("2", "#ea580c");
    const theme = {
      schemaVersion: 1 as const,
      preset: { id: savedPreset.id, revision: savedPreset.revision },
      values: structuredClone(savedPreset.values),
    };
    const snapshot = structuredClone(theme);

    const changed = resolveCourseTheme({
      catalogue: createThemeCatalogue({ presets: [changedPreset] }),
      mode: "light",
      theme,
    });
    const unavailable = resolveCourseTheme({
      catalogue: createThemeCatalogue(),
      mode: "light",
      theme,
    });
    const restored = resolveCourseTheme({
      catalogue: createThemeCatalogue({ presets: [changedPreset] }),
      mode: "light",
      theme,
    });

    expect(changed.values.colors.author.light.primary).toBe("#7c3aed");
    expect(changed.palette.primary).toBe("#7c3aed");
    expect(unavailable.effectivePresetId).toBe(SCAFFOLD_DEFAULT_PRESET.id);
    expect(restored.palette.primary).toBe("#7c3aed");
    expect(theme).toEqual(snapshot);
  });

  it("keeps exact author anchors and per-slot dark intent without recolouring statuses", () => {
    const preset = SCAFFOLD_EDITORIAL_PRESET;
    const light = {
      ...preset.values.colors.author.light,
      background: "#ffffff",
      bodyText: "#ffffff",
      primary: "#7c3aed",
    };
    const dark = {
      sourceBySlot: {
        ...preset.values.colors.author.dark.sourceBySlot,
        primary: "custom" as const,
      },
      values: {
        ...preset.values.colors.author.dark.values,
        primary: "#c4b5fd",
      },
    };
    const materialised = materialiseCoursePalette({ recipe: preset.recipe, light, dark });

    expect(materialised.author.light.bodyText).toBe("#ffffff");
    expect(materialised.resolved.light).not.toHaveProperty("bodyText");
    expect(materialised.resolved.light.text).toBe("#ffffff");
    expect(materialised.resolved.light.primary).toBe("#7c3aed");
    expect(materialised.author.dark.sourceBySlot.primary).toBe("custom");
    expect(materialised.resolved.dark.primary).toBe("#c4b5fd");
    expect(materialised.resolved.light.success).toEqual(
      preset.values.colors.resolved.light.success,
    );
    expect(materialised.resolved.dark.warning).toEqual(preset.values.colors.resolved.dark.warning);
  });

  for (const mode of ["light", "dark"] satisfies ScaffoldColorMode[]) {
    for (const profile of ["minimum", "maximum"] satisfies MetricProfile[]) {
      it(`projects the ${profile} custom ${mode} course theme through Page and Slideshow`, async () => {
        const expected = METRIC_EXPECTATIONS[profile];
        const resolvedTheme = createConsumerTheme(mode, profile);
        const players = [
          await mountPage(learnerDocument("page", "consumer-page"), resolvedTheme),
          await mountSlideshow(learnerDocument("slideshow", "consumer-slide"), resolvedTheme),
        ];

        for (const { host } of players) {
          const scope = uniqueElement<HTMLElement>(host, ".sc-course-theme-scope");
          const surface = uniqueElement<HTMLElement>(scope, "[data-surface]");

          expect(scope.dataset.courseColorMode).toBe(mode);
          expect(scope.style.getPropertyValue("--sc-course-color-primary")).toBe(
            resolvedTheme.cssTokens["--sc-course-color-primary"],
          );
          expect(scope.style.getPropertyValue("--sc-course-density")).toBe(expected.density);
          expect(scope.style.getPropertyValue("--sc-course-shadow")).toBe(
            resolvedTheme.cssTokens["--sc-course-shadow"],
          );
          expect(scope.style.getPropertyValue("--sc-course-stroke")).toBe(expected.stroke);
          expect(scope.style.getPropertyValue("--sc-course-font-code")).toContain("Poppins");
          expect(getComputedStyle(surface).backgroundColor).toBe("rgb(18, 52, 86)");

          for (const definition of builtInBlockDefinitions) {
            expect(
              surface.querySelector(runtimeBlockSelector(definition.nodeType)),
              definition.nodeType,
            ).not.toBeNull();
          }

          for (const selector of REPRESENTATIVE_BLOCKS) {
            const block = uniqueElement<HTMLElement>(surface, selector);
            expect(getComputedStyle(block).fontFamily).toContain("Inter");
          }

          expect(getComputedStyle(uniqueElement<HTMLElement>(surface, "h2")).fontFamily).toContain(
            "Source Serif 4",
          );
          expect(getComputedStyle(uniqueElement<HTMLElement>(surface, "h2")).color).toBe(
            mode === "light" ? "rgb(91, 33, 182)" : "rgb(221, 214, 254)",
          );
          expect(
            getComputedStyle(uniqueElement<HTMLElement>(surface, 'a[href="/course-link"]')).color,
          ).toBe(mode === "light" ? "rgb(3, 105, 161)" : "rgb(125, 211, 252)");
          expect(
            getComputedStyle(uniqueElement<HTMLElement>(surface, ".sc-code-block__pre")).fontFamily,
          ).toContain("Poppins");

          const calloutTitleStyle = getComputedStyle(
            uniqueElement<HTMLElement>(surface, ".sc-callout__title"),
          );
          expect(calloutTitleStyle.fontWeight).toBe(expected.headingWeight);
          expect(calloutTitleStyle.textTransform).toBe("uppercase");
          expect(Number.parseFloat(calloutTitleStyle.lineHeight)).toBeCloseTo(
            Number.parseFloat(calloutTitleStyle.fontSize) * (profile === "minimum" ? 0.9 : 1.5),
          );

          const calloutPromptStyle = getComputedStyle(
            uniqueElement<HTMLElement>(surface, ".sc-callout__prompt"),
          );
          expect(calloutPromptStyle.fontWeight).toBe(expected.bodyWeight);
          expect(Number.parseFloat(calloutPromptStyle.lineHeight)).toBeCloseTo(
            Number.parseFloat(calloutPromptStyle.fontSize) * (profile === "minimum" ? 1.2 : 2),
          );

          const calloutStyle = getComputedStyle(uniqueElement<HTMLElement>(surface, ".sc-callout"));
          expect(calloutStyle.borderTopWidth).toBe(expected.calloutBorder);
          expect(calloutStyle.borderRadius).toBe(expected.calloutRadius);
          expect(Number.parseFloat(calloutStyle.paddingTop)).toBeCloseTo(expected.calloutPadding);

          const dropdownTrigger = uniqueElement<HTMLElement>(
            surface,
            ".sc-dropdown-runtime__trigger",
          );
          expect(
            Number.parseFloat(getComputedStyle(dropdownTrigger).minHeight),
          ).toBeGreaterThanOrEqual(36);

          const textWrapShell = uniqueElement<HTMLElement>(surface, ".sc-text-wrap-image__shell");
          expect(textWrapShell.dataset.position).toBe("right");
          expect(textWrapShell.dataset.shape).toBe("circle");
          expect(
            getComputedStyle(
              uniqueElement<HTMLElement>(textWrapShell, ".sc-text-wrap-image__empty"),
            ).borderRadius,
          ).toBe("9999px");
        }
      });
    }
  }
});

function createConsumerTheme(mode: ScaffoldColorMode, profile: MetricProfile): ResolvedCourseTheme {
  const theme = createScaffoldDefaultTheme();
  if (!theme.values) throw new Error("The default course theme has no editable values.");

  theme.values.typography.headingFontId = "scaffold-source-serif-4";
  theme.values.typography.bodyFontId = "scaffold-inter";
  theme.values.typography.codeFontId = "scaffold-poppins";
  theme.values.typography.headingWeight = profile === "minimum" ? 400 : 800;
  theme.values.typography.bodyWeight = profile === "minimum" ? 400 : 700;
  theme.values.typography.typeScale = profile === "minimum" ? 0.8 : 1.4;
  theme.values.typography.headingLineHeight = profile === "minimum" ? 0.9 : 1.5;
  theme.values.typography.bodyLineHeight = profile === "minimum" ? 1.2 : 2;
  theme.values.typography.headingLetterSpacing = profile === "minimum" ? -0.08 : 0.2;
  theme.values.typography.uppercaseHeadings = true;
  theme.values.design.roundness = profile === "minimum" ? 0 : 1;
  theme.values.design.stroke = profile === "minimum" ? 0 : 2;
  theme.values.design.shadow = profile === "minimum" ? "none" : "defined";
  theme.values.design.density = profile === "minimum" ? "compact" : "spacious";
  theme.values.colors.resolved.light.primary = "#7c3aed";
  theme.values.colors.resolved.light.heading = "#5b21b6";
  theme.values.colors.resolved.light.link = "#0369a1";
  theme.values.colors.resolved.dark.primary = "#c4b5fd";
  theme.values.colors.resolved.dark.heading = "#ddd6fe";
  theme.values.colors.resolved.dark.link = "#7dd3fc";

  return resolveCourseTheme({
    catalogue: createThemeCatalogue(),
    mode,
    theme,
  });
}

function hostPreset(revision: string, primary: string) {
  const preset = structuredClone(SCAFFOLD_EDITORIAL_PRESET);
  preset.id = "uk.ac.example.acceptance";
  preset.revision = revision;
  preset.recipe.id = "uk.ac.example.acceptance-palette";
  preset.values.colors.author.light.primary = primary;
  preset.values.colors = materialiseCoursePalette({
    recipe: preset.recipe,
    light: preset.values.colors.author.light,
    dark: preset.values.colors.author.dark,
  });
  return preset;
}

function representativeDocument(mode: "page" | "slideshow", surfaceId: string): JSONContent {
  const content = createScaffoldDocumentContent({ mode, surfaceId });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];
  if (!courseDocument || !surface) throw new Error("Missing consumer matrix surface.");

  courseDocument.attrs = { ...courseDocument.attrs, mode };
  surface.attrs = {
    ...surface.attrs,
    id: surfaceId,
    ...(mode === "slideshow" ? { variant: "slide-cover" } : {}),
    settings: {
      ...(surface.attrs?.settings as Record<string, unknown>),
      background: { color: SURFACE_BACKGROUND },
    },
  };

  surface.content = [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Representative course content" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "/course-link" } }],
          text: "Course link",
        },
      ],
    },
    ...builtInBlockDefinitions.map(configuredBlockContent),
  ];
  return content;
}

function learnerDocument(mode: "page" | "slideshow", surfaceId: string): JSONContent {
  return projectLearnerDocument(representativeDocument(mode, surfaceId)).document;
}

function configuredBlockContent(definition: (typeof builtInBlockDefinitions)[number]): JSONContent {
  const content = insertedContent(definition);
  if (definition.nodeType !== "text_wrap_image") return content;

  content.attrs = {
    ...content.attrs,
    data: {
      ...(content.attrs?.data as Record<string, unknown>),
      position: "right",
      shape: "circle",
    },
  };
  return content;
}

function insertedContent(definition: { insert?: { content: () => JSONContent } }): JSONContent {
  if (!definition.insert) throw new Error("Consumer matrix block has no insert content.");
  return definition.insert.content();
}

function collectNodeTypes(node: JSONContent): string[] {
  return [node.type, ...(node.content?.flatMap(collectNodeTypes) ?? [])].filter(
    (nodeType): nodeType is string => nodeType !== undefined,
  );
}

function runtimeBlockSelector(nodeType: string): string {
  return nodeType === "table" ? ".sc-table" : `[data-node="${nodeType}"]`;
}

async function mountPage(
  initialContent: JSONContent,
  resolvedTheme: ResolvedCourseTheme,
): Promise<MountedPlayer> {
  return mountPlayer(
    <PagePlayer
      initialContent={initialContent}
      resolvedTheme={resolvedTheme}
      surfaceId="consumer-page"
    />,
    ".sc-page-player",
  );
}

async function mountSlideshow(
  initialContent: JSONContent,
  resolvedTheme: ResolvedCourseTheme,
): Promise<MountedPlayer> {
  return mountPlayer(
    <SlideshowPlayer
      artifactId="course-theme-consumer-matrix"
      initialContent={initialContent}
      resolvedTheme={resolvedTheme}
      surfaceIds={["consumer-slide"]}
    />,
    ".sc-slideshow-player__canvas",
    "height: 576px; width: 1024px;",
  );
}

async function mountPlayer(
  player: ReactNode,
  readySelector: string,
  hostStyle = "width: 1200px;",
): Promise<MountedPlayer> {
  const host = document.createElement("div");
  host.style.cssText = hostStyle;
  document.body.append(host);
  const root = createRoot(host);
  const mounted = { host, root };
  mountedPlayers.push(mounted);

  root.render(
    createAssessmentRuntimeTestRoot({
      children: <LearnerActivityRuntimeProvider>{player}</LearnerActivityRuntimeProvider>,
    }),
  );

  await waitForCondition(() => host.querySelector(readySelector) !== null);
  return mounted;
}

function uniqueElement<T extends Element>(root: ParentNode, selector: string): T {
  const matches = root.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 10_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out mounting consumer matrix.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
