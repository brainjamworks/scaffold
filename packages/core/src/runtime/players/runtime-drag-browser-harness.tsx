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

import { PagePlayer } from "./page/PagePlayer";
import { SlideshowPlayer } from "./slideshow/SlideshowPlayer";

const SEQUENCING_PROBLEM_ID = "artifact:artifact-1/block:seq-1";
const RUNTIME_DRAG_SURFACE_ID = "runtime_drag";

export interface RuntimeDragBrowserHarnessOptions {
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
  getResponseRevision(): number;
  getActivationAreas(): HTMLElement[];
  getAnnouncements(): string[];
  getFullscreenControl(): HTMLButtonElement | null;
  setCanvasTransform(transform: string): void;
  disconnectEnvironment(): void;
  waitForEnvironment(status: "pending" | "ready"): Promise<void>;
  waitForIdle(): Promise<void>;
  waitForResponse(expectedOrder: readonly string[], expectedRevision: number): Promise<void>;
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
  const initialContent = runtimeDragDocument(options.surface);
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

  await waitFor(ownerWindow, () => responseOrder(assessmentStore).length === 3);
  const responseStore = assessmentStore as NonNullable<
    Parameters<typeof localAssessmentResponse>[0]
  > | null;
  if (!responseStore) throw new Error("Runtime drag harness did not mount its assessment store.");
  let responseRevision = 0;
  const stopResponseObservation = responseStore.subscribe((state, previousState) => {
    if (
      state.durable.problems[SEQUENCING_PROBLEM_ID]?.response !==
      previousState.durable.problems[SEQUENCING_PROBLEM_ID]?.response
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
    getTargets: (selector = "[data-item-id]") =>
      Array.from(player.querySelectorAll<HTMLElement>(selector)),
    getResponseOrder: () => responseOrder(assessmentStore),
    getResponseRevision: () => responseRevision,
    getActivationAreas: () =>
      Array.from(player.querySelectorAll<HTMLElement>("[data-interaction-drag-activation-area]")),
    getAnnouncements: () => [...announcementLog],
    getFullscreenControl: () =>
      player.querySelector<HTMLButtonElement>(".sc-slideshow-player__fullscreen-button"),
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

function runtimeDragDocument(mode: "page" | "slideshow"): JSONContent {
  const content = createScaffoldDocumentContent({ mode, surfaceId: RUNTIME_DRAG_SURFACE_ID });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Runtime drag harness document is incomplete.");
  courseDocument.attrs = { ...courseDocument.attrs, mode };
  const block = sequencingRuntimeBlock();
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
