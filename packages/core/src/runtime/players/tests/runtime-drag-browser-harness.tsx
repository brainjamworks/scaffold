import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot } from "react-dom/client";
import { useLayoutEffect, type ComponentType } from "react";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createSurfaceRuntimeViewMap } from "@/editor/surfaces/runtime/surface-runtime-view-registry";
import { builtInSurfaceRuntimeViewBindings } from "@/editor/surfaces/runtime/surface-runtime-views";
import type { SurfaceRuntimeViewProps } from "@/editor/surfaces/runtime/surface-runtime-view-registry";
import { useInteractionDragEnvironmentResolution } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { createScaffoldDocumentContent } from "@/format/artifact";
import {
  createAssessmentRuntimeTestRoot,
  localAssessmentResponse,
} from "@/runtime/assessment/test-utils";

import { PagePlayer } from "../page/PagePlayer";
import { SlideshowPlayer } from "../slideshow/SlideshowPlayer";

const SEQUENCING_PROBLEM_ID = "artifact:artifact-1/block:seq-1";
const MATCHING_PROBLEM_ID = "artifact:artifact-1/block:matching-1";
const CATEGORISE_PROBLEM_ID = "artifact:artifact-1/block:categorise-1";
const RUNTIME_DRAG_SURFACE_ID = "runtime_drag";

export interface RuntimeDragBrowserHarnessOptions {
  readonly interaction?: "categorise" | "matching" | "sequencing";
  readonly surface: "page" | "slideshow";
  readonly ownerDocument?: Document;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
}

export interface RuntimeDragBrowserHarness {
  readonly ownerDocument: Document;
  readonly ownerWindow: Window;
  readonly host: HTMLElement;
  readonly root: HTMLElement;
  readonly player: HTMLElement;
  readonly editor: TiptapEditor;
  getCanvas(): HTMLElement | null;
  getCanvasRect(): DOMRect;
  getEnvironment(): {
    status: string;
    reason?: string;
    ownerDocument?: Document;
    ownerWindow?: Window;
    positionStrategy?: string;
  };
  getOverlayHost(): HTMLElement | null;
  getSource(selector?: string): HTMLElement | null;
  getPlaceholder(selector?: string): HTMLElement | null;
  getTargets(selector?: string): HTMLElement[];
  getResponseOrder(): string[];
  getResponseMatches(): Record<string, string>;
  getResponsePlacements(): Record<string, string>;
  getResponseRevision(): number;
  getActivationAreas(): HTMLElement[];
  getAnnouncements(): string[];
  getFullscreenControl(): HTMLButtonElement | null;
  setPlayerSize(width: number, height: number): void;
  setCanvasTransform(transform: string): void;
  disconnectEnvironment(): void;
  waitForEnvironment(status: "pending" | "ready"): Promise<void>;
  waitForIdle(): Promise<void>;
  waitForResponse(expectedOrder: readonly string[], expectedRevision: number): Promise<void>;
  waitForMatches(
    expectedMatches: Readonly<Record<string, string>>,
    expectedRevision: number,
  ): Promise<void>;
  waitForPlacements(
    expectedPlacements: Readonly<Record<string, string>>,
    expectedRevision: number,
  ): Promise<void>;
  dispose(): void;
}

type RuntimeDragEnvironmentSnapshot = ReturnType<RuntimeDragBrowserHarness["getEnvironment"]>;

