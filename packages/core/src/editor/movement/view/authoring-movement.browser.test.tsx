import { fireEvent } from "@testing-library/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import {
  createTimelineContent,
  TIMELINE_ITEM_NODE,
} from "@/editor/blocks/presentation/timeline/content";
import { TimelineAuthoringExtension } from "@/editor/blocks/presentation/timeline/timeline-authoring-extension";
import { timelineBlockDefinition } from "@/editor/blocks/presentation/timeline/timeline-definition";
import { emptyResourceLinkData } from "@/editor/blocks/resources/resource-link/content";
import { ResourceLinkAuthoringExtension } from "@/editor/blocks/resources/resource-link/resource-link-authoring-extension";
import { resourceLinkBlockDefinition } from "@/editor/blocks/resources/resource-link/resource-link-definition";
import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import { EditorFloatingPopover } from "@/editor/interactions/floating/EditorFloatingPopover";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import "@/styles/globals.css";

import { ContainedMovementHandle } from "./ContainedMovementHandle";
import { EditorMovementLayer } from "./EditorMovementLayer";
import {
  AuthoringMovementSnapshotPreview,
  captureAuthoringMovementSnapshot,
} from "./authoring-movement-presentation";

const TEST_BLOCK = "authoring_movement_browser_block";
const blockRegistry = createBlockRegistry([
  defineBlock({ nodeType: TEST_BLOCK }),
  resourceLinkBlockDefinition,
  timelineBlockDefinition,
]);
const surfaceVariants = createSurfaceVariantRegistry([pageDefaultSurfaceDefinition]);

const TestBlockNode = Node.create({
  name: TEST_BLOCK,
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-authoring-movement-browser-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        ...courseBlockAuthoringFrameAttributes({
          blockId: node.attrs["id"],
          nodeType: TEST_BLOCK,
        }),
        "data-authoring-movement-browser-block": "",
        style:
          "box-sizing: border-box; height: 80px; margin-bottom: 24px; width: 320px; border: 1px solid transparent",
      },
      [
        "span",
        {
          id: `live-block-label-${String(node.attrs["id"] ?? "missing")}`,
          "data-test-snapshot-content": "",
        },
        `Block ${String(node.attrs["id"] ?? "missing")}`,
        [
          "span",
          {
            "data-test-snapshot-nested-visible": "",
            style: "visibility: visible",
          },
          "Nested content",
        ],
      ],
      [
        "input",
        {
          id: `live-block-control-${String(node.attrs["id"] ?? "missing")}`,
          "data-test-snapshot-control": "",
          onclick: "window.__scaffoldSnapshotControlActivated = true",
          tabindex: "0",
          value: "Recognizable control",
        },
      ],
      [
        "button",
        {
          "data-authoring-movement-snapshot-chrome": "",
          "data-test-snapshot-excluded": "",
          type: "button",
        },
        "Authoring action",
      ],
    ];
  },
});

interface MovementBrowserHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly ownerRoot: HTMLElement;
  readonly rendered: RenderResult;
  block(id: string): HTMLElement;
  blockHandle(): HTMLButtonElement;
  dndAnnouncement(): HTMLElement;
  ids(): string[];
  indicator(): HTMLElement | null;
  movementStatus(): HTMLElement;
  overlay(): HTMLElement | null;
  surfaceBlockIds(surfaceId: string): string[];
  waitForIdle(): Promise<void>;
}

