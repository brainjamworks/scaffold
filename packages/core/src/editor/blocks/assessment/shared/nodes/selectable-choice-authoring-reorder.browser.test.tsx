import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { McqAuthoringExtension } from "@/editor/blocks/assessment/mcq/mcq-authoring-extension";
import { mcqBlockDefinition } from "@/editor/blocks/assessment/mcq/mcq-definition";
import { MultiselectAuthoringExtension } from "@/editor/blocks/assessment/multiselect/multiselect-authoring-extension";
import { multiselectBlockDefinition } from "@/editor/blocks/assessment/multiselect/multiselect-definition";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { SelectableChoiceBodyNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import "@/styles/globals.css";

import { SelectableChoiceAuthoringNode } from "./selectable-choice-authoring";

type SelectableChoiceOwner = "mcq" | "multiselect";

interface SelectableChoiceAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  choice(id: string): HTMLElement;
  choiceIdsInDocument(): string[];
  handle(id: string): HTMLButtonElement;
}

const mounted: SelectableChoiceAuthoringHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("selectable choice authoring reorder", () => {
  it("projects MCQ choices locally and commits once after a keyboard drop", async () => {
    await page.viewport(1000, 800);
    const harness = await mountSelectableChoiceHarness("mcq");
    mounted.push(harness);
    const alpha = harness.choice("choice_00001");
    const beta = harness.choice("choice_00002");
    const handle = harness.handle("choice_00001");
    const alphaRect = alpha.getBoundingClientRect();
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
    await waitFor(() => alpha.getBoundingClientRect().top > alphaRect.top + 8);

    expect(beta.getBoundingClientRect().top).toBeLessThan(betaTop - 8);
    expect(harness.choiceIdsInDocument()).toEqual(["choice_00001", "choice_00002", "choice_00003"]);
    expect(documentWrites).toBe(0);
    expectChoiceSilhouette(alpha, alphaRect, harness);

    await userEvent.keyboard("{Space}");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.choiceIdsInDocument()).toEqual(["choice_00002", "choice_00001", "choice_00003"]);
    expect(documentWrites).toBe(1);
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("projects Multi-select choices locally and commits once after a pointer drop", async () => {
    await page.viewport(1000, 800);
    const harness = await mountSelectableChoiceHarness("multiselect");
    mounted.push(harness);
    const alpha = harness.choice("choice_00001");
    const beta = harness.choice("choice_00002");
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

    await startPointerDrag(harness.handle("choice_00001"), destination);
    await waitFor(() => alpha.getBoundingClientRect().top > alphaRect.top + 8);

    expect(harness.choiceIdsInDocument()).toEqual(["choice_00001", "choice_00002", "choice_00003"]);
    expect(documentWrites).toBe(0);
    expectChoiceSilhouette(alpha, alphaRect, harness);

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.choiceIdsInDocument()).toEqual(["choice_00002", "choice_00001", "choice_00003"]);
    expect(documentWrites).toBe(1);
    harness.editor.off("transaction", countDocumentWrite);
  });
});

function expectChoiceSilhouette(
  source: HTMLElement,
  initialRect: DOMRect,
  harness: SelectableChoiceAuthoringHarness,
): void {
  const row = requiredElement<HTMLElement>(source, ".sc-course-assessment-choice--authoring");
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

async function mountSelectableChoiceHarness(
  owner: SelectableChoiceOwner,
): Promise<SelectableChoiceAuthoringHarness> {
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

  const definition = owner === "mcq" ? mcqBlockDefinition : multiselectBlockDefinition;
  const ownerExtension = owner === "mcq" ? McqAuthoringExtension : MultiselectAuthoringExtension;
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([definition.nodeType]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentChoicesGroupNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceAuthoringNode,
      ownerExtension,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: selectableChoiceDocument(owner),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll('[data-node="selectable-choice"]').length === 3);
  await animationFrames(2);

  const choices = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>('[data-node="selectable-choice"]')).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  return {
    editor,
    host,
    rendered,
    choice: (id) => {
      const choice = choices().find((element) => element.getAttribute("data-choice-id") === id);
      if (!choice) throw new Error(`Expected selectable choice ${id}.`);
      return choice;
    },
    choiceIdsInDocument: () => selectableChoiceIdsInDocument(editor),
    handle: (id) =>
      requiredElement<HTMLButtonElement>(
        choices().find((element) => element.getAttribute("data-choice-id") === id) ?? ownerRoot,
        "[data-contained-movement-handle]",
      ),
  };
}

function selectableChoiceDocument(owner: SelectableChoiceOwner): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: owner,
        attrs: {
          id: `${owner}-authoring-reorder`,
          assessment:
            owner === "mcq"
              ? {
                  correctOptionId: "choice_00001",
                  feedbackByOptionId: {},
                  summaryFeedback: null,
                }
              : {
                  correctOptionIds: ["choice_00001"],
                  feedbackByOptionId: {},
                  summaryFeedback: null,
                },
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "assessment_choices_group",
            content: [
              selectableChoice("choice_00001", "Alpha"),
              selectableChoice("choice_00002", "Beta with a taller second line"),
              selectableChoice("choice_00003", "Gamma"),
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

function selectableChoice(id: string, text: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    ],
  };
}

function selectableChoiceIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "selectable_choice" && typeof node.attrs["id"] === "string") {
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
  throw new Error("Timed out waiting for selectable-choice authoring drag state.");
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
