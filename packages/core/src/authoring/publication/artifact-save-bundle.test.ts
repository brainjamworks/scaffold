import { describe, expect, it } from "vite-plus/test";
import type { JSONContent } from "@tiptap/core";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  ARTIFACT_SAVE_PAYLOAD_LIMITS,
  projectArtifactSaveBundle,
  validateArtifactSaveBundleSize,
} from "./artifact-save-bundle";

describe("artifact save bundle publication", () => {
  it("projects the author document into a save bundle", () => {
    const authorDocument: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };

    const bundle = projectArtifactSaveBundle(
      { artifact: artifact("doc-1", "Draft title", authorDocument) },
      builtInBlockRegistry,
    );

    expect(bundle).toMatchObject({
      artifact: {
        id: "doc-1",
        title: "Draft title",
        mode: "page",
        content: authorDocument,
      },
      learnerContent: authorDocument,
      assessmentTargets: [],
      assessmentGroups: [],
    });
  });

  it("rejects oversized author documents", () => {
    const authorDocument: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x".repeat(ARTIFACT_SAVE_PAYLOAD_LIMITS.artifactContentBytes + 1),
            },
          ],
        },
      ],
    };

    const bundle = projectArtifactSaveBundle(
      { artifact: artifact("doc-1", "Oversized", authorDocument) },
      builtInBlockRegistry,
    );

    expect(() => validateArtifactSaveBundleSize(bundle)).toThrow(
      /Artifact content is too large to save/,
    );
  });

  it("projects migrated author content with regenerated learner content and assessment targets", () => {
    const authorDocument = pageDocumentWithSurfaceContent("surface00001", [
      persistenceMcqBlock("assess000001", { points: 2, maxAttempts: 3 }),
    ]);

    const bundle = projectArtifactSaveBundle(
      { artifact: artifact("doc-1", "Migrated title", authorDocument) },
      builtInBlockRegistry,
    );

    expect(bundle).toMatchObject({
      artifact: {
        id: "doc-1",
        title: "Migrated title",
        mode: "page",
        content: authorDocument,
      },
      assessmentTargets: [
        {
          schemaVersion: 2,
          targetId: "assess000001",
          blockType: "mcq",
          blockId: "assess000001",
          interaction: {
            kind: "single-select",
            options: [
              { id: "option000001", label: "A" },
              { id: "option000002", label: "B" },
            ],
          },
          assessment: {
            kind: "single-select",
            correctOptionId: "option000001",
            feedbackByOptionId: {},
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer: true,
            points: 2,
            maxAttempts: 3,
          },
        },
      ],
    });
    const learnerMcqAttrs = firstDescendant(bundle.learnerContent, "mcq")?.attrs;
    expect(learnerMcqAttrs).toMatchObject({ id: "assess000001" });
    expect(learnerMcqAttrs).not.toHaveProperty("assessment");
  });

  it("uses the explicitly installed Block lookup", () => {
    const authorDocument = pageDocumentWithSurfaceContent("surface00001", [
      persistenceMcqBlock("assess000001", { points: 2, maxAttempts: 3 }),
    ]);

    const bundle = projectArtifactSaveBundle(
      { artifact: artifact("doc-1", "Private application", authorDocument) },
      createBlockRegistry([]),
    );

    expect(bundle.assessmentTargets).toEqual([]);
    expect(firstDescendant(bundle.learnerContent, "mcq")?.attrs).toHaveProperty("assessment");
  });

  it("projects quiz assessment groups into the save bundle", () => {
    const authorDocument = pageDocumentWithSurfaceContent("surfaceQuiz1", [
      {
        type: "quiz",
        attrs: {
          id: "quiz00000001",
          settings: {
            allowBacktracking: false,
            attemptsPerQuestion: 1,
            reviewDetail: "full_review",
            reviewTiming: "after_each_answer",
            isGraded: true,
            timer: { enabled: false, durationSeconds: 0 },
          },
        },
        content: [persistenceMcqBlock("quizTarget01", { points: 1, maxAttempts: null })],
      },
    ]);

    const bundle = projectArtifactSaveBundle(
      { artifact: artifact("doc-quiz", "Quiz title", authorDocument) },
      builtInBlockRegistry,
    );

    expect(bundle.assessmentGroups).toEqual([
      {
        schemaVersion: 2,
        kind: "quiz",
        groupId: "quiz00000001",
        targetIds: ["quizTarget01"],
        settings: {
          allowBacktracking: false,
          attemptsPerQuestion: 1,
          reviewDetail: "full_review",
          reviewTiming: "after_each_answer",
          isGraded: true,
          passingScore: null,
          timer: { enabled: false, durationSeconds: 0 },
        },
      },
    ]);
  });
});

function persistenceMcqBlock(
  id: string,
  settings: { points: number; maxAttempts: number | null },
): JSONContent {
  return {
    type: "mcq",
    attrs: {
      id,
      assessment: {
        correctOptionId: "option000001",
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: settings.points,
        maxAttempts: settings.maxAttempts,
      },
    },
    content: [
      emptyAssessmentField("assessment_title"),
      emptyAssessmentField("assessment_instructions"),
      emptyAssessmentField("assessment_prompt"),
      {
        type: "assessment_choices_group",
        content: [selectableChoice("option000001", "A"), selectableChoice("option000002", "B")],
      },
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function selectableChoice(id: string, label: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
      },
    ],
  };
}

function emptyAssessmentField(type: string): JSONContent {
  return { type, content: [{ type: "paragraph" }] };
}

function artifact(id: string, title: string, content: JSONContent) {
  return {
    id,
    title,
    mode: "page" as const,
    content,
  };
}

function pageDocumentWithSurfaceContent(surfaceId: string, content: JSONContent[]): JSONContent {
  const document = createScaffoldDocumentContent({
    mode: "page",
    surfaceId,
  });
  const surface = document.content?.[0]?.content?.[0];
  if (!surface) {
    throw new Error("expected default page surface");
  }
  surface.content = content;
  return document;
}

function firstDescendant(node: JSONContent | undefined, type: string): JSONContent | null {
  if (!node) return null;
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const found = firstDescendant(child, type);
    if (found) return found;
  }
  return null;
}