const mounted: MovementBrowserHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("authoring movement shared drag", () => {
  it("reveals and drops on another slide while a stationary pointer auto-scrolls", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const before = harness.ids();
    const source = harness.blockHandle();
    const sourceElement = harness.block("a");
    const handleRectBefore = source.getBoundingClientRect();
    const sourceRectBefore = sourceElement.getBoundingClientRect();
    const rootRect = harness.ownerRoot.getBoundingClientRect();
    const pointer = {
      x: rootRect.left + 220,
      y: rootRect.bottom - 10,
    };
    expect(isVisibleWithin(harness.block("c"), harness.ownerRoot)).toBe(false);

    const forwardIndicatorGeometry = waitForSameTargetIndicatorGeometry(harness);
    await startPointerDrag(source, pointer);
    const initialKey = await waitForValue(() => harness.indicator()?.dataset.movementTargetKey);
    expect(source).not.toHaveAttribute("data-interaction-drag-placeholder");
    expect(sourceElement).toHaveAttribute("data-authoring-movement-silhouette");
    expect(
      getComputedStyle(requiredElement(sourceElement, "[data-test-snapshot-content]")),
    ).toHaveProperty("visibility", "hidden");
    expect(
      getComputedStyle(requiredElement(sourceElement, "[data-test-snapshot-nested-visible]")),
    ).toHaveProperty("visibility", "hidden");
    const sourceRectDuring = sourceElement.getBoundingClientRect();
    expectClose(sourceRectDuring.width, sourceRectBefore.width, 0.5);
    expectClose(sourceRectDuring.height, sourceRectBefore.height, 0.5);

    const overlay = requiredElement<HTMLElement>(harness.host, "[data-interaction-drag-overlay]");
    const snapshot = requiredElement<HTMLElement>(overlay, "[data-authoring-movement-snapshot]");
    const overlayRect = overlay.getBoundingClientRect();
    const activationPoint = {
      x: handleRectBefore.left + handleRectBefore.width / 2,
      y: handleRectBefore.top + handleRectBefore.height / 2,
    };
    expect(snapshot).toHaveAttribute("aria-hidden", "true");
    expect(snapshot).toHaveAttribute("inert");
    expect(snapshot.textContent).toContain("Block a");
    expect(snapshot.querySelector("[data-test-snapshot-excluded]")).toBeNull();
    expect(snapshot.querySelector("[id]")).toBeNull();
    const snapshotControl = requiredElement<HTMLInputElement>(
      snapshot,
      "[data-test-snapshot-control]",
    );
    expect(snapshotControl.value).toBe("Recognizable control");
    expect(snapshotControl.tabIndex).toBe(-1);
    expect(snapshotControl).not.toHaveAttribute("onclick");
    expect(Number.parseFloat(overlay.style.width)).toBeCloseTo(280, 1);
    expect(Number.parseFloat(overlay.style.height)).toBeCloseTo(70, 1);
    expect(overlay.style.overflow).toBe("visible");
    expectClose(overlayRect.left, sourceRectBefore.left + pointer.x - activationPoint.x, 1);
    expectClose(overlayRect.top, sourceRectBefore.top + pointer.y - activationPoint.y, 1);

    await Promise.all([
      waitFor(() => isComfortablyVisibleWithin(harness.block("c"), harness.ownerRoot, 48)),
      forwardIndicatorGeometry,
    ]);
    const stationaryKey = await waitForValue(() => {
      const key = harness.indicator()?.dataset.movementTargetKey;
      return key && key !== initialKey ? key : undefined;
    });
    expect(stationaryKey).not.toBe(initialKey);

    await movePointer({
      x: rootRect.left + rootRect.width / 2,
      y: rootRect.top + rootRect.height / 2,
    });
    await waitForScrollStability(harness.ownerRoot);
    const target = harness.block("c");
    const targetRect = target.getBoundingClientRect();
    const dropPoint = {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height * 0.75,
    };
    await movePointer(dropPoint);
    expect(harness.indicator()).toHaveAttribute(
      "data-movement-target-key",
      expect.stringContaining(":c"),
    );
    expectIndicatorAt(harness, target);

    await finishPointerDrag(dropPoint);
    await harness.waitForIdle();

    expect(harness.surfaceBlockIds("surface00001")).toEqual(["a2"]);
    expect(harness.surfaceBlockIds("surface00003")).toEqual(["c", "a", "c2"]);
    expect(harness.ids().filter((id) => id === "a")).toHaveLength(1);
    expect(harness.ids()).not.toEqual(before);
    expectNoTransientMovementState(harness);
  });

  it("creates one inert no-upscale snapshot and freezes generic controls and media", async () => {
    await page.viewport(900, 700);
    const sourceHost = document.createElement("div");
    const previewHost = document.createElement("div");
    const source = document.createElement("section");
    source.id = "snapshot-source";
    source.setAttribute("aria-labelledby", "snapshot-label");
    source.style.cssText =
      "position: absolute; left: 24px; top: 24px; box-sizing: border-box; width: 140px; height: 100px; overflow: visible; color: rgb(12, 34, 56); background: rgb(240, 241, 242)";

    const label = document.createElement("label");
    label.id = "snapshot-label";
    label.htmlFor = "snapshot-input";
    label.textContent = "Frozen presentation";
    const input = document.createElement("input");
    input.id = "snapshot-input";
    input.setAttribute("aria-describedby", "snapshot-label");
    input.setAttribute("list", "snapshot-list");
    input.value = "Recognizable input";
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("onclick", "window.__scaffoldSnapshotInlineActivated = true");
    button.textContent = "Recognizable button";
    let liveButtonActivations = 0;
    button.addEventListener("click", () => {
      liveButtonActivations += 1;
    });
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.textContent = "Editable live content";
    const animated = document.createElement("span");
    animated.textContent = "Captured once";
    animated.style.animation = "snapshot-motion 2s linear infinite";
    animated.style.transition = "opacity 3s linear";
    const image = document.createElement("img");
    image.alt = "Static presentation";
    image.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2'%3E%3Crect width='2' height='2' fill='red'/%3E%3C/svg%3E";
    const video = document.createElement("video");
    video.autoplay = true;
    video.controls = true;
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.controls = true;
    const frame = document.createElement("iframe");
    frame.srcdoc = "<button autofocus>Live frame</button>";
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "rgb(255, 0, 0)";
      context.fillRect(0, 0, 2, 2);
    }
    const excluded = document.createElement("button");
    excluded.setAttribute("data-authoring-movement-snapshot-chrome", "");
    excluded.textContent = "Authoring chrome";
    source.append(
      label,
      input,
      button,
      editable,
      animated,
      image,
      video,
      audio,
      frame,
      canvas,
      excluded,
    );
    sourceHost.append(source);
    document.body.append(sourceHost, previewHost);

    const captured = captureAuthoringMovementSnapshot(source);
    expect(captured).not.toBeNull();
    if (!captured) throw new Error("Expected an authoring movement snapshot.");
    expect(captured.scale).toBe(1);
    expect(captured.width).toBe(140);
    expect(captured.height).toBe(100);
    expect(captured.element.isConnected).toBe(false);
    animated.textContent = "Changed after capture";

    const rendered = await renderBrowserReact(
      <AuthoringMovementSnapshotPreview snapshot={captured} />,
      { baseElement: document.body, container: previewHost },
    );
    try {
      await animationFrames(2);
      const preview = requiredElement<HTMLElement>(
        previewHost,
        "[data-authoring-movement-snapshot]",
      );
      const clone = captured.element;
      expect(preview.getBoundingClientRect().width).toBeCloseTo(140, 1);
      expect(preview.getBoundingClientRect().height).toBeCloseTo(100, 1);
      expect(preview.style.overflow).toBe("visible");
      expect(clone).toHaveAttribute("aria-hidden", "true");
      expect(clone).toHaveAttribute("inert");
      expect(getComputedStyle(clone).pointerEvents).toBe("none");
      expect(clone.textContent).toContain("Captured once");
      expect(clone.textContent).not.toContain("Changed after capture");
      expect(clone.querySelector("[data-authoring-movement-snapshot-chrome]")).toBeNull();
      expect(clone.querySelector("[id]")).toBeNull();
      for (const attribute of [
        "aria-controls",
        "aria-describedby",
        "aria-labelledby",
        "for",
        "form",
        "headers",
        "list",
      ]) {
        expect(clone.querySelector(`[${attribute}]`)).toBeNull();
      }

      const clonedInput = requiredElement<HTMLInputElement>(clone, "input");
      const clonedButton = requiredElement<HTMLButtonElement>(clone, "button");
      const clonedEditable = requiredElement<HTMLElement>(clone, "div");
      expect(clonedInput.value).toBe("Recognizable input");
      expect(clonedInput.tabIndex).toBe(-1);
      expect(clonedButton.tabIndex).toBe(-1);
      expect(clonedButton).not.toHaveAttribute("onclick");
      expect(clonedEditable.contentEditable).toBe("false");
      clonedButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(liveButtonActivations).toBe(0);

      const clonedAnimated = requiredElement<HTMLElement>(clone, "span");
      expect(getComputedStyle(clonedAnimated).animationName).toBe("none");
      expect(durationsAreZero(getComputedStyle(clonedAnimated).transitionDuration)).toBe(true);
      expect(requiredElement<HTMLImageElement>(clone, "img").getAttribute("src")).toBe(
        image.getAttribute("src"),
      );
      for (const media of clone.querySelectorAll<HTMLMediaElement>("audio, video")) {
        expect(media.autoplay).toBe(false);
        expect(media.preload).toBe("none");
        expect(media.paused).toBe(true);
      }
      const clonedFrame = requiredElement<HTMLIFrameElement>(clone, "iframe");
      expect(clonedFrame).not.toHaveAttribute("src");
      expect(clonedFrame).not.toHaveAttribute("srcdoc");
      expect(clonedFrame).toHaveAttribute("sandbox", "");
      const clonedCanvas = requiredElement<HTMLCanvasElement>(clone, "canvas");
      expect(clonedCanvas.width).toBe(2);
      expect(clonedCanvas.height).toBe(2);
      expect(clonedCanvas.getContext("2d")?.getImageData(0, 0, 1, 1).data[0]).toBe(255);

      expect(source.id).toBe("snapshot-source");
      expect(source.getAttribute("aria-labelledby")).toBe("snapshot-label");
      expect(editable.contentEditable).toBe("true");
      expect(video.autoplay).toBe(true);
    } finally {
      await rendered.unmount();
      sourceHost.remove();
      previewHost.remove();
    }
    expect(captured.element.isConnected).toBe(false);
  });

  it("auto-scrolls in both directions and cancels without a document write", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const before = harness.ids();
    const rootRect = harness.ownerRoot.getBoundingClientRect();
    const source = harness.blockHandle();

    const forwardIndicatorGeometry = waitForSameTargetIndicatorGeometry(harness);
    await startPointerDrag(source, {
      x: rootRect.left + 220,
      y: rootRect.bottom - 10,
    });
    await Promise.all([waitFor(() => harness.ownerRoot.scrollTop > 180), forwardIndicatorGeometry]);
    const downwardScroll = harness.ownerRoot.scrollTop;

    const backwardIndicatorGeometry = waitForSameTargetIndicatorGeometry(harness);
    await movePointer({ x: rootRect.left + 220, y: rootRect.top + 10 });
    await Promise.all([
      waitFor(
        () => harness.ownerRoot.scrollTop < downwardScroll - 80,
        () =>
          `backward auto-scroll from ${downwardScroll}; current scrollTop is ${harness.ownerRoot.scrollTop}`,
      ),
      backwardIndicatorGeometry,
    ]);

    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();

    expect(harness.ids()).toEqual(before);
    expectNoTransientMovementState(harness);
  });

  it("rejects an invalid cross-slide drop and clears every transient state", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const before = harness.ids();
    const targetRect = harness.block("a2").getBoundingClientRect();
    await startPointerDrag(harness.blockHandle(), {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height / 2,
    });
    expect(harness.indicator()).not.toBeNull();

    const invalidPoint = { x: -100, y: -100 };
    await movePointer(invalidPoint);
    await waitFor(() => harness.indicator() === null);
    await finishPointerDrag(invalidPoint);
    await harness.waitForIdle();

    expect(harness.ids()).toEqual(before);
    expectNoTransientMovementState(harness);
    harness.ownerRoot.dispatchEvent(new Event("scroll"));
    await animationFrames(2);
    expect(harness.indicator()).toBeNull();
  });

  it("keeps distinct handles and overlay focus outside an active drag", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness({ withOpenOverlay: true });
    mounted.push(harness);
    const source = harness.blockHandle();
    const contained = requiredElement<HTMLButtonElement>(
      harness.ownerRoot,
      '[data-authoring-movement-activation-id="scaffold-contained-movement-browser-contained-choice"]',
    );
    const overlayControl = requiredElement<HTMLButtonElement>(
      harness.host,
      '[data-test-movement-overlay-control=""]',
    );

    expect(harness.host.querySelectorAll("[data-authoring-move-handle]")).toHaveLength(1);
    expect(harness.ownerRoot.querySelectorAll("[data-contained-movement-handle]")).toHaveLength(4);
    expect(source).toHaveAccessibleName("Move block");
    expect(contained).toHaveAccessibleName("Move choice within its group");
    expect(source).toHaveAttribute("aria-roledescription", "draggable");
    expect(contained).toHaveAttribute("aria-roledescription", "draggable");
    expectClose(source.getBoundingClientRect().width, 44, 0.75);
    expectClose(source.getBoundingClientRect().height, 44, 0.75);
    expectClose(contained.getBoundingClientRect().width, 44, 0.75);
    expectClose(contained.getBoundingClientRect().height, 44, 0.75);

    overlayControl.focus({ preventScroll: true });
    harness.editor.view.dispatch(
      harness.editor.state.tr.setMeta("scaffold-authoring-movement-browser", true),
    );
    await animationFrames(2);
    expect(harness.blockHandle()).toBe(source);
    expect(document.activeElement).toBe(overlayControl);
  });

  it("uses the same source snapshot and silhouette for keyboard activation", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const sourceElement = harness.block("a");
    const handle = harness.blockHandle();

    handle.focus({ preventScroll: true });
    await userEvent.keyboard(" ");
    await waitFor(() => harness.overlay());

    expect(sourceElement).toHaveAttribute("data-authoring-movement-silhouette");
    const snapshot = requiredElement<HTMLElement>(
      harness.overlay()!,
      "[data-authoring-movement-snapshot]",
    );
    expect(snapshot.textContent).toContain("Block a");
    expect(snapshot).toHaveAttribute("inert");
    expect(snapshot).toHaveAttribute("aria-hidden", "true");

    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();
    expect(sourceElement).not.toHaveAttribute("data-authoring-movement-silhouette");
    expect(document.activeElement).toBe(handle);
  });

  it("navigates a keyboard destination and commits only when the dnd-kit drag is dropped", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const handle = harness.blockHandle();
    const before = harness.surfaceBlockIds("surface00001");
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    handle.focus({ preventScroll: true });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => harness.overlay());
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => harness.indicator());

    expect(harness.surfaceBlockIds("surface00001")).toEqual(before);
    expect(documentWrites).toBe(0);
    expect(harness.indicator()).toHaveAttribute(
      "data-movement-target-key",
      expect.stringContaining(":a2"),
    );
    expect(harness.movementStatus().textContent).toContain("Destination position 2 of 2");

    await userEvent.keyboard("{Enter}");
    await harness.waitForIdle();

    expect(harness.movementStatus().textContent).toContain("Moved block down");
    expect(harness.surfaceBlockIds("surface00001")).toEqual(["a2", "a"]);
    expect(documentWrites).toBe(1);
    expect(document.activeElement).toBe(handle);
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("cancels a keyboard destination without writing and restores focus with an announcement", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const handle = harness.blockHandle();
    const before = harness.surfaceBlockIds("surface00001");

    handle.focus({ preventScroll: true });
    await userEvent.keyboard(" ");
    await waitFor(() => harness.overlay());
    expect(describedText(handle)).toContain("Press Space or Enter to pick up");
    expect(harness.dndAnnouncement().textContent).toContain("Picked up block");

    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => harness.indicator());
    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();

    expect(harness.surfaceBlockIds("surface00001")).toEqual(before);
    expect(harness.movementStatus().textContent).toContain("Cancelled moving block");
    expect(document.activeElement).toBe(handle);
  });

  it("uses Timeline-owned horizontal arrows and commits its destination on drop", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const timeline = requiredElement<HTMLElement>(harness.ownerRoot, '[data-node="timeline"]');
    await waitFor(
      () => timeline.querySelector("[data-timeline-event]"),
      () => `Timeline authoring events; rendered timeline HTML is ${timeline.innerHTML}`,
    );
    const firstEvent = requiredElement<HTMLElement>(timeline, "[data-timeline-event]");
    const handle = requiredElement<HTMLButtonElement>(
      firstEvent,
      "[data-contained-movement-handle]",
    );
    const activationId = handle.getAttribute("data-authoring-movement-activation-id");
    expect(activationId).toBeTruthy();
    const before = timelineItemTexts(harness.editor);

    handle.focus({ preventScroll: true });
    await userEvent.keyboard(" ");
    await waitFor(() => harness.overlay());
    expect(describedText(handle)).toContain("Arrow Left or Arrow Right");

    await userEvent.keyboard("{ArrowDown}");
    expect(harness.indicator()).toBeNull();
    expect(timelineItemTexts(harness.editor)).toEqual(before);

    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => harness.indicator());
    expect(timelineItemTexts(harness.editor)).toEqual(before);
    expect(harness.movementStatus().textContent).toContain("Destination position 2 of 3");

    await userEvent.keyboard(" ");
    await harness.waitForIdle();
    expect(timelineItemTexts(harness.editor)).toEqual([before[1], before[0], before[2]]);
    expect(harness.movementStatus().textContent).toContain("Moved timeline event right");
    await waitFor(
      () =>
        document.activeElement?.getAttribute("data-authoring-movement-activation-id") ===
        activationId,
      () => "focus restoration to the moved Timeline event",
    );
    expect(document.activeElement).toHaveAttribute(
      "data-authoring-movement-activation-id",
      activationId,
    );
  });

  it("excludes Resource Link authoring chrome while retaining inert authored content", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    await waitFor(
      () => harness.ownerRoot.querySelector(".sc-resource-link__controls"),
      () => `Resource Link authoring controls; owner HTML is ${harness.ownerRoot.innerHTML}`,
    );
    const resourceElement = requiredElement<HTMLElement>(
      harness.ownerRoot,
      '[data-node="resource_link"]',
    );
    resourceElement.scrollIntoView({ block: "center" });
    await animationFrames(2);
    const resourcePos = nodePosByType(harness.editor, "resource_link");
    harness.editor.view.dispatch(
      harness.editor.state.tr.setSelection(
        NodeSelection.create(harness.editor.state.doc, resourcePos),
      ),
    );
    await waitFor(
      () => harness.blockHandle().getAttribute("data-authoring-move-pos") === String(resourcePos),
    );
    const handle = harness.blockHandle();

    handle.focus({ preventScroll: true });
    await userEvent.keyboard(" ");
    await waitFor(() => harness.overlay());
    const snapshot = requiredElement<HTMLElement>(
      harness.overlay()!,
      "[data-authoring-movement-snapshot]",
    );

    expect(snapshot.querySelector(".sc-resource-link__controls")).toBeNull();
    expect(snapshot.querySelector('input[placeholder="https://..."]')).toBeNull();
    expect(snapshot.querySelector('[role="radiogroup"][aria-label="Resource kind"]')).toBeNull();
    expect(snapshot.textContent).toContain("Course guide");
    expect(snapshot.textContent).toContain("Read before starting the course");
    expect(requiredElement(snapshot, ".sc-resource-link__title")).toHaveAttribute(
      "contenteditable",
      "false",
    );
    expect(snapshot).toHaveAttribute("inert");

    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();
  });
});

