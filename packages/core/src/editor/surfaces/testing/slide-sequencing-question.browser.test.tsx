import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { fireEvent } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { projectSequencingLearnerNode } from "@/editor/blocks/assessment/sequencing/assessment";
import { TestInteractionDragEnvironment } from "@/editor/interactions/drag/testing/TestInteractionDragEnvironment";
import { slideSequencingQuestionSurfaceDefinition } from "@/editor/surfaces/model/templates/assessment/slide-sequencing-question";
import { createScaffoldDocumentContent } from "@/format/artifact";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  localAssessmentResponse,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import type { AssessmentPort } from "@/host/ports";
import "@/styles/globals.css";

const mountedRoots: Root[] = [];
const mountedEditors: Editor[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  for (const editor of mountedEditors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

describe("full-slide Sequencing runtime geometry", () => {
  it("uses the slide width for a contained, numbered ordering rail", async () => {
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
      () => host.querySelector('[data-sequencing-presentation="full-slide"]') !== null,
    );
    const surface = requiredElement<HTMLElement>(host, ".sc-assessment-slide-surface-runtime-view");
    const interaction = requiredElement<HTMLElement>(
      surface,
      '[data-sequencing-presentation="full-slide"]',
    );
    const list = requiredElement<HTMLElement>(interaction, ".sc-course-sequencing__list");
    const rows = Array.from(
      interaction.querySelectorAll<HTMLElement>(".sc-course-sequencing__item"),
    );
    const positions = Array.from(
      interaction.querySelectorAll<HTMLElement>(".sc-course-sequencing__position"),
    );
    const actions = requiredElement<HTMLElement>(surface, '[data-slot="assessment-actions-group"]');

    expect(interaction.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.8,
    );
    expect(list.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.68,
    );
    expect(rows).toHaveLength(3);
    expect(positions).toHaveLength(rows.length);
    for (const row of rows) {
      expect(row.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.68,
      );
      expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(60);
    }
    for (let index = 1; index < positions.length; index += 1) {
      expect(
        Math.abs(
          positions[index]!.getBoundingClientRect().left -
            positions[0]!.getBoundingClientRect().left,
        ),
      ).toBeLessThanOrEqual(2);
    }
    const railStyle = getComputedStyle(list, "::before");
    const listRect = list.getBoundingClientRect();
    const firstPositionRect = positions[0]!.getBoundingClientRect();
    const lastPositionRect = positions.at(-1)!.getBoundingClientRect();
    expect(railStyle.content).not.toBe("none");
    expect(listRect.left + Number.parseFloat(railStyle.left)).toBeCloseTo(
      firstPositionRect.left + firstPositionRect.width / 2,
      0,
    );
    expect(Number.parseFloat(railStyle.top)).toBeCloseTo(
      firstPositionRect.top + firstPositionRect.height / 2 - listRect.top,
      0,
    );
    expect(Number.parseFloat(railStyle.bottom)).toBeCloseTo(
      listRect.bottom - (lastPositionRect.top + lastPositionRect.height / 2),
      0,
    );
    expect(interaction.scrollHeight).toBeLessThanOrEqual(interaction.clientHeight + 1);
    expect(
      Math.abs(actions.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
    ).toBeLessThan(2);
  });

  it("uses compact row geometry for nine or more authored items", async () => {
    const host = document.createElement("div");
    host.style.width = "1024px";
    host.style.height = "576px";
    document.body.append(host);
    const editor = createRuntimeEditor(9);
    const root = createRoot(host);
    mountedEditors.push(editor);
    mountedRoots.push(root);

    root.render(
      createAssessmentRuntimeTestRoot({
        children: <EditorContent editor={editor} />,
      }),
    );

    await waitForCondition(
      () => host.querySelector('[data-sequencing-presentation="full-slide"]') !== null,
    );
    const interaction = requiredElement<HTMLElement>(
      host,
      '[data-sequencing-presentation="full-slide"]',
    );
    const rows = Array.from(
      interaction.querySelectorAll<HTMLElement>(".sc-course-sequencing__item"),
    );

    expect(interaction).toHaveAttribute("data-sequencing-density", "compact");
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      expect(row.getBoundingClientRect().height).toBeLessThanOrEqual(62.5);
    }
  });

  it("reorders by keyboard and submits the resulting full-slide response", async () => {
    const host = document.createElement("div");
    host.style.cssText = "position: relative; width: 1024px; height: 576px";
    document.body.append(host);
    const editor = createRuntimeEditor();
    const root = createRoot(host);
    let assessmentStore: AssessmentStoreApi | null = null;
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: false,
          score: { scaled: 0 },
          items: {},
        },
        { response: request.response },
      ),
    );
    mountedEditors.push(editor);
    mountedRoots.push(root);

    root.render(
      createAssessmentRuntimeTestRoot({
        assessment: { type: "runtime", submit },
        onStore: (store) => {
          assessmentStore = store;
        },
        children: (
          <TestInteractionDragEnvironment
            collisionBoundary={host}
            coordinateKind="viewport"
            overlayHost={host}
            root={host}
          >
            <EditorContent editor={editor} />
          </TestInteractionDragEnvironment>
        ),
      }),
    );

    await waitForCondition(
      () =>
        hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:target000001") &&
        Array.isArray(
          localAssessmentResponse(assessmentStore, "artifact:artifact-1/block:target000001")?.[
            "order"
          ],
        ),
    );
    const problemId = "artifact:artifact-1/block:target000001";
    const before = localAssessmentResponse(assessmentStore, problemId)?.["order"];
    if (!Array.isArray(before)) throw new Error("Expected a seeded Sequencing order.");
    const firstHandle = requiredElement<HTMLButtonElement>(
      host,
      "[data-runtime-sequencing-handle]",
    );
    expect(firstHandle.getAttribute("aria-label")).toMatch(/^Reorder .+, position 1 of 3$/);

    firstHandle.focus({ preventScroll: true });
    fireEvent.keyDown(firstHandle, { code: "Space", key: " " });
    await animationFrames(2);
    fireEvent.keyDown(firstHandle, { code: "ArrowDown", key: "ArrowDown" });
    await animationFrames(2);
    fireEvent.keyDown(firstHandle, { code: "Space", key: " " });

    await waitForCondition(() => {
      const after = localAssessmentResponse(assessmentStore, problemId)?.["order"];
      return Array.isArray(after) && after.join("|") !== before.join("|");
    });
    const submitButton = requiredElement<HTMLButtonElement>(
      host,
      '[data-assessment-submission-action="submit"]',
    );
    expect(submitButton.disabled).toBe(false);
    submitButton.click();

    await waitForCondition(() => submit.mock.calls.length === 1);
    expect(submit.mock.calls[0]?.[0].response).toEqual({
      kind: "sequence",
      orderedItemIds: localAssessmentResponse(assessmentStore, problemId)?.["order"],
    });
    await waitForCondition(() =>
      Array.from(host.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Try again",
      ),
    );
  });
});

