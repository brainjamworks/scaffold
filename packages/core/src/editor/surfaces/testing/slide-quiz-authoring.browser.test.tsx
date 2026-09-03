import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
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
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-dropdown-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-drag-drop-question-node";
import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-categorise-question-node";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-fill-blanks-question-node";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-image-hotspot-question-node";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-matching-question-node";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiselect-question-node";
import { SURFACE_QUIZ_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-quiz-node";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-sequencing-question-node";
import { createQuizQuestion } from "@/editor/surfaces/model/templates/assessment/slide-quiz";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

let root: Root | null = null;
let editor: Editor | null = null;

const AUTHORING_QUESTION_FAMILIES = [
  [SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE, "multiple-choice"],
  [SURFACE_MULTISELECT_QUESTION_NODE_TYPE, "multiselect"],
  [SURFACE_DROPDOWN_QUESTION_NODE_TYPE, "dropdown"],
  [SURFACE_DRAG_DROP_QUESTION_NODE_TYPE, "drag-drop"],
  [SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE, "fill-blanks"],
  [SURFACE_CATEGORISE_QUESTION_NODE_TYPE, "categorise"],
  [SURFACE_SEQUENCING_QUESTION_NODE_TYPE, "sequencing"],
  [SURFACE_MATCHING_QUESTION_NODE_TYPE, "matching"],
  [SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE, "image-hotspot"],
] as const;

afterEach(() => {
  root?.unmount();
  editor?.destroy();
  root = null;
  editor = null;
  document.body.replaceChildren();
});

describe("full-slide Quiz authoring", () => {
  it.each(AUTHORING_QUESTION_FAMILIES)(
    "keeps the %s question inside the shared Quiz rail and bounded authoring stage",
    async (nodeType, family) => {
      await page.viewport(1100, 700);
      const host = document.createElement("section");
      host.className = "sc-app radix-themes light";
      host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
      const reactHost = document.createElement("div");
      host.append(reactHost);
      document.body.append(host);

      editor = createAuthoringEditor(1, false, nodeType);
      root = createRoot(reactHost);
      root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

      await waitForCondition(() => host.querySelector(".sc-slide-quiz-surface-authoring-view"));
      const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-authoring-view");
      const rail = requiredElement<HTMLElement>(surface, '[data-testid="quiz-authoring-rail"]');
      const stage = requiredElement<HTMLElement>(surface, "[data-surface-assessment-question]");

      expect(stage).toHaveAttribute("data-full-slide-question-family", family);
      expect(getComputedStyle(stage).display).toBe("grid");
      expect(stage.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        rail.getBoundingClientRect().bottom - 1,
      );
      expect(stage.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        surface.getBoundingClientRect().bottom + 1,
      );
      expect(stage.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.85,
      );
      expect(
        surface.querySelectorAll('[data-surface-assessment-question][style*="display: none"]'),
      ).toHaveLength(0);
    },
  );

  it("keeps one private Quiz owner while App controls edit private question children", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createAuthoringEditor(1, true);
    root = createRoot(reactHost);
    root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

    await waitForCondition(() => host.querySelector(".sc-slide-quiz-surface-authoring-view"));
    const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-authoring-view");
    const rail = requiredElement<HTMLElement>(surface, '[data-testid="quiz-authoring-rail"]');
    const quiz = requiredElement<HTMLElement>(surface, `[data-node="${SURFACE_QUIZ_NODE_TYPE}"]`);
    const strip = requiredElement<HTMLElement>(surface, '[data-testid="quiz-stage-selector"]');
    const stage = requiredElement<HTMLElement>(surface, "[data-surface-assessment-question]");
    const addQuestion = requiredElement<HTMLButtonElement>(
      surface,
      '[data-testid="quiz-strip-add"]',
    );

    expect(quiz).toHaveAttribute("data-surface-quiz");
    expect(surface.querySelector('[data-node="quiz"]')).toBeNull();
    expect(surface.querySelector('[data-authoring-frame="block"]')).toBeNull();
    expect(surface.className).not.toMatch(/(?:selectable-choice|multiple-choice)-.*surface/);
    expect(stage).toHaveAttribute("data-full-slide-question-stage");
    expect(stage).toHaveAttribute("data-full-slide-question-family", "multiple-choice");
    expect(strip).toHaveClass("sc-app-quiz__strip");
    expect(rail).toContainElement(strip);
    expect(rail).toContainElement(requiredElement(surface, '[data-testid="quiz-stage-meta"]'));
    expect(addQuestion).toHaveClass("sc-app-block-add", "sc-app-quiz__strip-add");
    expect(addQuestion.querySelector('[class^="sc-course-"]')).toBeNull();
    expect(stage.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.85,
    );
    expect(stage.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      surface.getBoundingClientRect().bottom + 1,
    );
    expect(structure(editor)).toEqual({
      quizCount: 1,
      questionIds: [expect.any(String)],
      questionTypes: [SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE],
    });

    await userEvent.click(addQuestion);
    const picker = page.getByRole("dialog").element();
    expect(picker).toHaveAttribute("data-authoring-chrome", "popover");
    await userEvent.click(page.getByRole("button", { name: "Dropdown" }));
    await waitForCondition(() => structure(editor!).questionTypes.length === 2);

    expect(structure(editor)).toEqual({
      quizCount: 1,
      questionIds: [expect.any(String), expect.any(String)],
      questionTypes: [
        SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
        SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
      ],
    });
    expect(surface.querySelectorAll('[data-quiz-question-id=""]').length).toBe(0);
    expect(page.getByRole("button", { name: "Question settings" })).toBeDefined();
    expect(page.getByRole("button", { name: "Duplicate question" })).toBeDefined();
    expect(page.getByRole("button", { name: "Delete question" })).toBeDefined();
    expect(requiredElement(surface, '[data-testid="quiz-stage-meta"]')).toHaveTextContent(
      "Question 2 of 2",
    );

    const idsBeforeDuplicate = structure(editor).questionIds;
    await userEvent.click(page.getByRole("button", { name: "Duplicate question" }));
    await waitForCondition(() => structure(editor!).questionTypes.length === 3);
    expect(structure(editor)).toEqual({
      quizCount: 1,
      questionIds: expect.arrayContaining(idsBeforeDuplicate),
      questionTypes: [
        SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
        SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
        SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
      ],
    });
    expect(new Set(structure(editor).questionIds).size).toBe(3);

    await userEvent.click(page.getByRole("button", { name: "Delete question" }));
    await waitForCondition(() => structure(editor!).questionTypes.length === 2);
    await userEvent.click(page.getByRole("button", { name: "Question 2 options" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Move earlier" }));
    await waitForCondition(
      () => structure(editor!).questionTypes[0] === SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
    );
    expect(structure(editor).questionTypes).toEqual([
      SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
      SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
    ]);

    await userEvent.click(page.getByRole("button", { name: "Question settings" }));
    expect(page.getByRole("dialog", { name: "Dropdown settings" })).toBeDefined();
  });

  it("shows Quiz-managed question attempts without allowing the question to override them", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createAuthoringEditor(1, false, SURFACE_DRAG_DROP_QUESTION_NODE_TYPE);
    root = createRoot(reactHost);
    root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

    await waitForCondition(() => host.querySelector('[data-testid="quiz-authoring-rail"]'));
    await userEvent.click(page.getByRole("button", { name: "Question settings" }));

    const dialog = page.getByRole("dialog", { name: "Drag and Drop settings" }).element();
    await userEvent.click(page.getByRole("button", { name: "Attempts" }));
    const maxAttempts = page
      .getByRole("spinbutton", { name: "Max attempts" })
      .element() as HTMLInputElement;

    expect(maxAttempts).toBeDisabled();
    expect(dialog).toHaveTextContent("Managed by quiz");
  });

  it("duplicates a Drag and Drop question with fresh marker identities and repaired references", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createCompleteDragDropAuthoringEditor();
    root = createRoot(reactHost);
    root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

    await waitForCondition(() => host.querySelector('[data-testid="quiz-authoring-rail"]'));
    const before = structuredClone(quizQuestions(editor)[0]);
    await userEvent.click(page.getByRole("button", { name: "Duplicate question" }));
    await waitForCondition(() => quizQuestions(editor!).length === 2);

    const [source, copy] = quizQuestions(editor);
    expect(source).toEqual(before);
    expect(markerIds(copy!)).not.toEqual(markerIds(source!));
    expect(new Set([...markerIds(source!), ...markerIds(copy!)]).size).toBe(4);
    expect(copy?.attrs?.["assessment"]).toMatchObject({
      correctPlacements: markerIds(copy!).map((markerId) => ({ markerId })),
      feedbackByMarkerId: { [markerIds(copy!)[1]!]: expect.anything() },
    });
  });

  it("keeps Add pinned while a high question count scrolls inside one compact rail", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createAuthoringEditor(12);
    root = createRoot(reactHost);
    root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

    await waitForCondition(() => host.querySelector('[data-testid="quiz-authoring-rail"]'));
    const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-authoring-view");
    const rail = requiredElement<HTMLElement>(surface, '[data-testid="quiz-authoring-rail"]');
    const strip = requiredElement<HTMLElement>(rail, '[data-testid="quiz-stage-selector"]');
    const sortable = requiredElement<HTMLElement>(strip, ".sc-app-quiz__strip-sortable-items");
    const add = requiredElement<HTMLElement>(strip, '[data-testid="quiz-strip-add"]');
    const stage = requiredElement<HTMLElement>(surface, "[data-surface-assessment-question]");
    const submission = requiredElement<HTMLElement>(
      stage,
      ".sc-assessment-control-layout__submission",
    );
    const support = requiredElement<HTMLElement>(stage, ".sc-assessment-control-layout__support");
    const scrollEarlier = requiredElement<HTMLButtonElement>(
      strip,
      'button[aria-label="Scroll to earlier questions"]',
    );
    const scrollLater = requiredElement<HTMLButtonElement>(
      strip,
      'button[aria-label="Scroll to later questions"]',
    );

    expect(rail.getBoundingClientRect().height).toBeLessThan(90);
    expect(sortable.scrollWidth).toBeGreaterThan(sortable.clientWidth);
    expect(scrollEarlier).toBeDisabled();
    expect(scrollLater).toBeEnabled();
    scrollLater.click();
    await waitForCondition(() => sortable.scrollLeft > 0);
    expect(sortable.scrollLeft).toBeGreaterThan(0);
    expect(add.getBoundingClientRect().right).toBeLessThanOrEqual(
      rail.getBoundingClientRect().right,
    );
    expect(add.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      sortable.getBoundingClientRect().right - 1,
    );
    expect(stage.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      rail.getBoundingClientRect().bottom - 1,
    );
    expect(stage.getBoundingClientRect().height).toBeGreaterThan(
      surface.getBoundingClientRect().height * 0.75,
    );
    expect(getComputedStyle(submission).display).toBe("none");
    expect(getComputedStyle(support).display).not.toBe("none");
  });

  it.each([
    SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE,
    SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
  ] as const)("marks an incomplete %s question as needing setup", async (questionNodeType) => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createAuthoringEditor(1, false, questionNodeType);
    root = createRoot(reactHost);
    root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

    await waitForCondition(() => host.querySelector('[data-testid="quiz-authoring-rail"]'));
    const rail = requiredElement<HTMLElement>(host, '[data-testid="quiz-authoring-rail"]');
    const question = requiredElement<HTMLElement>(rail, "[data-quiz-question-id]");

    expect(rail).toHaveTextContent("1 needs setup");
    expect(question).toHaveAttribute("data-quiz-question-needs-setup", "true");
    expect(
      requiredElement<HTMLButtonElement>(question, 'button[aria-label="Question 1, needs setup"]'),
    ).toBeVisible();
  });

  it("keeps the full empty picker and transitions to the authoring rail after Add", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createAuthoringEditor(0);
    root = createRoot(reactHost);
    root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

    await waitForCondition(() => host.querySelector('[data-testid="quiz-add-question-stage"]'));
    const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-authoring-view");
    const empty = requiredElement<HTMLElement>(surface, '[data-testid="quiz-add-question-stage"]');
    const rail = requiredElement<HTMLElement>(surface, '[data-testid="quiz-authoring-rail"]');
    expect(empty.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      rail.getBoundingClientRect().bottom - 1,
    );
    expect(surface.querySelector('[data-testid="quiz-stage-selector"]')).toBeNull();

    await userEvent.click(page.getByRole("button", { name: "Multiple choice" }));
    await waitForCondition(() => surface.querySelector('[data-testid="quiz-stage-selector"]'));
    expect(structure(editor).questionTypes).toEqual([SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE]);
    expect(surface.querySelector('[data-testid="quiz-add-question-stage"]')).toBeNull();
  });
});