export async function mountRuntimeDragHarness(
  options: RuntimeDragBrowserHarnessOptions,
): Promise<RuntimeDragBrowserHarness> {
  const ownerDocument = options.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) throw new Error("Runtime drag harness requires an owner window.");
  const harnessId = `runtime-drag-harness-${Math.random().toString(36).slice(2)}`;
  const interaction = options.interaction ?? "sequencing";
  const problemId =
    interaction === "matching"
      ? MATCHING_PROBLEM_ID
      : interaction === "categorise"
        ? CATEGORISE_PROBLEM_ID
        : SEQUENCING_PROBLEM_ID;

  const host = ownerDocument.createElement("div");
  const scale = options.scale ?? 1;
  const width = options.width ?? (options.surface === "slideshow" ? 1024 * scale : 1024);
  const height = options.height ?? (options.surface === "slideshow" ? 576 * scale : 720);
  host.style.cssText = `width: ${width}px; height: ${height}px; position: relative;`;
  ownerDocument.body.append(host);

  let editor: TiptapEditor | null = null;
  let assessmentStore: Parameters<typeof localAssessmentResponse>[0] = null;
  let environmentSnapshot: RuntimeDragEnvironmentSnapshot = {
    status: "pending",
    reason: "unavailable",
  };
  const composition = createRuntimeDragComposition(harnessId, (snapshot) => {
    environmentSnapshot = snapshot;
  });
  const root = createRoot(host);
  const initialContent = runtimeDragDocument(options.surface, interaction);
  root.render(
    createAssessmentRuntimeTestRoot({
      children:
        options.surface === "page" ? (
          <PagePlayer
            composition={composition}
            initialContent={initialContent}
            surfaceId={RUNTIME_DRAG_SURFACE_ID}
            onRendererReady={(readyEditor) => {
              editor = readyEditor;
            }}
          />
        ) : (
          <SlideshowPlayer
            composition={composition}
            initialContent={initialContent}
            surfaceIds={[RUNTIME_DRAG_SURFACE_ID]}
            sizing="embedded"
            onRendererReady={(readyEditor) => {
              editor = readyEditor;
            }}
          />
        ),
      onStore: (store) => {
        assessmentStore = store;
      },
    }),
  );

  await waitFor(ownerWindow, () => editor !== null && playerFor(host, options.surface) !== null);
  const player = playerFor(host, options.surface);
  if (!player || !editor) throw new Error("Runtime drag harness did not mount its player.");
  await waitFor(ownerWindow, () => environmentSnapshot.status === "ready");
  await new Promise<void>((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));

  if (options.surface === "slideshow") {
    player.style.width = `${width}px`;
    player.style.height = `${height}px`;
    player.style.minHeight = "0";
    const viewport = player.querySelector<HTMLElement>(".sc-slideshow-player__viewport");
    if (viewport) viewport.style.padding = "0";
  }

  await waitFor(ownerWindow, () =>
    interaction === "sequencing"
      ? responseOrder(assessmentStore).length === 3
      : assessmentStore !== null &&
        (interaction === "matching"
          ? player.querySelector("[data-matching-draggable-item][data-item-id]") !== null
          : player.querySelector("[data-interaction-drag-activation-area][data-id]") !== null),
  );
  const responseStore = assessmentStore as NonNullable<
    Parameters<typeof localAssessmentResponse>[0]
  > | null;
  if (!responseStore) throw new Error("Runtime drag harness did not mount its assessment store.");
  let responseRevision = 0;
  const stopResponseObservation = responseStore.subscribe((state, previousState) => {
    if (
      state.durable.problems[problemId]?.response !==
      previousState.durable.problems[problemId]?.response
    ) {
      responseRevision += 1;
    }
  });
  const announcementLog: string[] = [];
  const announcementHost = ownerDocument.querySelector<HTMLElement>(
    `[data-scaffold-overlay-host][data-runtime-drag-harness-id="${harnessId}"]`,
  );
  const announcementObserver = new ownerWindow.MutationObserver(() => {
    const announcement = Array.from(
      announcementHost?.querySelectorAll<HTMLElement>('[role="status"]') ?? [],
    )
      .map((element) => element.textContent?.trim() ?? "")
      .find(Boolean);
    if (announcement && announcementLog.at(-1) !== announcement) {
      announcementLog.push(announcement);
    }
  });
  if (announcementHost) {
    announcementObserver.observe(announcementHost, { childList: true, subtree: true });
  }

  return {
    ownerDocument,
    ownerWindow,
    host,
    root: player,
    player,
    editor,
    getCanvas: () => player.querySelector<HTMLElement>(".sc-slideshow-player__canvas"),
    getCanvasRect: () =>
      player.querySelector<HTMLElement>(".sc-slideshow-player__canvas")?.getBoundingClientRect() ??
      player.getBoundingClientRect(),
    getEnvironment: () => environmentSnapshot,
    getOverlayHost: () =>
      ownerDocument.querySelector<HTMLElement>(
        `[data-scaffold-overlay-host][data-runtime-drag-harness-id="${harnessId}"]`,
      ),
    getSource: (selector = "[data-runtime-sequencing-handle]") =>
      player.querySelector<HTMLElement>(selector),
    getPlaceholder: (selector = "[data-interaction-drag-placeholder]") =>
      player.querySelector<HTMLElement>(selector),
    getTargets: (selector = ".sc-sequencing-item--runtime[data-id]") =>
      Array.from(player.querySelectorAll<HTMLElement>(selector)),
    getResponseOrder: () => responseOrder(assessmentStore),
    getResponseMatches: () => responseMatches(assessmentStore),
    getResponsePlacements: () => responsePlacements(assessmentStore),
    getResponseRevision: () => responseRevision,
    getActivationAreas: () =>
      Array.from(player.querySelectorAll<HTMLElement>("[data-interaction-drag-activation-area]")),
    getAnnouncements: () => [...announcementLog],
    getFullscreenControl: () =>
      player.querySelector<HTMLButtonElement>(".sc-slideshow-player__fullscreen-button"),
    setPlayerSize: (nextWidth, nextHeight) => {
      host.style.width = `${nextWidth}px`;
      host.style.height = `${nextHeight}px`;
      player.style.width = `${nextWidth}px`;
      player.style.height = `${nextHeight}px`;
    },
    setCanvasTransform: (transform) => {
      const canvas = player.querySelector<HTMLElement>(".sc-slideshow-player__canvas");
      if (canvas) canvas.style.transform = transform;
    },
    disconnectEnvironment: () => {
      const hostElement = ownerDocument.querySelector<HTMLElement>(
        `[data-scaffold-overlay-host][data-runtime-drag-harness-id="${harnessId}"]`,
      );
      hostElement?.remove();
    },
    waitForEnvironment: async (status) => {
      await waitFor(ownerWindow, () => environmentSnapshot.status === status);
    },
    waitForIdle: async () => {
      await waitFor(
        ownerWindow,
        () =>
          !player.querySelector("[data-interaction-drag-placeholder]") &&
          !ownerDocument.querySelector(
            `[data-runtime-drag-harness-id="${harnessId}"] [data-interaction-drag-overlay]`,
          ),
      );
    },
    waitForResponse: async (expectedOrder, expectedRevision) => {
      await waitFor(
        ownerWindow,
        () =>
          responseRevision >= expectedRevision &&
          responseOrder(assessmentStore).every((id, index) => id === expectedOrder[index]) &&
          responseOrder(assessmentStore).length === expectedOrder.length,
      );
    },
    waitForMatches: async (expectedMatches, expectedRevision) => {
      await waitFor(
        ownerWindow,
        () =>
          responseRevision >= expectedRevision &&
          sameStringRecord(responseMatches(assessmentStore), expectedMatches),
      );
    },
    waitForPlacements: async (expectedPlacements, expectedRevision) => {
      await waitFor(
        ownerWindow,
        () =>
          responseRevision >= expectedRevision &&
          sameStringRecord(responsePlacements(assessmentStore), expectedPlacements),
      );
    },
    dispose: () => {
      announcementObserver.disconnect();
      stopResponseObservation();
      root.unmount();
      host.remove();
    },
  };
}