function createRuntimeEditor(itemCount = 3) {
  return new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    }),
    content: sequencingQuestionDocument(itemCount),
  });
}

function sequencingQuestionDocument(itemCount = 3): JSONContent {
  const surface = slideSequencingQuestionSurfaceDefinition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Sequencing Question Surface content.");
  const questionContent = question.content ?? [];
  const group = questionContent.find((child) => child.type === "sequencing_items_group");
  const labels = [
    "Establish the shared slide assessment foundation",
    "Separate structural interaction CSS from Course presentation",
    "Verify the complete learner journey in the real slideshow",
  ];
  const sourceItems: JSONContent[] = group?.content ?? [];
  const fallbackItem = sourceItems[0];
  if (!fallbackItem) throw new Error("Expected a Sequencing item template.");
  const itemIds = Array.from(
    { length: itemCount },
    (_, index) => `seqitm_${String(index + 1).padStart(5, "0")}`,
  );
  const labelledItems = itemIds.map((id, index) => ({
    ...(sourceItems[index] ?? fallbackItem),
    attrs: { ...(sourceItems[index] ?? fallbackItem).attrs, id },
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: labels[index] ?? `Sequence step ${index + 1}`,
          },
        ],
      },
    ],
  }));
  const labelledQuestion: JSONContent = {
    ...question,
    attrs: {
      ...question.attrs,
      id: "target000001",
      assessment: { ...question.attrs?.["assessment"], correctOrder: itemIds },
    },
    content: questionContent.map((child) =>
      child.type === "sequencing_items_group" ? { ...child, content: labelledItems } : child,
    ),
  };

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
      content: [projectSequencingLearnerNode(labelledQuestion)],
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
  throw new Error("Timed out waiting for full-slide Sequencing render");
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise(requestAnimationFrame);
  }
}
