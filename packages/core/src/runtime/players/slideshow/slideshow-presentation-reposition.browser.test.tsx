import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { projectCourseStructure, type SurfaceId } from "@/document/model/course-structure";
import {
  createEmbeddedDataId,
  createEmbeddedNodeId,
} from "@/document/model/identity/stable-ids";
import { emptyCalloutData } from "@/editor/blocks/presentation/callout/content";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type { CompiledSurfacePresentationTimeline } from "@/presentation/model";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import "@/styles/globals.css";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { SlideshowPlayer } from "./SlideshowPlayer";
import type { SlideshowSurfaceRuntimeComposition } from "./slideshow-surface-runtime-composition";

const compositionProbe = vi.hoisted(() => ({
  current: null as SlideshowSurfaceRuntimeComposition | null,
}));

vi.mock("./slideshow-surface-runtime-composition", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./slideshow-surface-runtime-composition")>();
  return {
    ...actual,
    createSlideshowSurfaceRuntimeComposition(
      input: Parameters<typeof actual.createSlideshowSurfaceRuntimeComposition>[0],
    ) {
      const composition = actual.createSlideshowSurfaceRuntimeComposition(input);
      compositionProbe.current = composition;
      return composition;
    },
  };
});

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  compositionProbe.current = null;
});

describe("Slideshow Presentation feature reconstruction", () => {
  it("reconstructs real Tabs before publishing the same Reveal scene for every direct seek", async () => {
    const fixture = await mountTracer();
    const target = await mountedTarget(fixture.revealTargetId);
    const overview = requiredTab("Overview");
    const details = requiredTab("Details");
    const composition = requiredPresentationComposition();

    await expectScene({
      selected: overview,
      unselected: details,
      target,
      availability: "withheld",
      opacity: "0",
    });

    const directSeekTable = [
      { timeMs: 1_000, selected: details, unselected: overview, availability: "available" },
      { timeMs: 100, selected: overview, unselected: details, availability: "withheld" },
      { timeMs: 500, selected: details, unselected: overview, availability: "withheld" },
      { timeMs: 1_000, selected: details, unselected: overview, availability: "available" },
      { timeMs: 1_000, selected: details, unselected: overview, availability: "available" },
      { timeMs: 100, selected: overview, unselected: details, availability: "withheld" },
    ] as const;

    for (const expectation of directSeekTable) {
      await expectAppliedSeek(composition, expectation.timeMs);
      await expectScene({
        selected: expectation.selected,
        unselected: expectation.unselected,
        target,
        availability: expectation.availability,
        opacity: expectation.availability === "available" ? "1" : "0",
      });
    }

    root?.unmount();
    root = null;
    expect(target).not.toHaveAttribute("data-presentation-availability");
    expect(target).not.toHaveAttribute("aria-hidden");
    expect(target).not.toHaveAttribute("inert");
    expect(target.style.opacity).toBe("");
    expect(target.isConnected).toBe(false);
  });

  it("reconstructs the time-zero Tabs view on initial entry, Restart and Surface return", async () => {
    const fixture = await mountTracer({ selectDetailsAtZero: true });
    const target = await mountedTarget(fixture.revealTargetId);
    const overview = requiredTab("Overview");
    const details = requiredTab("Details");
    const firstComposition = requiredPresentationComposition();

    await expectScene({
      selected: details,
      unselected: overview,
      target,
      availability: "withheld",
      opacity: "0",
    });

    overview.click();
    await expectTabSelection(overview, details);
    const restart = await firstComposition.presentationControls.restart();
    if (restart.isErr()) {
      throw new Error(`Expected Restart to succeed, received ${restart.error.reason}.`);
    }
    expect(restart.value).toMatchObject({ kind: "applied", timeMs: 0 });
    await expectScene({
      selected: details,
      unselected: overview,
      target,
      availability: "withheld",
      opacity: "0",
    });

    await expectAppliedSeek(firstComposition, 2_000);
    overview.click();
    await expectTabSelection(overview, details);
    await waitForCondition(() => buttonByName("Next slide").disabled === false);
    buttonByName("Next slide").click();
    await waitForCondition(() => host?.textContent?.includes("2 of 2"));

    await waitForCondition(() => buttonByName("Previous slide").disabled === false);
    buttonByName("Previous slide").click();
    await waitForCondition(
      () =>
        host?.textContent?.includes("1 of 2") &&
        compositionProbe.current !== firstComposition &&
        compositionProbe.current?.presentationControls &&
        requiredTabOrNull("Details"),
    );

    const returnedTarget = await mountedTarget(fixture.revealTargetId);
    await expectScene({
      selected: requiredTab("Details"),
      unselected: requiredTab("Overview"),
      target: returnedTarget,
      availability: "withheld",
      opacity: "0",
    });
  });
});