function playerFor(
  host: HTMLElement,
  surface: RuntimeDragBrowserHarnessOptions["surface"],
): HTMLElement | null {
  return host.querySelector<HTMLElement>(
    surface === "page" ? ".sc-page-player" : ".sc-slideshow-player",
  );
}

async function waitFor(ownerWindow: Window, predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out mounting runtime drag harness.");
    await new Promise<void>((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));
  }
}

function runtimeDragDocument(
  mode: "page" | "slideshow",
  interaction: "categorise" | "matching" | "sequencing",
): JSONContent {
  const content = createScaffoldDocumentContent({ mode, surfaceId: RUNTIME_DRAG_SURFACE_ID });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Runtime drag harness document is incomplete.");
  courseDocument.attrs = { ...courseDocument.attrs, mode };
  const block =
    interaction === "matching"
      ? matchingRuntimeBlock()
      : interaction === "categorise"
        ? categoriseRuntimeBlock()
        : sequencingRuntimeBlock();
  const surface = courseDocument.content?.[0];
  if (surface) {
    if (mode === "page") {
      surface.content = [block];
    } else {
      surface.attrs = {
        ...surface.attrs,
        variant: "slide-content",
        settings: { slideTitle: { enabled: true } },
      };
      surface.content = [
        { type: "slide_title" },
        { type: "region", attrs: { role: "main" }, content: [block] },
      ];
    }
  }
  return content;
}