async function mountMovementHarness({
  withOpenOverlay = false,
}: {
  withOpenOverlay?: boolean;
} = {}): Promise<MovementBrowserHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "position: absolute; left: 120px; top: 32px; width: 720px; height: 700px; padding: 24px; box-sizing: border-box";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.setAttribute("data-authoring-movement-browser-fixture", "");
  ownerRoot.style.cssText =
    "position: relative; width: 640px; height: 240px; padding: 24px 48px; box-sizing: border-box; overflow: auto";
  const fixtureStyles = document.createElement("style");
  fixtureStyles.textContent = `
    [data-authoring-movement-browser-fixture] [data-surface] {
      box-sizing: border-box !important;
      display: block !important;
      height: 420px !important;
      margin-bottom: 48px !important;
      max-height: none !important;
      min-height: 420px !important;
      padding: 32px 40px !important;
      position: relative !important;
      width: 100% !important;
    }
  `;
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(fixtureStyles, ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestBlockNode,
      TimelineAuthoringExtension,
      ResourceLinkAuthoringExtension,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createScaffoldInteractionOwnerExtension(blockRegistry),
    ],
    content: movementDocument(),
  });
  const sourcePos = nodePos(editor, "a");
  const coordinateSpace = createViewportCoordinateSpace({
    getRoot: () => ownerRoot,
    ownerDocument: ownerRoot.ownerDocument,
  });
  const rendered = await renderBrowserReact(
    <InteractionProvider store={getInteractionFacadeStoreForEditor(editor)}>
      <AuthoringOverlayBoundary container={host} ownerRoot={ownerRoot}>
        <InteractionDragEnvironmentProvider
          coordinateRoot={ownerRoot}
          coordinateSpace={coordinateSpace}
        >
          <EditorMovementLayer
            blockDefinitions={blockRegistry}
            editor={editor}
            surfaceVariants={surfaceVariants}
          >
            <EditorContent editor={editor} />
            <ContainedMovementHandle
              getPresentationElement={() => {
                const element = editor.view.nodeDOM(sourcePos);
                return element instanceof HTMLElement ? element : null;
              }}
              label="choice"
              sourceKey="browser-contained-choice"
              sourcePos={sourcePos}
            />
            {withOpenOverlay ? (
              <EditorFloatingPopover.Root open>
                <EditorFloatingPopover.Trigger>Movement overlay</EditorFloatingPopover.Trigger>
                <EditorFloatingPopover.Portal>
                  <EditorFloatingPopover.Content
                    aria-label="Movement overlay"
                    authoringChrome
                    onOpenAutoFocus={(event) => event.preventDefault()}
                  >
                    <button type="button" data-test-movement-overlay-control="">
                      Size control
                    </button>
                  </EditorFloatingPopover.Content>
                </EditorFloatingPopover.Portal>
              </EditorFloatingPopover.Root>
            ) : null}
          </EditorMovementLayer>
        </InteractionDragEnvironmentProvider>
      </AuthoringOverlayBoundary>
    </InteractionProvider>,
    { baseElement: host, container: reactElement },
  );
  editor.view.focus();
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, sourcePos)),
  );
  await waitFor(() => host.querySelector("[data-authoring-move-handle]"));
  await animationFrames(2);

  const harness: MovementBrowserHarness = {
    editor,
    host,
    ownerRoot,
    rendered,
    block: (id) =>
      requiredElement<HTMLElement>(
        ownerRoot,
        `[data-authoring-movement-browser-block][data-id="${id}"]`,
      ),
    blockHandle: () => requiredElement<HTMLButtonElement>(host, "[data-authoring-move-handle]"),
    dndAnnouncement: () =>
      requiredElement<HTMLElement>(document, '[id^="scaffold-dnd-announcement-"]'),
    ids: () => documentIds(editor),
    indicator: () => host.querySelector<HTMLElement>("[data-testid=scaffold-drop-indicator-frame]"),
    movementStatus: () =>
      requiredElement<HTMLElement>(host, "[data-testid=scaffold-movement-status]"),
    overlay: () => host.querySelector<HTMLElement>("[data-interaction-drag-overlay]"),
    surfaceBlockIds: (surfaceId) => blockIdsInSurface(editor, surfaceId),
    waitForIdle: () =>
      waitFor(
        () =>
          !host.querySelector("[data-interaction-drag-overlay]") &&
          !host.querySelector("[data-interaction-drag-placeholder]") &&
          !host.querySelector("[data-testid=scaffold-drop-indicator-frame]"),
      ),
  };
  return harness;
}

function movementDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: [
          surface("surface00001", testBlocks(["a", "a2"])),
          surface("surface00002", [
            createTimelineContent({ presentation: "carousel" }),
            resourceLinkContent(),
          ]),
          surface("surface00003", testBlocks(["c", "c2"])),
        ],
      },
    ],
  };
}

function surface(id: string, content: readonly JSONContent[]): JSONContent {
  return {
    type: "surface",
    attrs: { id, variant: "page-default" },
    content: [...content],
  };
}

function testBlocks(blockIds: readonly string[]): JSONContent[] {
  return blockIds.map((blockId) => ({ type: TEST_BLOCK, attrs: { id: blockId } }));
}

function resourceLinkContent(): JSONContent {
  return {
    type: "resource_link",
    attrs: {
      id: "resource-link-browser",
      data: emptyResourceLinkData({
        kind: "article",
        showDescription: true,
        url: "https://example.com/course-guide",
      }),
    },
    content: [
      {
        type: "resource_link_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Course guide" }] }],
      },
      {
        type: "resource_link_description",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Read before starting the course" }],
          },
        ],
      },
    ],
  };
}

function nodePos(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== TEST_BLOCK || node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found < 0) throw new Error(`Expected movement block ${id}.`);
  return found;
}

function nodePosByType(editor: Editor, typeName: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return true;
    found = pos;
    return false;
  });
  if (found < 0) throw new Error(`Expected movement node ${typeName}.`);
  return found;
}

