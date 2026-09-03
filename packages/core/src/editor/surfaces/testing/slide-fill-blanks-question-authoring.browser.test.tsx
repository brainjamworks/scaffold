import { EmbeddedNodeIdSchema, FillBlanksPrivateAssessmentSchema } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

let root: Root | null = null;
let editor: Editor | null = null;

afterEach(() => {
  root?.unmount();
  editor?.destroy();
  root = null;
  editor = null;
  document.body.replaceChildren();
});

describe("full-slide Fill in Blanks authoring", () => {
  it("keeps blank creation and accepted-answer editing App-owned inside the slide stage", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createAuthoringEditor();
    root = createRoot(reactHost);
    root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

    await waitForCondition(() =>
      host.querySelector(".sc-slide-fill-blanks-question-surface-authoring-view"),
    );
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-fill-blanks-question-surface-authoring-view",
    );
    const body = requiredElement<HTMLElement>(surface, '[data-slot="fill-blanks-body"]');
    const createBlank = requiredElement<HTMLButtonElement>(
      surface,
      ".sc-app-fill-blanks-slide__create-blank",
    );
    const authoringActions = requiredElement<HTMLElement>(
      surface,
      ".sc-app-fill-blanks-slide__authoring-actions",
    );
    const selectionGuidance = requiredElement<HTMLElement>(
      authoringActions,
      ".sc-app-fill-blanks-slide__selection-guidance",
    );

    expect(body.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.8,
    );
    expect(authoringActions.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      body.getBoundingClientRect().top + 1,
    );
    expect(createBlank.querySelector("[class^='sc-course-']")).toBeNull();
    expect(createBlank).toBeDisabled();
    expect(selectionGuidance).toHaveTextContent("Select text in the passage to create a blank.");
    expect(createBlank).toHaveAttribute("aria-describedby", selectionGuidance.id);

    const range = textRange(editor, "evidence");
    editor.commands.setTextSelection(range);
    await waitForCondition(() => !createBlank.disabled);
    await userEvent.click(createBlank);
    await waitForCondition(() => fillBlankIds(editor!).length === 1);

    const blankId = fillBlankIds(editor)[0]!;
    const question = findQuestion(editor);
    const assessment = FillBlanksPrivateAssessmentSchema.parse(question.attrs["assessment"]);
    expect(assessment.blanksById[blankId]?.acceptedAnswers).toEqual(["evidence"]);
    const currentSurface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-fill-blanks-question-surface-authoring-view",
    );
    const currentBody = requiredElement<HTMLElement>(
      currentSurface,
      '[data-slot="fill-blanks-body"]',
    );
    const trigger = requiredElement<HTMLButtonElement>(
      currentBody,
      '.sc-app-fill-blank__author-trigger[aria-label^="Edit blank: evidence"]',
    );
    expect(trigger.closest('[data-slot="fill-blanks-body"]')).toBe(currentBody);

    await userEvent.click(trigger);
    await waitForCondition(() => document.querySelector('input[id$="-accepted-0"]'));
    const acceptedAnswer = requiredElement<HTMLInputElement>(document, 'input[id$="-accepted-0"]');
    await userEvent.fill(acceptedAnswer, "evidence-based reasoning");
    await waitForCondition(
      () =>
        FillBlanksPrivateAssessmentSchema.parse(findQuestion(editor!).attrs["assessment"])
          .blanksById[blankId]?.acceptedAnswers[0] === "evidence-based reasoning",
    );
    expect(
      FillBlanksPrivateAssessmentSchema.parse(findQuestion(editor).attrs["assessment"]).blanksById[
        blankId
      ]?.acceptedAnswers,
    ).toEqual(["evidence-based reasoning"]);
  });
});

function createAuthoringEditor(): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: authoringDocument(),
  });
}

function authoringDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-fill-blanks-question");
  if (!definition) throw new Error("Expected slide-fill-blanks-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Fill in Blanks question.");
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          { type: "courseSection", attrs: { id: createEmbeddedNodeId(), title: "Intro" } },
          {
            ...surface,
            content: [
              {
                ...question,
                attrs: {
                  ...question.attrs,
                  id: "target000001",
                  assessment: FillBlanksPrivateAssessmentSchema.parse({}),
                },
                content: (question.content ?? []).map((child) =>
                  child.type === "fill_blanks_body"
                    ? {
                        ...child,
                        content: [
                          {
                            type: "paragraph",
                            content: [
                              {
                                type: "text",
                                text: "Select evidence in this sentence and turn it into a gap.",
                              },
                            ],
                          },
                        ],
                      }
                    : child,
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}

function textRange(currentEditor: Editor, text: string): { from: number; to: number } {
  let from = -1;
  currentEditor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text?.includes(text)) return;
    from = pos + node.text.indexOf(text);
  });
  if (from < 0) throw new Error(`Expected text ${text}.`);
  return { from, to: from + text.length };
}

function fillBlankIds(currentEditor: Editor): string[] {
  const ids: string[] = [];
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name === "fill_blank") ids.push(String(node.attrs["id"] ?? ""));
    return true;
  });
  return ids;
}

function findQuestion(currentEditor: Editor) {
  let question = currentEditor.state.doc;
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name !== "surface_fill_blanks_question") return true;
    question = node;
    return false;
  });
  return question;
}

function requiredElement<T extends Element>(owner: ParentNode, selector: string): T {
  const element = owner.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for Fill in Blanks authoring fixture.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