function createAuthoringEditor(
  questionCount = 1,
  withBoundaries = false,
  questionNodeType = SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: authoringDocument(questionCount, withBoundaries, questionNodeType),
  });
}

function createCompleteDragDropAuthoringEditor(): Editor {
  const content = authoringDocument(1, false, SURFACE_DRAG_DROP_QUESTION_NODE_TYPE);
  const question = quizQuestionsInDocument(content)[0];
  if (!question) throw new Error("Expected a Drag and Drop Quiz question.");
  question.attrs = {
    ...question.attrs,
    assessment: {
      correctPlacements: [
        {
          markerId: "markerold001",
          geometry: { kind: "circle", centerX: 20, centerY: 30, radius: 5 },
        },
        {
          markerId: "markerold002",
          geometry: { kind: "circle", centerX: 70, centerY: 60, radius: 6 },
        },
      ],
      feedbackByMarkerId: {
        markerold002: {
          kind: "rich-text",
          document: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Feedback" }] }],
          },
        },
      },
      summaryFeedback: null,
    },
  };
  question.content = (question.content ?? []).map((child) =>
    child.type === "drag_drop_canvas"
      ? {
          ...child,
          attrs: {
            ...child.attrs,
            data: {
              image: { mode: "managed", mediaId: "map-image", alt: "Map" },
              imageAspectRatio: 2,
              defaultMarkerVisual: { kind: "preset", preset: "dot" },
              markers: [
                { id: "markerold001", label: "London", visualOverride: null },
                { id: "markerold002", label: "Paris", visualOverride: null },
              ],
            },
          },
        }
      : child,
  );
  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: createCoreScaffoldAuthoringComposition(),
    }),
    content,
  });
}

