import { PresentationContentLayout, type EmbeddedNodeId } from "@scaffold/contracts";
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
import type {
  CompiledSurfacePresentationTimeline,
  CompiledVisualTarget,
} from "@/presentation/model";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/styles/globals.css";

import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";
import type { SlideshowSurfaceRuntimeComposition } from "@/runtime/players/slideshow/slideshow-surface-runtime-composition";

const compositionProbe = vi.hoisted(() => ({
  current: null as SlideshowSurfaceRuntimeComposition | null,
}));

vi.mock("@/runtime/players/slideshow/slideshow-surface-runtime-composition", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/runtime/players/slideshow/slideshow-surface-runtime-composition")
  >();
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

describe("real Presentation content-layout choreography", () => {
  it("reflows a Flow Hide and can seek its measured Layout backwards", async () => {
    const mounted = await mountLayoutTracer(PresentationContentLayout.Flow);
    const first = await mountedTarget(mounted.firstId);
    const second = await mountedTarget(mounted.secondId);
    const composition = requiredPresentationComposition();
    const initialSecondTop = second.getBoundingClientRect().top;

    await expectAppliedSeek(composition, 1_250);
    expect(first).toHaveAttribute("data-presentation-availability", "withheld");
    expect(first).toHaveAttribute("aria-hidden", "true");
    expect(first).toHaveAttribute("inert");
    const forwardTransform = second.style.transform || second.style.translate;
    expect(forwardTransform).not.toBe("");

    await expectAppliedSeek(composition, 1_500);
    expect(second.getBoundingClientRect().top).toBeLessThan(initialSecondTop);
    expect(second.style.transform || second.style.translate).toBe("");

    await expectAppliedSeek(composition, 1_250);
    expect(second.style.transform || second.style.translate).not.toBe("");
  });

  it("replaces one real Sequence child at the shared position", async () => {
    const mounted = await mountLayoutTracer(PresentationContentLayout.Sequence);
    const first = await mountedTarget(mounted.firstId);
    const second = await mountedTarget(mounted.secondId);
    const composition = requiredPresentationComposition();
    const firstOwner = projectedOwner("First");
    const secondOwner = projectedOwner("Second");
    const firstTop = firstOwner.getBoundingClientRect().top;

    expect(firstOwner).toHaveAttribute("data-presentation-availability", "available");
    expect(secondOwner).toHaveAttribute("data-presentation-availability", "withheld");
    await expectAppliedSeek(composition, 1_250);

    expect(first).toHaveAttribute("aria-hidden", "true");
    expect(first).toHaveAttribute("inert");
    expect(secondOwner).toHaveAttribute("data-presentation-availability", "available");
    expect(secondOwner).toHaveAttribute("data-presentation-geometry", "shared-position");
    expect(second).not.toHaveAttribute("aria-hidden");
    await expectAppliedSeek(composition, 1_500);
    expect(secondOwner.getBoundingClientRect().top).toBeCloseTo(firstTop, 0);

    root?.unmount();
    root = null;
    expect(first).not.toHaveAttribute("data-layout-id");
    expect(second).not.toHaveAttribute("data-layout-id");
  });
});

async function mountLayoutTracer(contentLayout: PresentationContentLayout) {
  const surfaceId = createEmbeddedNodeId() as SurfaceId;
  const firstId = createEmbeddedNodeId();
  const secondId = createEmbeddedNodeId();
  const { content, containerId } = tracerDocument(surfaceId, firstId, secondId, contentLayout);
  const structure = projectCourseStructure(content);
  if (!structure || structure.mode !== "slideshow") throw new Error("Expected Slideshow.");
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected supported tracer, received ${readiness.status}.`);
  }
  let editor: TiptapEditor | null = null;
  host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0 auto auto 0;width:900px;height:600px;";
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
      <SlideshowPlayer
        preparedDocument={readiness.preparedDocument}
        structure={structure}
        sizing="contained"
        surfaceRuntimeProgramSource={(requestedSurfaceId) =>
          requestedSurfaceId === surfaceId
            ? {
                presentation: {
                  timeline: layoutTimeline({
                    surfaceId,
                    containerId,
                    firstId,
                    secondId,
                    contentLayout,
                  }),
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
  await waitForCondition(() => editor && compositionProbe.current?.presentationVisualRuntime);
  return { surfaceId, containerId, firstId, secondId };
}

function projectedOwner(label: string): HTMLElement {
  const owner = Array.from(
    host?.querySelectorAll<HTMLElement>("[data-presentation-slot=\"shared\"]") ?? [],
  ).find((candidate) => candidate.textContent?.includes(label));
  if (!owner) throw new Error("Expected projected content-layout owner.");
  return owner;
}

function tracerDocument(
  surfaceId: SurfaceId,
  firstId: EmbeddedNodeId,
  secondId: EmbeddedNodeId,
  contentLayout: PresentationContentLayout,
): { readonly content: JSONContent; readonly containerId: EmbeddedNodeId } {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Layout tracer",
  });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") throw new Error("Expected Course Document.");
  const courseSection = courseDocument.content?.find((node) => node.type === "courseSection");
  if (!courseSection) throw new Error("Expected Course Section.");
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected Region.");
  region.attrs = { ...region.attrs, contentLayout };
  region.content = [callout(firstId, "First"), callout(secondId, "Second")];
  assignMissingIds(surface);
  courseDocument.content = [courseSection, surface];
  return { content, containerId: region.attrs!["id"] as EmbeddedNodeId };
}

function callout(id: EmbeddedNodeId, label: string): JSONContent {
  return {
    type: "callout",
    attrs: { id, data: emptyCalloutData() },
    content: [
      {
        type: "callout_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
      },
      {
        type: "callout_prompt",
        content: [
          { type: "paragraph", content: [{ type: "text", text: `${label} layout content` }] },
        ],
      },
    ],
  };
}

function layoutTimeline({
  surfaceId,
  containerId,
  firstId,
  secondId,
  contentLayout,
}: {
  readonly surfaceId: SurfaceId;
  readonly containerId: EmbeddedNodeId;
  readonly firstId: EmbeddedNodeId;
  readonly secondId: EmbeddedNodeId;
  readonly contentLayout: PresentationContentLayout;
}): CompiledSurfacePresentationTimeline {
  const transition = Object.freeze({
    kind: "fade" as const,
    durationMs: 500,
    easing: Object.freeze({ kind: "preset" as const, preset: "linear" as const }),
  });
  const membership = (directChildId: EmbeddedNodeId) =>
    Object.freeze({
      containerId,
      contentLayout,
      directChildId,
      directChildIds: Object.freeze([firstId, secondId]),
    });
  const targets: Array<readonly [EmbeddedNodeId, CompiledVisualTarget]> = [
    [
      firstId,
      Object.freeze({
        targetId: firstId,
        initialVisibility: "visible" as const,
        contentLayout: membership(firstId),
      }),
    ],
  ];
  if (contentLayout === PresentationContentLayout.Sequence) {
    targets.push([
      secondId,
      Object.freeze({
        targetId: secondId,
        initialVisibility: "withheld" as const,
        contentLayout: membership(secondId),
      }),
    ]);
  }
  return Object.freeze({
    surfaceId,
    durationMs: 2_000,
    cues: Object.freeze([]),
    waits: Object.freeze([]),
    visualProgram: Object.freeze({
      surfaceId,
      durationMs: 2_000,
      targetById: new Map(targets),
      segments: Object.freeze([
        Object.freeze({
          id: createEmbeddedDataId(),
          targetId: firstId,
          startMs: 1_000,
          endMs: 1_500,
          visual: Object.freeze({ kind: "hide" as const, transition }),
        }),
        ...(contentLayout === PresentationContentLayout.Sequence
          ? [
              Object.freeze({
                id: createEmbeddedDataId(),
                targetId: secondId,
                startMs: 1_000,
                endMs: 1_500,
                visual: Object.freeze({ kind: "reveal" as const, transition }),
              }),
            ]
          : []),
      ]),
      sequenceContainers: Object.freeze(
        contentLayout === PresentationContentLayout.Sequence
          ? [
              Object.freeze({
                boundaryId: containerId,
                directChildIds: Object.freeze([firstId, secondId]),
                initialActiveChildId: firstId,
              }),
            ]
          : [],
      ),
    }),
  });
}

type MountedPresentationComposition = SlideshowSurfaceRuntimeComposition &
  Required<Pick<SlideshowSurfaceRuntimeComposition, "presentationControls" | "seek">>;

function requiredPresentationComposition(): MountedPresentationComposition {
  const composition = compositionProbe.current;
  if (!composition?.presentationControls || !composition.seek) {
    throw new Error("Expected production Presentation composition.");
  }
  return composition as MountedPresentationComposition;
}

async function expectAppliedSeek(
  composition: MountedPresentationComposition,
  timeMs: number,
): Promise<void> {
  const result = await composition.seek(timeMs);
  if (result.isErr()) throw new Error(`Expected Seek, received ${result.error.reason}.`);
  expect(result.value).toMatchObject({ kind: "applied", timeMs });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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

async function waitForCondition(condition: () => unknown): Promise<void> {
  const startedAt = performance.now();
  while (!condition()) {
    if (performance.now() - startedAt > 5_000) throw new Error("Timed out waiting for condition.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
