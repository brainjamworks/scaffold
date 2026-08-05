import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { createRoot } from "react-dom/client";
import { useLayoutEffect } from "react";

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
  getResult(): string;
  getResponseOrder(): string[];
  getActivationAreas(): HTMLElement[];
  getFullscreenControl(): HTMLButtonElement | null;
  setCanvasTransform(transform: string): void;
  disconnectEnvironment(): void;
  waitForEnvironment(status: "pending" | "ready"): Promise<void>;
  waitForResult(result: "dropped" | "cancelled"): Promise<void>;
  dispose(): void;
}

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
  const root = createRoot(host);
  const initialContent = runtimeDragDocument(options.surface);
  root.render(
    createAssessmentRuntimeTestRoot({
      children:
        options.surface === "page" ? (
          <PagePlayer
            composition={createRuntimeDragComposition(harnessId)}
            initialContent={initialContent}
            surfaceId="runtime-drag-harness"
            onRendererReady={(readyEditor) => {
              editor = readyEditor;
            }}
          />
        ) : (
          <SlideshowPlayer
            composition={createRuntimeDragComposition(harnessId)}
            initialContent={initialContent}
            surfaceIds={["runtime-drag-harness"]}
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
  await waitFor(ownerWindow, () => player.querySelector('[data-drag-environment][data-status="ready"]') !== null);
  await new Promise<void>((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));

  if (options.surface === "slideshow") {
    player.style.width = `${width}px`;
    player.style.height = `${height}px`;
    player.style.minHeight = "0";
    const viewport = player.querySelector<HTMLElement>(".sc-slideshow-player__viewport");
    if (viewport) viewport.style.padding = "0";
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
    getEnvironment: () => {
      const element = player.querySelector<HTMLElement>("[data-drag-environment]");
      return {
        status: element?.dataset.status ?? "missing",
        reason: element?.dataset.reason,
        ownerDocument,
        ownerWindow,
        positionStrategy: element?.dataset.positionStrategy,
      };
    },
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
    getResult: () =>
      harnessResult(player),
    getResponseOrder: () => {
      const response = localAssessmentResponse(
        assessmentStore,
        "artifact:artifact-1/block:seq-1",
      );
      return Array.isArray(response?.order) ? response.order.map(String) : [];
    },
    getActivationAreas: () =>
      Array.from(player.querySelectorAll<HTMLElement>("[data-interaction-drag-activation-area]")),
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
      await waitFor(
        ownerWindow,
        () =>
          player.querySelector<HTMLElement>(`[data-drag-environment][data-status="${status}"]`) !==
          null,
      );
    },
    waitForResult: async (expected) => {
      await waitFor(ownerWindow, () =>
        expected === "dropped"
          ? localAssessmentResponse(assessmentStore, "artifact:artifact-1/block:seq-1")?.order !==
            undefined
          : !player.querySelector("[data-interaction-drag-placeholder]"),
      );
    },
    dispose: () => {
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
  const content = createScaffoldDocumentContent({ mode, surfaceId: "runtime-drag-harness" });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Runtime drag harness document is incomplete.");
  courseDocument.attrs = { ...courseDocument.attrs, mode };
  const block = sequencingRuntimeBlock();
  const surface = courseDocument.content?.[0];
  if (surface) {
    if (mode === "page") {
      surface.content = [block];
    } else {
      surface.attrs = { ...surface.attrs, variant: "slide-content" };
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

function createRuntimeDragComposition(harnessId: string) {
  const composition = createCoreScaffoldRuntimeComposition();
  const bindings = builtInSurfaceRuntimeViewBindings.map((binding) =>
    binding.variantId === "page-default" ||
    binding.variantId === "slide-cover" ||
    binding.variantId === "slide-content"
      ? {
          ...binding,
          component: (props: SurfaceRuntimeViewProps) =>
            RuntimeDragSurface({ ...props, harnessId }),
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

function RuntimeDragSurface({ harnessId }: SurfaceRuntimeViewProps & { harnessId: string }) {
  const environment = useInteractionDragEnvironmentResolution();

  useLayoutEffect(() => {
    if (environment.status !== "ready") return;
    const host = environment.environment.overlayHost;
    host.dataset.runtimeDragHarnessId = harnessId;
    return () => {
      if (host.dataset.runtimeDragHarnessId === harnessId) {
        delete host.dataset.runtimeDragHarnessId;
      }
    };
  }, [environment, harnessId]);

  return (
    <NodeViewWrapper
      data-drag-environment=""
      data-status={environment.status}
      data-reason={environment.status === "pending" ? environment.reason : undefined}
      data-position-strategy={
        environment.status === "ready" ? environment.environment.positionStrategy : undefined
      }
      style={{ position: "relative", minHeight: "200px", padding: "24px" }}
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function harnessResult(player: HTMLElement): string {
  return player.querySelector("[data-interaction-drag-placeholder]") ? "dragging" : "idle";
}