function timelineItemTexts(editor: Editor): string[] {
  const texts: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === TIMELINE_ITEM_NODE) texts.push(node.textContent);
    return true;
  });
  return texts;
}

function documentIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === TEST_BLOCK && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
  });
  return ids;
}

function blockIdsInSurface(editor: Editor, surfaceId: string): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "surface" || node.attrs["id"] !== surfaceId) return true;
    node.descendants((child) => {
      if (child.type.name === TEST_BLOCK && typeof child.attrs["id"] === "string") {
        ids.push(child.attrs["id"]);
      }
      return true;
    });
    return false;
  });
  return ids;
}

async function startPointerDrag(
  source: HTMLElement,
  destination: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const sourceRect = source.getBoundingClientRect();
  const start = {
    x: sourceRect.left + sourceRect.width / 2,
    y: sourceRect.top + sourceRect.height / 2,
  };
  fireEvent.pointerDown(source, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: start.x + 6,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(1);
  await movePointer(destination);
}

async function movePointer(point: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function finishPointerDrag(pointer: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: pointer.x,
    clientY: pointer.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function waitForScrollStability(scrollRoot: HTMLElement): Promise<void> {
  let previous = scrollRoot.scrollTop;
  let stableFrames = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    await animationFrames(1);
    const current = scrollRoot.scrollTop;
    stableFrames = current === previous ? stableFrames + 1 : 0;
    if (stableFrames >= 3) return;
    previous = current;
  }
  throw new Error("Timed out waiting for production auto-scroll to settle.");
}

function expectIndicatorAt(harness: MovementBrowserHarness, target: HTMLElement): void {
  const indicator = requiredElement<HTMLElement>(
    harness.host,
    "[data-testid=scaffold-drop-indicator-frame]",
  );
  const targetRect = target.getBoundingClientRect();
  expectClose(Number.parseFloat(indicator.style.left), targetRect.left, 1);
  expectClose(Number.parseFloat(indicator.style.top), targetRect.top, 1);
}

async function waitForSameTargetIndicatorGeometry(harness: MovementBrowserHarness): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + 8_000;
    let previous = readIndicatorPresentation(harness);
    let settled = false;
    const samples: Array<ReturnType<typeof readIndicatorPresentation>> = [];
    const observer = new MutationObserver(() => {
      const current = readIndicatorPresentation(harness);
      const lastSample = samples.at(-1);
      if (
        current &&
        (!lastSample || lastSample.key !== current.key || lastSample.top !== current.top)
      ) {
        samples.push(current);
      }
      if (
        previous &&
        current &&
        previous.key === current.key &&
        previous.top !== current.top &&
        current.aligned
      ) {
        settled = true;
        observer.disconnect();
        resolve();
        return;
      }
      previous = current;
    });
    observer.observe(harness.host, {
      attributeFilter: ["style", "data-movement-target-key"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    const checkDeadline = () => {
      if (settled) return;
      if (performance.now() > deadline) {
        settled = true;
        observer.disconnect();
        reject(
          new Error(
            `Timed out waiting for same-target indicator geometry: ${JSON.stringify(samples.slice(-8))}`,
          ),
        );
        return;
      }
      requestAnimationFrame(checkDeadline);
    };
    requestAnimationFrame(checkDeadline);
  });
}

function readIndicatorPresentation(
  harness: MovementBrowserHarness,
): Readonly<{ aligned: boolean; key: string; top: number }> | null {
  const indicator = harness.indicator();
  const key = indicator?.dataset.movementTargetKey;
  const targetId = key?.split(":").at(-1);
  if (!indicator || !key || !targetId) return null;
  const target = harness.ownerRoot.querySelector<HTMLElement>(
    `[data-id="${CSS.escape(targetId)}"]`,
  );
  if (!target) return null;
  const targetRect = target.getBoundingClientRect();
  const left = Number.parseFloat(indicator.style.left);
  const top = Number.parseFloat(indicator.style.top);
  return {
    aligned: Math.abs(left - targetRect.left) <= 1 && Math.abs(top - targetRect.top) <= 1,
    key,
    top,
  };
}

function expectNoTransientMovementState(harness: MovementBrowserHarness): void {
  expect(harness.overlay()).toBeNull();
  expect(harness.indicator()).toBeNull();
  expect(harness.host.querySelector("[data-interaction-drag-placeholder]")).toBeNull();
  expect(harness.host.querySelector("[data-authoring-movement-silhouette]")).toBeNull();
}

function isVisibleWithin(element: Element, container: Element): boolean {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return elementRect.bottom > containerRect.top && elementRect.top < containerRect.bottom;
}

function isComfortablyVisibleWithin(element: Element, container: Element, inset: number): boolean {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return (
    elementRect.top >= containerRect.top + inset &&
    elementRect.bottom <= containerRect.bottom - inset
  );
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}.`);
  return element;
}

function describedText(element: Element): string {
  const ids = element.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [];
  return ids
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

async function waitFor(
  condition: () => unknown,
  timeoutDescription: () => string = () => "movement state",
): Promise<void> {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error(`Timed out waiting for ${timeoutDescription()}.`);
    }
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function waitForValue<T>(read: () => T | null | undefined): Promise<T> {
  let value = read();
  await waitFor(() => {
    value = read();
    return value !== null && value !== undefined;
  });
  return value!;
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function durationsAreZero(value: string): boolean {
  return value.split(",").every((duration) => Number.parseFloat(duration) === 0);
}
