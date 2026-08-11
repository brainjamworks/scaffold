import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import "@/styles/globals.css";

import { MatchingAuthoringExtension } from "./matching-authoring-extension";
import { matchingBlockDefinition } from "./matching-definition";

interface MatchingAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  handle(itemId: string): HTMLButtonElement;
  itemIdsInDocument(): string[];
  pair(itemId: string): HTMLElement;
}

const mounted: MatchingAuthoringHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("Matching pair authoring reorder", () => {
  it("projects pairs locally and commits the document once after a pointer drop", async () => {
    await page.viewport(1100, 850);
    const harness = await mountMatchingAuthoringHarness();
    mounted.push(harness);
    const alpha = harness.pair("matching-item-1");
    const beta = harness.pair("matching-item-2");
    const alphaRect = alpha.getBoundingClientRect();
    const betaRect = beta.getBoundingClientRect();
    const destination = {
      x: betaRect.left + betaRect.width / 2,
      y: betaRect.top + betaRect.height * 0.75,
    };
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    await startPointerDrag(harness.handle("matching-item-1"), destination);
    await waitFor(() => alpha.getBoundingClientRect().top > alphaRect.top + 8);

    expect(beta.getBoundingClientRect().top).toBeLessThan(betaRect.top - 8);
    expect(harness.itemIdsInDocument()).toEqual([
      "matching-item-1",
      "matching-item-2",
      "matching-item-3",
    ]);
    expect(documentWrites).toBe(0);
    expectPairSilhouette(alpha, alphaRect, harness);

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInDocument()).toEqual([
      "matching-item-2",
      "matching-item-1",
      "matching-item-3",
    ]);
    expect(documentWrites).toBe(1);
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("uses the pair projection for keyboard drag and restores it on cancel", async () => {
    await page.viewport(1100, 850);
    const harness = await mountMatchingAuthoringHarness();
    mounted.push(harness);
    const alpha = harness.pair("matching-item-1");
    const alphaRect = alpha.getBoundingClientRect();
    const handle = harness.handle("matching-item-1");
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    handle.focus({ preventScroll: true });
    await userEvent.keyboard("{Space}");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => alpha.getBoundingClientRect().top > alphaRect.top + 8);

    expect(harness.itemIdsInDocument()).toEqual([
      "matching-item-1",
      "matching-item-2",
      "matching-item-3",
    ]);
    expect(documentWrites).toBe(0);
    expectPairSilhouette(alpha, alphaRect, harness);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));
    await waitFor(() => Math.abs(alpha.getBoundingClientRect().top - alphaRect.top) < 1);

    expect(harness.itemIdsInDocument()).toEqual([
      "matching-item-1",
      "matching-item-2",
      "matching-item-3",
    ]);
    expect(documentWrites).toBe(0);
    expect(alpha).not.toHaveAttribute("data-authoring-movement-silhouette");
    expect(document.activeElement).toBe(handle);
    harness.editor.off("transaction", countDocumentWrite);
  });
});

function expectPairSilhouette(
  source: HTMLElement,
  initialRect: DOMRect,
  harness: MatchingAuthoringHarness,
): void {
  const surface = requiredElement<HTMLElement>(source, ".sc-course-matching__pair-grid");
  const itemField = requiredElement<HTMLElement>(source, ".sc-course-matching__field--item");
  const style = getComputedStyle(surface);
  const draggedRect = source.getBoundingClientRect();

  expect(source).toHaveAttribute("data-authoring-movement-silhouette");
  expect(surface).toHaveAttribute("data-authoring-movement-silhouette-surface");
  expect(style.visibility).toBe("visible");
  expect(style.outlineStyle).toBe("dashed");
  expect(style.backgroundColor).toMatch(/^rgba\(.+, 0\)$/);
  expect(getComputedStyle(itemField).visibility).toBe("hidden");
  expect(draggedRect.width).toBeCloseTo(initialRect.width, 1);
  expect(draggedRect.height).toBeCloseTo(initialRect.height, 1);
  expect(harness.host.querySelector("[data-interaction-drag-overlay]")).not.toBeNull();
}

async function mountMatchingAuthoringHarness(): Promise<MatchingAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 620px; padding: 32px; position: relative; width: 940px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; min-height: 556px; overflow: auto; padding: 16px; position: relative; width: 876px";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([matchingBlockDefinition.nodeType]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      MatchingAuthoringExtension,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: matchingDocument(),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll('[data-node="matching-pair"]').length === 3);
  await animationFrames(2);

  const pairs = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>('[data-node="matching-pair"]')).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  return {
    editor,
    host,
    rendered,
    handle: (itemId) =>
      requiredElement<HTMLButtonElement>(
        pairs().find((element) => element.getAttribute("data-item-id") === itemId) ?? ownerRoot,
        "[data-contained-movement-handle]",
      ),
    itemIdsInDocument: () => matchingItemIdsInDocument(editor),
    pair: (itemId) => {
      const pair = pairs().find((element) => element.getAttribute("data-item-id") === itemId);
      if (!pair) throw new Error(`Expected Matching pair for ${itemId}.`);
      return pair;
    },
  };
}

function matchingDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "matching",
        attrs: {
          id: "matching-authoring-reorder",
          assessment: { feedbackByItemId: {}, summaryFeedback: null },
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "matching_pairs_group",
            content: [
              matchingPair(
                "matching-pair-1",
                "matching-item-1",
                "matching-target-1",
                "Alpha",
                "One",
              ),
              matchingPair(
                "matching-pair-2",
                "matching-item-2",
                "matching-target-2",
                "Beta with a taller second line",
                "Two",
              ),
              matchingPair(
                "matching-pair-3",
                "matching-item-3",
                "matching-target-3",
                "Gamma",
                "Three",
              ),
            ],
          },
          {
            type: "assessment_actions_group",
            content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
          },
        ],
      },
    ],
  };
}

function matchingPair(
  id: string,
  itemId: string,
  targetId: string,
  itemText: string,
  targetText: string,
): JSONContent {
  return {
    type: "matching_pair",
    attrs: { id },
    content: [
      {
        type: "matching_item",
        attrs: { id: itemId },
        content: [{ type: "paragraph", content: [{ type: "text", text: itemText }] }],
      },
      {
        type: "matching_target",
        attrs: { id: targetId },
        content: [{ type: "paragraph", content: [{ type: "text", text: targetText }] }],
      },
    ],
  };
}

function matchingItemIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "matching_pair") {
      const id = node.firstChild?.attrs["id"];
      if (typeof id === "string") ids.push(id);
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

async function waitFor<T>(read: () => T | null | false, frames = 120): Promise<T> {
  for (let frame = 0; frame < frames; frame += 1) {
    const value = read();
    if (value) return value;
    await animationFrames(1);
  }
  throw new Error("Timed out waiting for Matching authoring drag state.");
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
