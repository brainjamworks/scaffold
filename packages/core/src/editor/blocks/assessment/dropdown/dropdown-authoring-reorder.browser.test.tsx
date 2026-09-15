import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

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

import { DropdownAuthoringExtension } from "./dropdown-authoring-extension";
import { dropdownChoiceLabelContent } from "./dropdown-choice";
import { dropdownBlockDefinition } from "./dropdown-definition";

interface DropdownAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  choice(id: string): HTMLElement;
  choiceIdsInDocument(): string[];
  handle(id: string): HTMLButtonElement;
}

const mounted: DropdownAuthoringHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("Dropdown choice authoring reorder", () => {
  it("projects choices locally and commits the document once after a pointer drop", async () => {
    await page.viewport(1000, 800);
    const harness = await mountDropdownAuthoringHarness();
    mounted.push(harness);
    const alpha = harness.choice("dropdown-choice-1");
    const beta = harness.choice("dropdown-choice-2");
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

    await startPointerDrag(harness.handle("dropdown-choice-1"), destination);
    await waitFor(() => alpha.getBoundingClientRect().top > alphaRect.top + 8);

    expect(harness.choiceIdsInDocument()).toEqual([
      "dropdown-choice-1",
      "dropdown-choice-2",
      "dropdown-choice-3",
    ]);
    expect(documentWrites).toBe(0);
    expectChoiceSilhouette(alpha, alphaRect, harness);

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.choiceIdsInDocument()).toEqual([
      "dropdown-choice-2",
      "dropdown-choice-1",
      "dropdown-choice-3",
    ]);
    expect(documentWrites).toBe(1);
    harness.editor.off("transaction", countDocumentWrite);
  });
});

function expectChoiceSilhouette(
  source: HTMLElement,
  initialRect: DOMRect,
  harness: DropdownAuthoringHarness,
): void {
  const row = requiredElement<HTMLElement>(
    source,
    ".sc-app-assessment-choice-authoring-surface--workspace",
  );
  const content = requiredElement<HTMLElement>(
    source,
    ".sc-course-assessment-choice__authoring-content",
  );
  const style = getComputedStyle(row);
  const draggedRect = source.getBoundingClientRect();

  expect(source).toHaveAttribute("data-authoring-movement-silhouette");
  expect(row).toHaveAttribute("data-authoring-movement-silhouette-surface");
  expect(style.visibility).toBe("visible");
  expect(style.backgroundColor).toMatch(/^rgba\(.+, 0\)$/);
  expect(style.borderTopStyle).toBe("dashed");
  expect(style.boxShadow).toBe("none");
  expect(getComputedStyle(content).visibility).toBe("hidden");
  expect(draggedRect.width).toBeCloseTo(initialRect.width, 1);
  expect(draggedRect.height).toBeCloseTo(initialRect.height, 1);
  expect(harness.host.querySelector("[data-interaction-drag-overlay]")).not.toBeNull();
}

async function mountDropdownAuthoringHarness(): Promise<DropdownAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 560px; padding: 32px; position: relative; width: 820px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; min-height: 496px; overflow: auto; padding: 16px; position: relative; width: 756px";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([dropdownBlockDefinition.nodeType]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      DropdownAuthoringExtension,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: dropdownDocument(),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll('[data-node="dropdown-choice"]').length === 3);
  await animationFrames(2);

  const choices = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>('[data-node="dropdown-choice"]')).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  return {
    editor,
    host,
    rendered,
    choice: (id) => {
      const choice = choices().find((element) => element.getAttribute("data-choice-id") === id);
      if (!choice) throw new Error(`Expected Dropdown choice ${id}.`);
      return choice;
    },
    choiceIdsInDocument: () => dropdownChoiceIdsInDocument(editor),
    handle: (id) =>
      requiredElement<HTMLButtonElement>(
        choices().find((element) => element.getAttribute("data-choice-id") === id) ?? ownerRoot,
        "[data-contained-movement-handle]",
      ),
  };
}

function dropdownDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "dropdown",
        attrs: {
          id: "dropdown-authoring-reorder",
          assessment: {
            correctOptionId: "dropdown-choice-1",
            feedbackByOptionId: {},
            summaryFeedback: null,
          },
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "dropdown_choices_group",
            content: [
              dropdownChoice("dropdown-choice-1", "Alpha"),
              dropdownChoice("dropdown-choice-2", "Beta with a taller second line"),
              dropdownChoice("dropdown-choice-3", "Gamma"),
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

function dropdownChoice(id: string, text: string): JSONContent {
  return {
    type: "dropdown_choice",
    attrs: { id },
    content: [
      {
        type: "dropdown_choice_label",
        content: dropdownChoiceLabelContent(text),
      },
    ],
  };
}

function dropdownChoiceIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "dropdown_choice" && typeof node.attrs["id"] === "string") {
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
  throw new Error("Timed out waiting for Dropdown authoring drag state.");
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
