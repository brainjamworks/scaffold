import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR } from "@/editor/movement/view/authoring-contained-reorder-projection";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import "@/styles/globals.css";

import {
  ROADMAP_MILESTONE_NODE,
  ROADMAP_NODE,
  emptyRoadmapData,
  roadmapMilestoneContent,
} from "./content";
import { RoadmapAuthoringExtension } from "./roadmap-authoring-extension";

interface RoadmapAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  handle(index: number): HTMLButtonElement;
  milestoneIdsInDocument(): string[];
  milestonesInDom(): HTMLElement[];
}

const mounted: RoadmapAuthoringHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("authoring Roadmap contained reorder", () => {
  it("projects a horizontal destination locally and commits the document once on keyboard drop", async () => {
    await page.viewport(1000, 800);
    const harness = await mountRoadmapAuthoringHarness("horizontal");
    mounted.push(harness);
    const milestones = harness.milestonesInDom();
    const first = milestones[0];
    const second = milestones[1];
    if (!first || !second) throw new Error("Roadmap reorder requires two milestones");
    const firstLeft = first.getBoundingClientRect().left;
    const secondLeft = second.getBoundingClientRect().left;
    const before = harness.milestoneIdsInDocument();
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    const handle = harness.handle(0);
    const activationId = handle.getAttribute("data-authoring-movement-activation-id");
    expect(handle).toHaveAttribute("aria-keyshortcuts", expect.stringContaining("ArrowRight"));
    handle.focus({ preventScroll: true });
    await userEvent.keyboard(" ");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(
      () =>
        first.getBoundingClientRect().left > firstLeft + 4 &&
        second.getBoundingClientRect().left < secondLeft - 4,
      () => "Roadmap milestones to project their horizontal order",
    );
    const shell = requiredElement<HTMLElement>(first, ".sc-course-roadmap__milestone-shell");
    const horizontalMarker = getComputedStyle(shell, "::before");
    expect(horizontalMarker.content).not.toBe("none");
    expect(horizontalMarker.transform).not.toBe("none");
    const horizontalContent = getComputedStyle(shell, "::after");
    expect(horizontalContent.content).toBe("none");
    expect(horizontalContent.backgroundImage).toBe("none");
    expect(harness.milestonesInDom()).toEqual(milestones);
    expect(harness.milestoneIdsInDocument()).toEqual(before);
    expect(documentWrites).toBe(0);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await userEvent.keyboard(" ");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.milestoneIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(documentWrites).toBe(1);
    await waitFor(
      () =>
        document.activeElement?.getAttribute("data-authoring-movement-activation-id") ===
        activationId,
      () => "focus restoration to the moved Roadmap milestone",
    );
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("keeps a visible empty milestone while projecting a vertical pointer destination", async () => {
    await page.viewport(1000, 800);
    const harness = await mountRoadmapAuthoringHarness("vertical");
    mounted.push(harness);
    const milestones = harness.milestonesInDom();
    const first = milestones[0];
    const second = milestones[1];
    if (!first || !second) throw new Error("Roadmap reorder requires two milestones");
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    const shell = requiredElement<HTMLElement>(first, ".sc-course-roadmap__milestone-shell");
    const content = requiredElement<HTMLElement>(first, ".sc-course-roadmap__content");
    const before = harness.milestoneIdsInDocument();
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);
    const destination = {
      x: secondRect.left + secondRect.width / 2,
      y: secondRect.top + secondRect.height * 0.75,
    };

    await startPointerDrag(harness.handle(0), destination);
    await waitFor(() => first.getBoundingClientRect().top > firstRect.top + 4);

    expect(first).toHaveAttribute("data-authoring-movement-silhouette");
    expect(shell).toHaveAttribute("data-authoring-movement-silhouette-surface");
    expect(getComputedStyle(shell).visibility).toBe("visible");
    expect(getComputedStyle(content).visibility).toBe("hidden");
    expect(getComputedStyle(shell).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(shell).boxShadow).toBe("none");
    const verticalMarker = getComputedStyle(shell, "::before");
    expect(verticalMarker.content).not.toBe("none");
    expect(verticalMarker.visibility).toBe("visible");
    expect(verticalMarker.borderStyle).toBe("dashed");
    expect(verticalMarker.transform).toBe("none");
    expect(Number.parseFloat(verticalMarker.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(verticalMarker.height)).toBeGreaterThan(0);
    const reservedContentArea = getComputedStyle(shell, "::after");
    expect(reservedContentArea.content).toBe("none");
    expect(reservedContentArea.backgroundImage).toBe("none");
    expectClose(first.getBoundingClientRect().width, firstRect.width, 0.5);
    expectClose(first.getBoundingClientRect().height, firstRect.height, 0.5);
    expect(harness.milestoneIdsInDocument()).toEqual(before);
    expect(documentWrites).toBe(0);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.milestoneIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(documentWrites).toBe(1);
    expect(first).not.toHaveAttribute("data-authoring-movement-silhouette");
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("restores milestone geometry and focus when keyboard dragging is cancelled", async () => {
    await page.viewport(1000, 800);
    const harness = await mountRoadmapAuthoringHarness("horizontal");
    mounted.push(harness);
    const milestones = harness.milestonesInDom();
    const first = milestones[0];
    const second = milestones[1];
    if (!first || !second) throw new Error("Roadmap reorder requires two milestones");
    const firstLeft = first.getBoundingClientRect().left;
    const secondLeft = second.getBoundingClientRect().left;
    const before = harness.milestoneIdsInDocument();
    const handle = harness.handle(0);

    handle.focus({ preventScroll: true });
    await userEvent.keyboard(" ");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(
      () =>
        first.getBoundingClientRect().left > firstLeft + 4 &&
        second.getBoundingClientRect().left < secondLeft - 4,
      () => "Roadmap milestones to project before cancellation",
    );

    await userEvent.keyboard("{Escape}");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expectClose(first.getBoundingClientRect().left, firstLeft, 1);
    expectClose(second.getBoundingClientRect().left, secondLeft, 1);
    expect(harness.milestoneIdsInDocument()).toEqual(before);
    expect(first).not.toHaveAttribute("data-authoring-movement-silhouette");
    expect(
      harness.host.querySelector(`[${AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR}]`),
    ).toBeNull();
    expect(document.activeElement).toBe(handle);
  });
});

async function mountRoadmapAuthoringHarness(
  orientation: "horizontal" | "vertical",
): Promise<RoadmapAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 560px; padding: 32px; position: relative; width: 860px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; min-height: 496px; overflow: auto; padding: 16px; position: relative; width: 796px";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      RoadmapAuthoringExtension,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([ROADMAP_NODE]),
    ],
    content: roadmapDocument(orientation),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll('[data-node="roadmap-milestone"]').length === 3);
  await animationFrames(2);

  const milestonesInDom = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>('[data-node="roadmap-milestone"]')).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  return {
    editor,
    host,
    rendered,
    handle: (index) =>
      requiredElement<HTMLButtonElement>(
        milestonesInDom()[index]!,
        "[data-contained-movement-handle]",
      ),
    milestoneIdsInDocument: () => roadmapMilestoneIdsInDocument(editor),
    milestonesInDom,
  };
}

function roadmapDocument(orientation: "horizontal" | "vertical"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: ROADMAP_NODE,
        attrs: { id: "roadmap000001", data: emptyRoadmapData({ orientation }) },
        content: [
          roadmapMilestone("milestone001", "Foundations", "Start here"),
          roadmapMilestone("milestone002", "Practice", "Apply the work"),
          roadmapMilestone("milestone003", "Reflect", "Close the loop"),
        ],
      },
    ],
  };
}

function roadmapMilestone(id: string, heading: string, body: string): JSONContent {
  return {
    type: ROADMAP_MILESTONE_NODE,
    attrs: { id, status: "upcoming" },
    content: roadmapMilestoneContent(heading, body),
  };
}

function roadmapMilestoneIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === ROADMAP_MILESTONE_NODE && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
  });
  return ids;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}.`);
  return element;
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
    clientX: start.x + 12,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(1);
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function finishPointerDrag(point: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

async function waitFor(
  condition: () => unknown,
  timeoutDescription: () => string = () => "Roadmap authoring drag state",
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

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
