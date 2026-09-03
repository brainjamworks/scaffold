import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { projectCategoriseLearnerNode } from "@/editor/blocks/assessment/categorise/assessment";
import { slideCategoriseQuestionSurfaceDefinition } from "@/editor/surfaces/model/templates/assessment/slide-categorise-question";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";
import "@/styles/globals.css";

const mountedRoots: Root[] = [];
const mountedEditors: Editor[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  for (const editor of mountedEditors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

describe("full-slide Categorise runtime geometry", () => {
  it("keeps the sorting desk and assessment actions inside the Surface", async () => {
    const host = document.createElement("div");
    host.style.width = "1024px";
    host.style.height = "576px";
    document.body.append(host);
    const editor = createRuntimeEditor();
    const root = createRoot(host);
    mountedEditors.push(editor);
    mountedRoots.push(root);

    root.render(
      createAssessmentRuntimeTestRoot({
        children: <EditorContent editor={editor} />,
      }),
    );

    await waitForCondition(
      () => host.querySelector('[data-categorise-presentation="full-slide"]') !== null,
    );
    const surface = requiredElement<HTMLElement>(host, ".sc-assessment-slide-surface-runtime-view");
    expect(surface).toHaveClass("sc-slide-categorise-question-surface-runtime-view");
    const interaction = requiredElement<HTMLElement>(
      surface,
      '[data-categorise-presentation="full-slide"]',
    );
    const actions = requiredElement<HTMLElement>(surface, '[data-slot="assessment-actions-group"]');
    const title = requiredElement<HTMLElement>(surface, '[data-slot="assessment-title"]');
    const titleContent = requiredElement<HTMLElement>(title, "p");
    const instructions = requiredElement<HTMLElement>(
      surface,
      '[data-slot="assessment-instructions"]',
    );
    const prompt = requiredElement<HTMLElement>(surface, '[data-slot="assessment-prompt"]');
    const sourceItem = requiredElement<HTMLButtonElement>(
      interaction,
      ".sc-course-categorise__source-item",
    );
    const sourceViewport = requiredElement<HTMLElement>(
      interaction,
      ".sc-course-categorise__source-grid",
    );
    const sourceItemContent = requiredElement<HTMLElement>(
      sourceItem,
      ".sc-course-categorise__source-item-content",
    );
    const categoryDock = requiredElement<HTMLElement>(
      interaction,
      ".sc-course-categorise__bin-grid",
    );
    const categoryTarget = requiredElement<HTMLElement>(
      categoryDock,
      ".sc-course-categorise__category-target",
    );
    const categoryChoice = requiredElement<HTMLButtonElement>(
      categoryTarget,
      ".sc-course-categorise__category-choice",
    );
    const submit = requiredElement<HTMLButtonElement>(
      actions,
      '[data-assessment-submission-action="submit"]',
    );

    expect(getComputedStyle(surface).display).toBe("grid");
    expect(getComputedStyle(surface).paddingLeft).toBe("0px");
    expect(getComputedStyle(surface).paddingRight).toBe("0px");
    expect(interaction.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(interaction.hasAttribute("data-category-count")).toBe(true);
    expect(["auto", "hidden"]).toContain(getComputedStyle(interaction).overflowY);
    expect(surface.querySelector('[data-categorise-presentation="inline"]')).toBeNull();
    expect(interaction.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(
      Math.abs(interaction.getBoundingClientRect().left - surface.getBoundingClientRect().left),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(interaction.getBoundingClientRect().right - surface.getBoundingClientRect().right),
    ).toBeLessThan(2);
    expect(interaction.scrollHeight).toBeLessThanOrEqual(interaction.clientHeight + 1);
    expect(sourceItemContent.getBoundingClientRect().width).toBeGreaterThan(
      sourceItem.getBoundingClientRect().width * 0.5,
    );
    expect(
      Math.abs(
        sourceViewport.getBoundingClientRect().width - sourceItem.getBoundingClientRect().width,
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(title.getBoundingClientRect().top - instructions.getBoundingClientRect().top),
    ).toBeLessThan(4);
    expect(titleContent.scrollWidth).toBeLessThanOrEqual(titleContent.clientWidth + 1);
    expect(prompt.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      title.getBoundingClientRect().bottom,
    );
    expect(
      Math.abs(title.getBoundingClientRect().left - surface.getBoundingClientRect().left),
    ).toBeLessThan(2);
    expect(
      Math.abs(instructions.getBoundingClientRect().right - surface.getBoundingClientRect().right),
    ).toBeLessThan(2);
    expect(
      Math.abs(prompt.getBoundingClientRect().left - surface.getBoundingClientRect().left),
    ).toBeLessThan(2);
    expect(
      Math.abs(prompt.getBoundingClientRect().right - surface.getBoundingClientRect().right),
    ).toBeLessThan(2);
    expect(
      Math.abs(actions.getBoundingClientRect().left - surface.getBoundingClientRect().left),
    ).toBeLessThan(2);
    expect(
      Math.abs(actions.getBoundingClientRect().right - surface.getBoundingClientRect().right),
    ).toBeLessThan(2);
    expect(
      Math.abs(actions.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        categoryDock.getBoundingClientRect().bottom - interaction.getBoundingClientRect().bottom,
      ),
    ).toBeLessThan(2);
    expect(sourceItem.getBoundingClientRect().height).toBeLessThan(120);
    expect(categoryTarget.getBoundingClientRect().height).toBeGreaterThan(120);
    expect(categoryTarget.getBoundingClientRect().height).toBeGreaterThan(
      sourceItem.getBoundingClientRect().height,
    );
    expect(
      Math.abs(
        categoryChoice.getBoundingClientRect().height -
          categoryTarget.getBoundingClientRect().height,
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        submit.getBoundingClientRect().right -
          (actions.getBoundingClientRect().right -
            parseFloat(getComputedStyle(actions).paddingRight)),
      ),
    ).toBeLessThan(2);
  });

  it("animates the backward carousel track from the departing card to the current card", async () => {
    const viewport = document.createElement("div");
    viewport.style.width = "512px";
    viewport.setAttribute("data-item-transition", "backward");
    viewport.className = "sc-course-categorise__source-grid";
    const track = document.createElement("div");
    track.setAttribute("data-item-carousel-track", "");
    track.setAttribute("data-item-transition", "backward");
    track.className = "sc-course-categorise__source-track";
    track.append(document.createElement("div"), document.createElement("div"));
    viewport.append(track);

    await new Promise(requestAnimationFrame);
    document.body.append(viewport);
    await new Promise(requestAnimationFrame);

    expect(track.getAnimations()).toHaveLength(1);
    expect(getComputedStyle(track).transitionProperty).toBe("transform");
  });
});

function createRuntimeEditor() {
  return new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    }),
    content: categoriseQuestionDocument(),
  });
}

function categoriseQuestionDocument(): JSONContent {
  const surface = slideCategoriseQuestionSurfaceDefinition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Categorise Question Surface content.");
  const document = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "surface00001",
    initialCourseSectionTitle: "Introduction",
  });
  const courseDocument = document.content?.[0];
  const section = courseDocument?.content?.find((child) => child.type === "courseSection");
  if (courseDocument?.type !== "courseDocument" || !section) {
    throw new Error("Expected a Slideshow document fixture.");
  }

  courseDocument.content = [
    section,
    {
      ...surface,
      content: [
        projectCategoriseLearnerNode({
          ...question,
          attrs: { ...question.attrs, id: "target000001" },
          content: (question.content ?? []).map((child) =>
            child.type === "assessment_prompt"
              ? {
                  ...child,
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Sort each animal into its category." }],
                    },
                  ],
                }
              : child,
          ),
        }),
      ],
    },
  ];
  return document;
}

function requiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (condition()) return;
    await new Promise(requestAnimationFrame);
  }
  throw new Error("Timed out waiting for full-slide Categorise render");
}
