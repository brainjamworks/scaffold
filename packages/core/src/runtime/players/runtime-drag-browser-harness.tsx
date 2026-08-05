import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot } from "react-dom/client";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";

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
  getOverlayHost(): HTMLElement | null;
  getSource(selector?: string): HTMLElement | null;
  getPlaceholder(selector?: string): HTMLElement | null;
  getTargets(selector?: string): HTMLElement[];
  dispose(): void;
}

const runtimeComposition = createCoreScaffoldRuntimeComposition();

export async function mountRuntimeDragHarness(
  options: RuntimeDragBrowserHarnessOptions,
): Promise<RuntimeDragBrowserHarness> {
  const ownerDocument = options.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) throw new Error("Runtime drag harness requires an owner window.");

  const host = ownerDocument.createElement("div");
  const scale = options.scale ?? 1;
  const width = options.width ?? (options.surface === "slideshow" ? 1024 * scale : 1024);
  const height = options.height ?? (options.surface === "slideshow" ? 576 * scale : 720);
  host.style.cssText = `width: ${width}px; height: ${height}px; position: relative;`;
  ownerDocument.body.append(host);

  let editor: TiptapEditor | null = null;
  const root = createRoot(host);
  const initialContent = runtimeDragDocument(options.surface);
  root.render(
    createAssessmentRuntimeTestRoot({
      children:
        options.surface === "page" ? (
          <PagePlayer
            composition={runtimeComposition}
            initialContent={initialContent}
            surfaceId="runtime-drag-harness"
            onRendererReady={(readyEditor) => {
              editor = readyEditor;
            }}
          />
        ) : (
          <SlideshowPlayer
            composition={runtimeComposition}
            initialContent={initialContent}
            surfaceIds={["runtime-drag-harness"]}
            onRendererReady={(readyEditor) => {
              editor = readyEditor;
            }}
          />
        ),
    }),
  );

  await waitFor(ownerWindow, () => editor !== null && playerFor(host, options.surface) !== null);
  const player = playerFor(host, options.surface);
  if (!player || !editor) throw new Error("Runtime drag harness did not mount its player.");

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
    getOverlayHost: () => ownerDocument.querySelector<HTMLElement>("[data-scaffold-overlay-host]"),
    getSource: (selector = '[data-drag-source], [data-sortable-source]') =>
      player.querySelector<HTMLElement>(selector),
    getPlaceholder: (selector = '[data-drag-placeholder]') =>
      player.querySelector<HTMLElement>(selector),
    getTargets: (selector = '[data-drop-target], [data-drag-target]') =>
      Array.from(player.querySelectorAll<HTMLElement>(selector)),
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
  return content;
}