function categoriseRuntimeBlock(): JSONContent {
  return {
    type: "categorise",
    attrs: {
      id: "categorise-1",
      assessment: {
        feedbackByItemId: {},
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
      },
    },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
      {
        type: "categorise_content",
        content: [
          {
            type: "categorise_bins_group",
            content: [
              { id: "birds", label: "Birds" },
              { id: "fish", label: "Fish" },
            ].map(({ id, label }) => ({
              type: "categorise_bin",
              attrs: { id },
              content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
            })),
          },
          {
            type: "categorise_items_group",
            content: [
              { id: "eagle", label: "Eagle" },
              { id: "salmon", label: "Salmon" },
            ].map(({ id, label }) => ({
              type: "categorise_item",
              attrs: { id },
              content: [
                {
                  type: "categorise_item_body",
                  content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
                },
              ],
            })),
          },
        ],
      },
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function matchingRuntimeBlock(): JSONContent {
  return {
    type: "matching",
    attrs: {
      id: "matching-1",
      assessment: {
        feedbackByItemId: {},
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
      },
    },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
      {
        type: "matching_pairs_group",
        content: [
          { itemId: "i1", targetId: "t1", item: "Alpha", target: "One" },
          { itemId: "i2", targetId: "t2", item: "Beta", target: "Two" },
        ].map(({ item, itemId, target, targetId }) => ({
          type: "matching_pair",
          attrs: { id: `pair-${itemId}` },
          content: [
            {
              type: "matching_item",
              attrs: { id: itemId },
              content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
            },
            {
              type: "matching_target",
              attrs: { id: targetId },
              content: [{ type: "paragraph", content: [{ type: "text", text: target }] }],
            },
          ],
        })),
      },
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function sequencingRuntimeBlock(): JSONContent {
  return {
    type: "sequencing",
    attrs: {
      id: "seq-1",
      assessment: { correctOrder: ["a", "b", "c"] },
      settings: { feedbackMode: "on_submit", isGraded: true, showAnswer: true, points: 1 },
    },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
      {
        type: "sequencing_items_group",
        content: ["a", "b", "c"].map((id) => ({
          type: "sequencing_item",
          attrs: { id },
          content: [{ type: "paragraph", content: [{ type: "text", text: id.toUpperCase() }] }],
        })),
      },
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function createRuntimeDragComposition(
  harnessId: string,
  onEnvironment: (snapshot: RuntimeDragEnvironmentSnapshot) => void,
) {
  const composition = createCoreScaffoldRuntimeComposition();
  const bindings = builtInSurfaceRuntimeViewBindings.map((binding) =>
    binding.variantId === "page-default" ||
    binding.variantId === "slide-cover" ||
    binding.variantId === "slide-content"
      ? {
          ...binding,
          component: (props: SurfaceRuntimeViewProps) => (
            <RuntimeDragSurface
              {...props}
              SurfaceComponent={binding.component}
              harnessId={harnessId}
              onEnvironment={onEnvironment}
            />
          ),
        }
      : binding,
  );
  return {
    ...composition,
    surfaces: {
      views: createSurfaceRuntimeViewMap({
        registry: composition.capabilities.surfaces.registry,
        bindings,
      }),
    },
  };
}

function RuntimeDragSurface({
  SurfaceComponent,
  harnessId,
  onEnvironment,
  ...props
}: SurfaceRuntimeViewProps & {
  SurfaceComponent: ComponentType<SurfaceRuntimeViewProps>;
  harnessId: string;
  onEnvironment: (snapshot: RuntimeDragEnvironmentSnapshot) => void;
}) {
  const environment = useInteractionDragEnvironmentResolution();

  useLayoutEffect(() => {
    if (environment.status !== "ready") {
      onEnvironment(
        environment.status === "pending"
          ? { status: environment.status, reason: environment.reason }
          : { status: environment.status },
      );
      return;
    }
    const host = environment.environment.overlayHost;
    onEnvironment({
      status: environment.status,
      ownerDocument: environment.environment.ownerDocument,
      ownerWindow: environment.environment.ownerWindow,
      positionStrategy: environment.environment.positionStrategy,
    });
    host.dataset.runtimeDragHarnessId = harnessId;
    return () => {
      if (host.dataset.runtimeDragHarnessId === harnessId) {
        delete host.dataset.runtimeDragHarnessId;
      }
    };
  }, [environment, harnessId, onEnvironment]);

  return <SurfaceComponent {...props} />;
}

function responseOrder(store: Parameters<typeof localAssessmentResponse>[0]): string[] {
  const response = localAssessmentResponse(store, SEQUENCING_PROBLEM_ID);
  return Array.isArray(response?.order) ? response.order.map(String) : [];
}

function responseMatches(
  store: Parameters<typeof localAssessmentResponse>[0],
): Record<string, string> {
  const response = localAssessmentResponse(store, MATCHING_PROBLEM_ID);
  const matches = response?.matches;
  if (!matches || typeof matches !== "object" || Array.isArray(matches)) return {};
  return Object.fromEntries(
    Object.entries(matches).flatMap(([itemId, targetId]) =>
      typeof targetId === "string" ? [[itemId, targetId]] : [],
    ),
  );
}

function responsePlacements(
  store: Parameters<typeof localAssessmentResponse>[0],
): Record<string, string> {
  const response = localAssessmentResponse(store, CATEGORISE_PROBLEM_ID);
  const placements = response?.placements;
  if (!placements || typeof placements !== "object" || Array.isArray(placements)) return {};
  return Object.fromEntries(
    Object.entries(placements).flatMap(([itemId, categoryId]) =>
      typeof categoryId === "string" ? [[itemId, categoryId]] : [],
    ),
  );
}

function sameStringRecord(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): boolean {
  const actualEntries = Object.entries(actual).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([key, value], index) =>
        key === expectedEntries[index]?.[0] && value === expectedEntries[index]?.[1],
    )
  );
}