function authoringDocument(
  questionCount: number,
  withBoundaries = false,
  questionNodeType = SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-quiz");
  if (!definition) throw new Error("Expected slide-quiz Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const quiz = surface.content?.[0];
  if (!quiz || quiz.type !== SURFACE_QUIZ_NODE_TYPE) {
    throw new Error("Expected slide-quiz template to create a private Quiz.");
  }
  quiz.content = Array.from({ length: questionCount }, () => createQuizQuestion(questionNodeType));
  if (withBoundaries) {
    surface.attrs = {
      ...surface.attrs,
      settings: {
        ...surface.attrs?.["settings"],
        header: { enabled: true },
        footer: { enabled: true },
      },
    };
    surface.content = [boundary("surface_header"), quiz, boundary("surface_footer")];
  }
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          { type: "courseSection", attrs: { id: createEmbeddedNodeId(), title: "Intro" } },
          surface,
        ],
      },
    ],
  };
}

function boundary(type: "surface_header" | "surface_footer"): JSONContent {
  return {
    type,
    content: (["left", "center", "right"] as const).map((position) => ({
      type: "surface_header_footer_slot",
      attrs: { position },
      content: [{ type: "paragraph", attrs: { textAlign: position } }],
    })),
  };
}

function structure(currentEditor: Editor): {
  quizCount: number;
  questionIds: string[];
  questionTypes: string[];
} {
  let quizCount = 0;
  const questionIds: string[] = [];
  const questionTypes: string[] = [];
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name !== SURFACE_QUIZ_NODE_TYPE) return true;
    quizCount += 1;
    for (let index = 0; index < node.childCount; index += 1) {
      const question = node.child(index);
      const id = question.attrs["id"];
      if (typeof id !== "string") throw new Error("Expected a stable Quiz question ID.");
      questionIds.push(id);
      questionTypes.push(question.type.name);
    }
    return false;
  });
  return { quizCount, questionIds, questionTypes };
}

function quizQuestions(currentEditor: Editor): JSONContent[] {
  return quizQuestionsInDocument(currentEditor.getJSON());
}

function quizQuestionsInDocument(document: JSONContent): JSONContent[] {
  const pending = [document];
  while (pending.length > 0) {
    const node = pending.shift()!;
    if (node.type === SURFACE_QUIZ_NODE_TYPE) return node.content ?? [];
    pending.push(...(node.content ?? []));
  }
  throw new Error("Expected a private Quiz owner.");
}

function markerIds(question: JSONContent): string[] {
  const canvas = question.content?.find((child) => child.type === "drag_drop_canvas");
  const data = canvas?.attrs?.["data"] as { markers?: Array<{ id: string }> } | undefined;
  if (!data?.markers) throw new Error("Expected Drag and Drop marker data.");
  return data.markers.map(({ id }) => id);
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
      throw new Error("Timed out waiting for Quiz authoring fixture.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
