import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationConfigurationV1,
} from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { Result } from "better-result";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { projectCourseStructure, type SurfaceId } from "@/document/model/course-structure";
import { createEmbeddedDataId, createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { emptyCalloutData } from "@/editor/blocks/presentation/callout/content";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type { CompiledSurfacePresentationTimeline } from "@/presentation/model";
import { createPresentationCueExecutor } from "@/runtime/presentation/presentation-cue-executor";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/styles/globals.css";

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
let restoreMatchMedia: (() => void) | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  restoreMatchMedia?.();
  restoreMatchMedia = null;
  compositionProbe.current = null;
});

describe("Slideshow Region Layer playback", () => {
  it("holds A before the Wait, cuts to B at the same millisecond, switches automatically and reverses", async () => {
    const fixture = await mountRegionTracer();
    const composition = requiredPresentationComposition();
    const layerA = requiredLayer(fixture.layerAId);
    const layerB = requiredLayer(fixture.layerBId);
    const late = requiredTarget(fixture.aLateId);
    const callout = requiredTarget(fixture.aCalloutId);
    const simultaneous = requiredTarget(fixture.aSimultaneousId);
    const exitOnly = requiredTarget(fixture.aExitId);
    const untimed = paragraphByText("Untimed scrollable paragraph");
    const bCallout = requiredTarget(fixture.bCalloutId);
    const scroll = requiredElement<HTMLElement>(
      host!,
      '[data-node="region"] > [data-bounded-scroll-frame] > [data-bounded-scroll]',
    );
    const canvas = requiredElement<HTMLElement>(host!, ".sc-slideshow-player__canvas");
    const coordinator = getSemanticTargetInteractionEnvironmentForEditor(
      fixture.editor,
    ).coordinator;

    expectExclusiveLayer(layerA, layerB);
    expect(late).toHaveAttribute("data-presentation-availability", "withheld");
    expect(callout).toHaveAttribute("data-presentation-availability", "withheld");
    expect(simultaneous).toHaveAttribute("data-presentation-availability", "withheld");
    expect(exitOnly).toHaveAttribute("data-presentation-availability", "available");
    expect(untimed).not.toHaveAttribute("data-presentation-availability");
    expect(untimed).not.toHaveAttribute("aria-hidden");
    expect(untimed).not.toHaveAttribute("inert");
    expect(untimed.getBoundingClientRect().height).toBeGreaterThan(0);
    const reservedHeights = [late, callout, simultaneous].map(
      (element) => element.getBoundingClientRect().height,
    );
    expect(reservedHeights.every((height) => height > 0)).toBe(true);
    expect(
      callout.getBoundingClientRect().top - late.getBoundingClientRect().bottom,
    ).toBeGreaterThan(0);
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    expect(getComputedStyle(layerA).overflowY).not.toBe("auto");
    const reservedPositions = positionsWithinScroll(
      scroll,
      late,
      callout,
      simultaneous,
      exitOnly,
      untimed,
    );
    await expect(coordinator.activate(fixture.aExitId, semanticOptions())).resolves.toEqual({
      kind: "reached",
      requestedId: fixture.aExitId,
    });
    await expect(coordinator.activate(fixture.bCalloutId, semanticOptions())).resolves.toEqual({
      kind: "refused",
      requestedId: fixture.bCalloutId,
      ownerId: fixture.regionId,
      childId: fixture.layerBId,
      nearestReachableOwnerId: fixture.regionId,
      reason: "hidden-layer-ancestor",
    });

    const execute = vi.fn(async () => Result.ok());
    const getBinding = vi.fn(() => ({
      ownerId: fixture.aExitId,
      commandExecutor: { execute },
    }));
    const cueExecutor = createPresentationCueExecutor({
      semanticTargets: coordinator,
      controlBindings: { get: getBinding },
      origin: "configured-presentation",
    });
    await expect(
      cueExecutor.execute({
        command: {
          kind: "target-command",
          ownerId: fixture.aExitId,
          targetId: fixture.aExitId,
          type: "review-probe",
        },
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ kind: "succeeded" });
    expect(getBinding).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();

    await expectAppliedSeek(composition, 500);
    expect(callout).toHaveAttribute("data-presentation-availability", "available");
    expect(simultaneous).toHaveAttribute("data-presentation-availability", "available");
    expect(late).toHaveAttribute("data-presentation-availability", "withheld");
    expect(
      [late, callout, simultaneous].map((element) => element.getBoundingClientRect().height),
    ).toEqual(reservedHeights);
    expectPositionsWithinScroll(
      scroll,
      reservedPositions,
      late,
      callout,
      simultaneous,
      exitOnly,
      untimed,
    );

    await expectAppliedSeek(composition, 900);
    expect(Number.parseFloat(exitOnly.style.opacity)).toBeGreaterThan(0);
    expect(Number.parseFloat(exitOnly.style.opacity)).toBeLessThan(1);
    expectPositionsWithinScroll(
      scroll,
      reservedPositions,
      late,
      callout,
      simultaneous,
      exitOnly,
      untimed,
    );
    const started = await composition.presentationControls.play();
    if (started.isErr()) throw new Error(`Expected playback to start: ${started.error.reason}.`);
    await waitForCondition(() => {
      const snapshot = composition.presentationControls.getSnapshot();
      return snapshot.phase === "held" && snapshot.position.timeMs === 1_000;
    });
    expect(composition.presentationControls.getSnapshot()).toMatchObject({
      phase: "held",
      position: { timeMs: 1_000, side: "before-actions" },
    });
    expectExclusiveLayer(layerA, layerB);
    expect(canvas).toHaveAttribute("data-content-interaction", "enabled");
    expect(canvas).not.toHaveAttribute("inert");
    const link = requiredElement<HTMLAnchorElement>(host!, 'a[href="#region-manual-hold"]');
    expect(link.closest("[inert]")).toBeNull();
    scroll.scrollTop = 0;
    link.focus();
    await nextFrame();
    expect(document.activeElement).toBe(link);
    expect(scroll.scrollTop).toBeGreaterThan(0);

    const released = await composition.presentationControls.advance();
    if (released.isErr())
      throw new Error(`Expected Continue to succeed: ${released.error.reason}.`);
    await waitForCondition(() => layerB.dataset["layerState"] === "active");
    expect(composition.presentationControls.getSnapshot().position).toEqual({
      timeMs: 1_000,
      side: "after-actions",
    });
    expectExclusiveLayer(layerB, layerA);
    expect(layerA.getClientRects()).toHaveLength(0);
    expect(exitOnly.closest('[data-layer-state="inactive"]')).toBe(layerA);
    expect(layerA).toHaveAttribute("inert");
    expect(layerA.contains(exitOnly)).toBe(true);
    expect(
      composition.presentationVisualRuntime?.getLatestApplicationReport().unavailableTargets,
    ).toContainEqual({ targetId: fixture.aExitId, reason: "owner-view-inactive" });
    expect(exitOnly.style.opacity).toBe("");
    await expect(coordinator.activate(fixture.bCalloutId, semanticOptions())).resolves.toEqual({
      kind: "reached",
      requestedId: fixture.bCalloutId,
    });
    await expect(coordinator.activate(fixture.aExitId, semanticOptions())).resolves.toEqual({
      kind: "refused",
      requestedId: fixture.aExitId,
      ownerId: fixture.regionId,
      childId: fixture.layerAId,
      nearestReachableOwnerId: fixture.regionId,
      reason: "hidden-layer-ancestor",
    });
    const bText = paragraphByText("Layer B untimed paragraph");
    expect(bText).not.toHaveAttribute("data-presentation-availability");
    expect(bText.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(bCallout).toHaveAttribute("data-presentation-availability", "withheld");
    expect(bCallout.getBoundingClientRect().height).toBeGreaterThan(0);

    await waitForCondition(
      () => composition.presentationControls.getSnapshot().position.timeMs >= 1_850,
    );
    expectExclusiveLayer(layerA, layerB);
    expect(callout).toHaveAttribute("data-presentation-availability", "available");
    expect(late).toHaveAttribute("data-presentation-availability", "available");
    expect(exitOnly).toHaveAttribute("data-presentation-availability", "withheld");
    expectPositionsWithinScroll(
      scroll,
      reservedPositions,
      late,
      callout,
      simultaneous,
      exitOnly,
      untimed,
    );
    await expect(coordinator.activate(fixture.aExitId, semanticOptions())).resolves.toEqual({
      kind: "reached",
      requestedId: fixture.aExitId,
    });

    composition.presentationControls.pause();
    await expectAppliedSeek(composition, 1_400);
    expectExclusiveLayer(layerB, layerA);
    expect(bCallout).toHaveAttribute("data-presentation-availability", "available");
    await expectAppliedSeek(composition, 850);
    expectExclusiveLayer(layerA, layerB);
    expect(late).toHaveAttribute("data-presentation-availability", "available");
    expect(exitOnly).toHaveAttribute("data-presentation-availability", "withheld");
    expect(Number.parseFloat(exitOnly.style.opacity)).toBeGreaterThan(0);
    expect(Number.parseFloat(exitOnly.style.opacity)).toBeLessThan(1);
    expectPositionsWithinScroll(
      scroll,
      reservedPositions,
      late,
      callout,
      simultaneous,
      exitOnly,
      untimed,
    );

    console.info(
      "REGION_LAYER_PLAYBACK_MEASUREMENTS",
      JSON.stringify({
        reservedHeights: reservedHeights.map(Math.round),
        regionClientHeight: scroll.clientHeight,
        regionScrollHeight: scroll.scrollHeight,
        heldPosition: { timeMs: 1_000, side: "before-actions" },
        releasedPosition: { timeMs: 1_000, side: "after-actions" },
      }),
    );
  });

  it("changes paint but not Layer timing or reserved availability under reduced motion", async () => {
    restoreMatchMedia = installReducedMotionPreference();
    const fixture = await mountRegionTracer();
    const composition = requiredPresentationComposition();
    const layerA = requiredLayer(fixture.layerAId);
    const layerB = requiredLayer(fixture.layerBId);
    const late = requiredTarget(fixture.aLateId);
    const callout = requiredTarget(fixture.aCalloutId);

    await expectAppliedSeek(composition, 300);
    expectExclusiveLayer(layerA, layerB);
    expect(callout).toHaveAttribute("data-presentation-availability", "available");
    expect(callout.style.opacity).toBe("1");
    expect(late).toHaveAttribute("data-presentation-availability", "withheld");
    expect(late.getBoundingClientRect().height).toBeGreaterThan(0);

    await expectAppliedSeek(composition, 900);
    const started = await composition.presentationControls.play();
    if (started.isErr()) throw new Error(`Expected playback to start: ${started.error.reason}.`);
    await waitForCondition(() => {
      const snapshot = composition.presentationControls.getSnapshot();
      return snapshot.phase === "held" && snapshot.position.timeMs === 1_000;
    });
    expect(composition.presentationControls.getSnapshot().position).toEqual({
      timeMs: 1_000,
      side: "before-actions",
    });
    expectExclusiveLayer(layerA, layerB);
    const released = await composition.presentationControls.advance();
    if (released.isErr())
      throw new Error(`Expected Continue to succeed: ${released.error.reason}.`);
    await waitForCondition(() => layerB.dataset["layerState"] === "active");
    expectExclusiveLayer(layerB, layerA);
    expect(composition.presentationControls.getSnapshot().position).toEqual({
      timeMs: 1_000,
      side: "after-actions",
    });
  });
});

interface RegionFixture {
  readonly surfaceId: SurfaceId;
  readonly regionId: EmbeddedNodeId;
  readonly layerAId: EmbeddedNodeId;
  readonly layerBId: EmbeddedNodeId;
  readonly aLateId: EmbeddedNodeId;
  readonly aCalloutId: EmbeddedNodeId;
  readonly aSimultaneousId: EmbeddedNodeId;
  readonly aExitId: EmbeddedNodeId;
  readonly aUntimedId: EmbeddedNodeId;
  readonly bTextId: EmbeddedNodeId;
  readonly bCalloutId: EmbeddedNodeId;
  readonly timelineIds: Readonly<{
    switchToB: EmbeddedDataId;
    switchToA: EmbeddedDataId;
    revealCallout: EmbeddedDataId;
    revealSimultaneous: EmbeddedDataId;
    revealLate: EmbeddedDataId;
    hideExit: EmbeddedDataId;
    wait: EmbeddedDataId;
    revealBCallout: EmbeddedDataId;
  }>;
}

interface MountedRegionFixture extends RegionFixture {
  readonly editor: TiptapEditor;
}

async function mountRegionTracer(): Promise<MountedRegionFixture> {
  const surfaceId = createEmbeddedNodeId() as SurfaceId;
  const fixture = regionDocument(surfaceId);
  const structure = projectCourseStructure(fixture.content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a projected Slideshow Region fixture.");
  }
  const readiness = checkRuntimeDocumentReadiness(
    fixture.content,
    runtimeComposition,
    coreProductAccess,
  );
  if (readiness.status !== "supported") {
    throw new Error(`Expected a supported Region fixture, received ${readiness.status}.`);
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
        autoPlayPresentation={false}
        surfaceRuntimeProgramSource={(requestedSurfaceId) =>
          requestedSurfaceId === surfaceId
            ? {
                presentation: { timeline: compiledTimeline(fixture), autoAdvance: false },
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
    () =>
      editor &&
      compositionProbe.current?.presentationVisualRuntime &&
      requiredLayerOrNull(fixture.layerAId)?.dataset["layerState"] === "active",
  );
  await nextFrame();
  if (!editor) throw new Error("Expected the production runtime editor.");
  return Object.freeze({ ...fixture, editor });
}

function regionDocument(surfaceId: SurfaceId): RegionFixture & { readonly content: JSONContent } {
  const ids = {
    surfaceId,
    regionId: createEmbeddedNodeId(),
    layerAId: createEmbeddedNodeId(),
    layerBId: createEmbeddedNodeId(),
    aLateId: createEmbeddedNodeId(),
    aCalloutId: createEmbeddedNodeId(),
    aSimultaneousId: createEmbeddedNodeId(),
    aExitId: createEmbeddedNodeId(),
    aUntimedId: createEmbeddedNodeId(),
    bTextId: createEmbeddedNodeId(),
    bCalloutId: createEmbeddedNodeId(),
    timelineIds: Object.freeze({
      switchToB: createEmbeddedDataId(),
      switchToA: createEmbeddedDataId(),
      revealCallout: createEmbeddedDataId(),
      revealSimultaneous: createEmbeddedDataId(),
      revealLate: createEmbeddedDataId(),
      hideExit: createEmbeddedDataId(),
      wait: createEmbeddedDataId(),
      revealBCallout: createEmbeddedDataId(),
    }),
  } satisfies RegionFixture;
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Region Layer playback",
  });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") throw new Error("Expected a Course Document.");
  const courseSection = courseDocument.content?.find((node) => node.type === "courseSection");
  if (!courseSection) throw new Error("Expected a Course Section.");
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  assignMissingIds(surface);
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected the slide-content main Region.");
  region.attrs = { ...region.attrs, id: ids.regionId };
  region.content = [
    createLayerWithContent(
      [
        callout(ids.aLateId, "Delayed first block", longText("Delayed first body")),
        callout(ids.aCalloutId, "Simultaneous callout", longText("Callout body")),
        callout(
          ids.aSimultaneousId,
          "Simultaneous supporting block",
          "This enters with the callout above.",
        ),
        callout(
          ids.aExitId,
          "Exit-only block",
          "This begins available and remains in reserved flow after exit.",
        ),
        paragraphWithLink(
          ids.aUntimedId,
          longText("Untimed scrollable paragraph"),
          "#region-manual-hold",
        ),
      ],
      { createId: () => ids.layerAId },
    ),
    createLayerWithContent(
      [
        paragraph(ids.bTextId, longText("Layer B untimed paragraph")),
        callout(ids.bCalloutId, "Layer B callout", longText("Layer B body")),
      ],
      { createId: () => ids.layerBId },
    ),
  ];
  assignMissingIds(surface);
  const configuration = portableConfiguration(ids);
  courseDocument.attrs = { ...courseDocument.attrs, presentation: configuration };
  courseDocument.content = [courseSection, surface];
  return Object.freeze({ ...ids, content });
}

function portableConfiguration(fixture: RegionFixture): PresentationConfigurationV1 {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [
      {
        surfaceId: fixture.surfaceId,
        durationMs: 2_300,
        layerTracks: [
          {
            ownerId: fixture.regionId,
            initialLayerId: fixture.layerAId,
            switches: [
              { id: fixture.timelineIds.switchToB, atMs: 1_000, layerId: fixture.layerBId },
              { id: fixture.timelineIds.switchToA, atMs: 1_800, layerId: fixture.layerAId },
            ],
          },
        ],
        actions: portableActions(fixture),
      },
    ],
  };
}

function portableActions(fixture: RegionFixture) {
  return [
    reveal(fixture.timelineIds.revealCallout, fixture.aCalloutId, 200, 200),
    reveal(fixture.timelineIds.revealSimultaneous, fixture.aSimultaneousId, 200, 200),
    reveal(fixture.timelineIds.revealLate, fixture.aLateId, 600, 200),
    hide(fixture.timelineIds.hideExit, fixture.aExitId, 700, 600),
    {
      kind: "manual-wait" as const,
      id: fixture.timelineIds.wait,
      isEnabled: true,
      atMs: 1_000,
      boundary: "before-actions" as const,
    },
    reveal(fixture.timelineIds.revealBCallout, fixture.bCalloutId, 1_200, 200),
  ];
}

function compiledTimeline(fixture: RegionFixture): CompiledSurfacePresentationTimeline {
  const configuration = portableConfiguration(fixture).surfaces[0]!;
  const layerTrack = Object.freeze({
    ownerId: fixture.regionId,
    initialLayerId: fixture.layerAId,
    switches: Object.freeze(configuration.layerTracks[0]!.switches),
  });
  const targets = [
    [fixture.aCalloutId, "withheld"],
    [fixture.aSimultaneousId, "withheld"],
    [fixture.aLateId, "withheld"],
    [fixture.aExitId, "visible"],
    [fixture.bCalloutId, "withheld"],
  ] as const;
  return Object.freeze({
    surfaceId: fixture.surfaceId,
    durationMs: configuration.durationMs,
    transition: null,
    layerTracks: Object.freeze([layerTrack]),
    layerTrackByOwnerId: new Map([[fixture.regionId, layerTrack]]),
    cues: Object.freeze([]),
    waits: Object.freeze([
      Object.freeze({
        kind: "manual-wait" as const,
        id: fixture.timelineIds.wait,
        atMs: 1_000,
        boundary: "before-actions" as const,
      }),
    ]),
    visualProgram: Object.freeze({
      surfaceId: fixture.surfaceId,
      durationMs: configuration.durationMs,
      targetById: new Map(
        targets.map(([targetId, initialVisibility]) => [
          targetId,
          Object.freeze({ targetId, initialVisibility }),
        ]),
      ),
      segments: Object.freeze([
        visualSegment(fixture.timelineIds.revealCallout, fixture.aCalloutId, 200, 200, "reveal"),
        visualSegment(
          fixture.timelineIds.revealSimultaneous,
          fixture.aSimultaneousId,
          200,
          200,
          "reveal",
        ),
        visualSegment(fixture.timelineIds.revealLate, fixture.aLateId, 600, 200, "reveal"),
        visualSegment(fixture.timelineIds.hideExit, fixture.aExitId, 700, 600, "hide"),
        visualSegment(fixture.timelineIds.revealBCallout, fixture.bCalloutId, 1_200, 200, "reveal"),
      ]),
    }),
  });
}

function reveal(id: EmbeddedDataId, targetId: EmbeddedNodeId, atMs: number, durationMs: number) {
  return visualAction(id, targetId, atMs, durationMs, "reveal");
}

function hide(id: EmbeddedDataId, targetId: EmbeddedNodeId, atMs: number, durationMs: number) {
  return visualAction(id, targetId, atMs, durationMs, "hide");
}

function visualAction(
  id: EmbeddedDataId,
  targetId: EmbeddedNodeId,
  atMs: number,
  durationMs: number,
  kind: "reveal" | "hide",
) {
  return {
    kind: "animate" as const,
    id,
    targetId,
    isEnabled: true,
    atMs,
    visual: {
      kind,
      transition: {
        kind: "fade" as const,
        durationMs,
        easing: { kind: "preset" as const, preset: "linear" as const },
      },
    },
  };
}

function visualSegment(
  id: EmbeddedDataId,
  targetId: EmbeddedNodeId,
  startMs: number,
  durationMs: number,
  kind: "reveal" | "hide",
) {
  return Object.freeze({
    id,
    targetId,
    startMs,
    endMs: startMs + durationMs,
    visual: Object.freeze({
      kind,
      transition: Object.freeze({
        kind: "fade" as const,
        durationMs,
        easing: Object.freeze({ kind: "preset" as const, preset: "linear" as const }),
      }),
    }),
  });
}

function paragraph(id: EmbeddedNodeId, text: string): JSONContent {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

function paragraphWithLink(id: EmbeddedNodeId, text: string, href: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    content: [
      { type: "text", text },
      { type: "hardBreak" },
      {
        type: "text",
        text: "Continue reading this active composition",
        marks: [{ type: "link", attrs: { href } }],
      },
    ],
  };
}

function callout(id: EmbeddedNodeId, title: string, prompt: string): JSONContent {
  return {
    type: "callout",
    attrs: { id, data: emptyCalloutData() },
    content: [
      { type: "callout_title", content: [paragraph(createEmbeddedNodeId(), title)] },
      { type: "callout_prompt", content: [paragraph(createEmbeddedNodeId(), prompt)] },
    ],
  };
}

function longText(prefix: string): string {
  return `${prefix}: ${"responsive reserved content ".repeat(70)}`;
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
  side: "before-actions" | "after-actions" = "after-actions",
): Promise<void> {
  const result = await composition.seek(timeMs);
  if (result.isErr()) throw new Error(`Expected Seek to succeed: ${result.error.reason}.`);
  expect(result.value).toMatchObject({
    kind: "applied",
    position: { timeMs, side },
  });
  await nextFrame();
}

function semanticOptions() {
  return { origin: "configured-presentation" as const };
}

function positionsWithinScroll(
  scroll: HTMLElement,
  ...elements: readonly HTMLElement[]
): readonly number[] {
  const scrollTop = scroll.scrollTop;
  const ownerTop = scroll.getBoundingClientRect().top;
  const ownerPositions = elements.map(
    (element) => element.getBoundingClientRect().top - ownerTop + scrollTop,
  );
  const firstPosition = ownerPositions[0] ?? 0;
  return Object.freeze(ownerPositions.map((position) => position - firstPosition));
}

function expectPositionsWithinScroll(
  scroll: HTMLElement,
  expected: readonly number[],
  ...elements: readonly HTMLElement[]
): void {
  const actual = positionsWithinScroll(scroll, ...elements);
  expect(actual).toHaveLength(expected.length);
  actual.forEach((position, index) =>
    expect(
      position,
      `reserved position ${index}: ${JSON.stringify({ expected, actual })}`,
    ).toBeCloseTo(expected[index]!, 1),
  );
}

function expectExclusiveLayer(active: HTMLElement, inactive: HTMLElement): void {
  expect(active.dataset["layerState"]).toBe("active");
  expect(active.hidden).toBe(false);
  expect(active).not.toHaveAttribute("inert");
  expect(inactive.dataset["layerState"]).toBe("inactive");
  expect(inactive.hidden).toBe(true);
  expect(inactive).toHaveAttribute("inert");
  expect(inactive).toHaveAttribute("aria-hidden", "true");
  expect(host?.querySelectorAll('[data-node="layer"][data-layer-state="active"]')).toHaveLength(1);
}

function requiredLayer(layerId: EmbeddedNodeId): HTMLElement {
  const layer = requiredLayerOrNull(layerId);
  if (!layer) throw new Error(`Expected Layer ${layerId}.`);
  return layer;
}

function requiredLayerOrNull(layerId: EmbeddedNodeId): HTMLElement | null {
  return host?.querySelector<HTMLElement>(`[data-layer-id="${layerId}"]`) ?? null;
}

function requiredTarget(targetId: EmbeddedNodeId): HTMLElement {
  return requiredElement(host!, `[data-presentation-target-id="${targetId}"]`);
}

function paragraphByText(prefix: string): HTMLParagraphElement {
  const paragraph = Array.from(host?.querySelectorAll<HTMLParagraphElement>("p") ?? []).find(
    (candidate) => candidate.textContent?.startsWith(prefix),
  );
  if (!paragraph) throw new Error(`Expected paragraph beginning "${prefix}".`);
  return paragraph;
}

function requiredElement<T extends Element>(rootNode: ParentNode, selector: string): T {
  const element = rootNode.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const startedAt = performance.now();
  while (!condition()) {
    if (performance.now() - startedAt > 4_000) throw new Error("Timed out waiting for condition.");
    await nextFrame();
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function installReducedMotionPreference(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
  const original = window.matchMedia.bind(window);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value(query: string): MediaQueryList {
      if (query !== "(prefers-reduced-motion: reduce)") return original(query);
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => true,
      };
    },
  });
  return () => {
    if (descriptor) Object.defineProperty(window, "matchMedia", descriptor);
  };
}
