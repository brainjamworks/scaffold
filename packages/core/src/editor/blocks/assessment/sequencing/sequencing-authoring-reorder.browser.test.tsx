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
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import "@/styles/globals.css";

import { SequencingAuthoringExtension } from "./sequencing-authoring-extension";
import { SEQUENCING_AUTHORING_PROJECTION_ATTR } from "./sequencing-authoring-reorder-projection";

interface SequencingAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  handle(id: string): HTMLButtonElement;
  item(id: string): HTMLElement;
  itemIdsInDocument(): string[];
  itemIdsInDom(): string[];
}

const mounted: SequencingAuthoringHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("authoring Sequencing contained reorder", () => {
  it("leaves only a lightweight dotted item outline at the source", async () => {
    await page.viewport(1000, 800);
    const harness = await mountSequencingAuthoringHarness();
    mounted.push(harness);
    const alpha = harness.item("seqitm_00001");
    const betaRect = harness.item("seqitm_00002").getBoundingClientRect();
    const sourceSize = alpha.getBoundingClientRect();
    const sourceBorderRadius = getComputedStyle(alpha).borderRadius;
    const destination = {
      x: betaRect.left + betaRect.width / 2,
      y: betaRect.top + betaRect.height * 0.75,
    };

    await startPointerDrag(harness.handle("seqitm_00001"), destination);

    const content = requiredElement<HTMLElement>(alpha, ".sc-course-sequencing__item-content");
    const handle = harness.handle("seqitm_00001");
    const sourceStyle = getComputedStyle(alpha);
    const draggedSize = alpha.getBoundingClientRect();

    expect(alpha).toHaveAttribute("data-authoring-movement-silhouette");
    expect(alpha.querySelector(".sc-course-sequencing__movement-slot")).toBeNull();
    expect(getComputedStyle(content).visibility).toBe("hidden");
    expect(getComputedStyle(handle).visibility).toBe("hidden");
    expect(sourceStyle.backgroundColor).toMatch(/^rgba\(.+, 0\)$/);
    expect(sourceStyle.borderTopColor).not.toMatch(/^rgba\(.+, 0\)$/);
    expect(sourceStyle.borderTopStyle).toBe("dashed");
    expect(sourceStyle.borderRadius).toBe(sourceBorderRadius);
    expect(sourceStyle.boxShadow).toBe("none");
    expect(draggedSize.width).toBeCloseTo(sourceSize.width, 1);
    expect(draggedSize.height).toBeCloseTo(sourceSize.height, 1);
    expect(harness.host.querySelector("[data-interaction-drag-overlay]")).not.toBeNull();

    await finishPointerDrag(destination);
  });

  it("projects sibling order locally and commits the document once on drop", async () => {
    await page.viewport(1000, 800);
    const harness = await mountSequencingAuthoringHarness();
    mounted.push(harness);
    const alpha = harness.item("seqitm_00001");
    const beta = harness.item("seqitm_00002");
    const handle = harness.handle("seqitm_00001");
    const alphaTop = alpha.getBoundingClientRect().top;
    const betaTop = beta.getBoundingClientRect().top;
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    handle.focus({ preventScroll: true });
    await userEvent.keyboard("{Space}");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() => {
      const nextAlphaTop = alpha.getBoundingClientRect().top;
      const nextBetaTop = beta.getBoundingClientRect().top;
      return nextAlphaTop > alphaTop + 8 && nextBetaTop < betaTop - 8;
    });
    expect(harness.itemIdsInDom()).toEqual(["seqitm_00001", "seqitm_00002", "seqitm_00003"]);
    expect(harness.itemIdsInDocument()).toEqual(["seqitm_00001", "seqitm_00002", "seqitm_00003"]);
    expect(documentWrites).toBe(0);

    await userEvent.keyboard("{Space}");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInDocument()).toEqual(["seqitm_00002", "seqitm_00001", "seqitm_00003"]);
    expect(documentWrites).toBe(1);
    for (const id of harness.itemIdsInDocument()) {
      expect(harness.item(id)).not.toHaveAttribute(SEQUENCING_AUTHORING_PROJECTION_ATTR);
    }
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("uses the same local projection for pointer dragging", async () => {
    await page.viewport(1000, 800);
    const harness = await mountSequencingAuthoringHarness();
    mounted.push(harness);
    const alpha = harness.item("seqitm_00001");
    const beta = harness.item("seqitm_00002");
    const alphaTop = alpha.getBoundingClientRect().top;
    const betaRect = beta.getBoundingClientRect();
    const destination = {
      x: betaRect.left + betaRect.width / 2,
      y: betaRect.top + betaRect.height * 0.75,
    };

    await startPointerDrag(harness.handle("seqitm_00001"), destination);
    await waitFor(() => alpha.getBoundingClientRect().top > alphaTop + 8);

    expect(harness.itemIdsInDocument()).toEqual(["seqitm_00001", "seqitm_00002", "seqitm_00003"]);

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInDocument()).toEqual(["seqitm_00002", "seqitm_00001", "seqitm_00003"]);
  });
});

async function mountSequencingAuthoringHarness(): Promise<SequencingAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 500px; padding: 32px; position: relative; width: 760px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; height: 436px; overflow: auto; padding: 16px; position: relative; width: 696px";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SequencingAuthoringExtension,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
    ],
    content: sequencingDocument(),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() =>
    host.querySelector('[data-node="sequencing-item"][data-item-id="seqitm_00003"]'),
  );
  await animationFrames(2);

  return {
    editor,
    host,
    rendered,
    handle: (id) => {
      const item = requiredElement<HTMLElement>(
        host,
        `[data-node="sequencing-item"][data-item-id="${id}"]`,
      );
      return requiredElement<HTMLButtonElement>(item, "[data-contained-movement-handle]");
    },
    item: (id) =>
      requiredElement<HTMLElement>(host, `[data-node="sequencing-item"][data-item-id="${id}"]`),
    itemIdsInDocument: () => sequencingItemIdsInDocument(editor),
    itemIdsInDom: () => {
      const list = requiredElement<HTMLElement>(host, ".sc-course-sequencing__list");
      return Array.from(
        list.querySelectorAll<HTMLElement>('[data-node="sequencing-item"]'),
      ).flatMap((item) => {
        const id = item.getAttribute("data-item-id");
        return id ? [id] : [];
      });
    },
  };
}

function sequencingDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "sequencing",
        attrs: { id: "sequencing-authoring-reorder" },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "sequencing_items_group",
            content: [
              sequencingItem("seqitm_00001", "Alpha"),
              sequencingItem("seqitm_00002", "Beta with a taller second line"),
              sequencingItem("seqitm_00003", "Gamma"),
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

function sequencingItem(id: string, text: string): JSONContent {
  return {
    type: "sequencing_item",
    attrs: { id },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function sequencingItemIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "sequencing_item" && typeof node.attrs["id"] === "string") {
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

async function waitFor<T>(read: () => T | null | false, frames = 120): Promise<T> {
  for (let frame = 0; frame < frames; frame += 1) {
    const value = read();
    if (value) return value;
    await animationFrames(1);
  }
  throw new Error("Timed out waiting for authoring Sequencing drag state.");
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