interface RepositionFixture {
  readonly surfaceId: SurfaceId;
  readonly otherSurfaceId: SurfaceId;
  readonly tabsOwnerId: EmbeddedNodeId;
  readonly overviewSectionId: EmbeddedNodeId;
  readonly detailsSectionId: EmbeddedNodeId;
  readonly revealTargetId: EmbeddedNodeId;
}

async function mountTracer({
  selectDetailsAtZero = false,
}: {
  readonly selectDetailsAtZero?: boolean;
} = {}): Promise<RepositionFixture> {
  const fixture = Object.freeze({
    surfaceId: createEmbeddedNodeId() as SurfaceId,
    otherSurfaceId: createEmbeddedNodeId() as SurfaceId,
    tabsOwnerId: createEmbeddedNodeId(),
    overviewSectionId: createEmbeddedNodeId(),
    detailsSectionId: createEmbeddedNodeId(),
    revealTargetId: createEmbeddedNodeId(),
  });
  const content = repositionDocument(fixture);
  const structure = projectCourseStructure(content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a projected Slideshow reposition tracer document.");
  }
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected a supported reposition tracer, received ${readiness.status}.`);
  }

  let editor: TiptapEditor | null = null;
  host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
      <SlideshowPlayer
        preparedDocument={readiness.preparedDocument}
        structure={structure}
        sizing="contained"
        surfaceRuntimeProgramSource={(surfaceId) =>
          surfaceId === fixture.surfaceId
            ? {
                presentation: {
                  timeline: repositionTimeline(fixture, selectDetailsAtZero),
                  autoAdvance: false,
                },
              }
            : undefined
        }
        onRendererReady={(readyEditor) => {
          editor = readyEditor;
        }}
      />
    </CourseThemeProvider>,
  );
  await waitForCondition(
    () => editor && compositionProbe.current?.presentationVisualRuntime && requiredTabOrNull("Details"),
  );
  return fixture;
}

function repositionDocument(fixture: RepositionFixture): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: fixture.surfaceId,
    initialCourseSectionTitle: "Feature reconstruction",
  });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") throw new Error("Expected a Course Document.");
  const courseSection = courseDocument.content?.find((node) => node.type === "courseSection");
  if (!courseSection) throw new Error("Expected a Course Section.");
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId: fixture.surfaceId });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected the slide-content main Region.");
  region.content = [
    {
      type: "layout",
      attrs: {
        id: fixture.tabsOwnerId,
        variant: "tabs",
        options: { variant: "default", label: "Reconstruction topics" },
      },
      content: [
        tabSection(
          fixture.overviewSectionId,
          "Overview",
          paragraph(createEmbeddedNodeId(), "Baseline panel"),
        ),
        tabSection(fixture.detailsSectionId, "Details", callout(fixture.revealTargetId)),
      ],
    },
  ];
  assignMissingIds(surface);
  const otherSurface = slideContentSurfaceDefinition.createSurface({
    surfaceId: fixture.otherSurfaceId,
  });
  assignMissingIds(otherSurface);
  courseDocument.content = [courseSection, surface, otherSurface];
  return content;
}

function tabSection(
  id: EmbeddedNodeId,
  label: string,
  child: JSONContent,
): JSONContent {
  return {
    type: "section",
    attrs: { id, options: { label } },
    content: [child],
  };
}

function paragraph(id: EmbeddedNodeId, text: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    content: [{ type: "text", text }],
  };
}

function callout(id: EmbeddedNodeId): JSONContent {
  return {
    type: "callout",
    attrs: { id, data: emptyCalloutData() },
    content: [
      {
        type: "callout_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Reveal target" }] }],
      },
      {
        type: "callout_prompt",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Selected panel" }] }],
      },
    ],
  };
}

function assignMissingIds(rootNode: JSONContent): void {
  const stack = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    stack.push(...(node.content ?? []));
  }
}

function repositionTimeline(
  fixture: RepositionFixture,
  selectDetailsAtZero = false,
): CompiledSurfacePresentationTimeline {
  return Object.freeze({
    surfaceId: fixture.surfaceId,
    durationMs: 2_000,
    cues: Object.freeze([
      ...(selectDetailsAtZero
        ? [
            Object.freeze({
              id: createEmbeddedDataId(),
              atMs: 0,
              command: Object.freeze({
                kind: "target-command" as const,
                ownerId: fixture.tabsOwnerId,
                targetId: fixture.detailsSectionId,
                type: "select",
              }),
              seekBehavior: "reconstruct-state" as const,
            }),
          ]
        : []),
      Object.freeze({
        id: createEmbeddedDataId(),
        atMs: 400,
        command: Object.freeze({
          kind: "target-command" as const,
          ownerId: fixture.tabsOwnerId,
          targetId: fixture.detailsSectionId,
          type: "select",
        }),
        seekBehavior: "reconstruct-state" as const,
      }),
    ]),
    waits: Object.freeze([]),
    visualProgram: Object.freeze({
      surfaceId: fixture.surfaceId,
      durationMs: 2_000,
      targetById: new Map([
        [
          fixture.revealTargetId,
          Object.freeze({
            targetId: fixture.revealTargetId,
            initialVisibility: "withheld" as const,
          }),
        ],
      ]),
      segments: Object.freeze([
        Object.freeze({
          id: createEmbeddedDataId(),
          targetId: fixture.revealTargetId,
          startMs: 700,
          endMs: 900,
          visual: Object.freeze({
            kind: "reveal" as const,
            transition: Object.freeze({
              kind: "fade" as const,
              durationMs: 200,
              easing: Object.freeze({ kind: "preset" as const, preset: "linear" as const }),
            }),
          }),
        }),
      ]),
      sequenceContainers: Object.freeze([]),
    }),
  });
}

type MountedPresentationComposition = SlideshowSurfaceRuntimeComposition &
  Required<Pick<SlideshowSurfaceRuntimeComposition, "presentationControls" | "seek">>;

function requiredPresentationComposition(): MountedPresentationComposition {
  const composition = compositionProbe.current;
  if (!composition?.presentationControls || !composition.seek) {
    throw new Error("Expected the production Presentation composition.");
  }
  return composition as MountedPresentationComposition;
}

async function expectAppliedSeek(
  composition: MountedPresentationComposition,
  timeMs: number,
): Promise<void> {
  const result = await composition.seek(timeMs);
  if (result.isErr()) {
    throw new Error(`Expected Seek to succeed, received ${result.error.reason}.`);
  }
  expect(result.value).toMatchObject({ kind: "applied", timeMs });
}

async function expectScene({
  selected,
  unselected,
  target,
  availability,
  opacity,
}: {
  readonly selected: HTMLButtonElement;
  readonly unselected: HTMLButtonElement;
  readonly target: HTMLElement;
  readonly availability: "available" | "withheld";
  readonly opacity: "0" | "1";
}): Promise<void> {
  await waitForCondition(
    () =>
      selected.getAttribute("aria-selected") === "true" &&
      unselected.getAttribute("aria-selected") === "false" &&
      target.getAttribute("data-presentation-availability") === availability &&
      target.style.opacity === opacity,
  );
  expect(selected).toHaveAttribute("aria-selected", "true");
  expect(unselected).toHaveAttribute("aria-selected", "false");
  expect(target).toHaveAttribute("data-presentation-availability", availability);
  expect(target.style.opacity).toBe(opacity);
}

async function expectTabSelection(
  selected: HTMLButtonElement,
  unselected: HTMLButtonElement,
): Promise<void> {
  await waitForCondition(
    () =>
      selected.getAttribute("aria-selected") === "true" &&
      unselected.getAttribute("aria-selected") === "false",
  );
}

function requiredTab(name: string): HTMLButtonElement {
  const tab = requiredTabOrNull(name);
  if (!tab) throw new Error(`Expected the ${name} Tab.`);
  return tab;
}

function requiredTabOrNull(name: string): HTMLButtonElement | null {
  return (
    Array.from(host?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.trim() === name,
    ) ?? null
  );
}

function buttonByName(name: string): HTMLButtonElement {
  const button = host?.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!button) throw new Error(`Expected the ${name} button.`);
  return button;
}

async function mountedTarget(targetId: EmbeddedNodeId): Promise<HTMLElement> {
  let target: HTMLElement | null = null;
  await waitForCondition(() => {
    target =
      host?.querySelector<HTMLElement>(`[data-presentation-target-id="${targetId}"]`) ?? null;
    return target;
  });
  return target!;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const startedAt = performance.now();
  while (!condition()) {
    if (performance.now() - startedAt > 3_000) throw new Error("Timed out waiting for condition.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
