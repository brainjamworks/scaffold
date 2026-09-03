import type { JSONContent } from "@tiptap/core";
import { AssessmentGroupContractSchema, AssessmentTargetContractSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import {
  defineAssessmentCapability,
  defineBlock,
  type BlockDefinition,
} from "@/editor/blocks/block-definition";
import { createBlockRegistry, type BlockRegistry } from "@/editor/blocks/block-registry";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import { mcqResponseCodec } from "@/editor/assessment/mcq/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import {
  projectLearnerPublication,
  projectAssessmentDocument as projectAssessmentDocumentWithBlocks,
  projectAssessmentTargets as projectAssessmentTargetsWithBlocks,
  projectLearnerDocument as projectLearnerDocumentWithBlocks,
} from "./document-projection";

function projectBuiltInAssessmentDocument(authorDocument: JSONContent) {
  return projectAssessmentDocumentWithBlocks(
    supported(authorDocument),
    builtInBlockRegistry,
    builtInSurfaceVariantRegistry,
  );
}

function projectAssessmentTargets(authorDocument: JSONContent) {
  return projectAssessmentTargetsWithBlocks(
    supported(authorDocument),
    builtInBlockRegistry,
    builtInSurfaceVariantRegistry,
  );
}

function projectLearnerDocument(authorDocument: JSONContent) {
  return projectLearnerDocumentWithBlocks(
    supported(authorDocument),
    builtInBlockRegistry,
    builtInSurfaceVariantRegistry,
  );
}

function supported(canonicalDocument: JSONContent) {
  return { status: "supported" as const, canonicalDocument };
}

const blockRegistryOverride = vi.hoisted<{ current: BlockRegistry | null }>(() => ({
  current: null,
}));

vi.mock("@/editor/blocks/built-in-block-definitions", async (importOriginal) => {
  // This imports definition modules without either lane extension array. Until Phase 5,
  // those legacy definition leaves still execute their registration and catalog writes.
  const actual =
    await importOriginal<typeof import("@/editor/blocks/built-in-block-definitions")>();
  const activeRegistry = () => blockRegistryOverride.current ?? actual.builtInBlockRegistry;

  return {
    ...actual,
    builtInBlockRegistry: {
      get definitions() {
        return activeRegistry().definitions;
      },
      getByNodeType(nodeType: string) {
        return activeRegistry().getByNodeType(nodeType);
      },
      get assessmentNodeTypes() {
        return activeRegistry().assessmentNodeTypes;
      },
      get resizableNodeTypes() {
        return activeRegistry().resizableNodeTypes;
      },
    },
  };
});

describe("authoring publication document projection", () => {
  it.each([
    {
      readiness: {
        status: "requires-scaffold-plus" as const,
      },
    },
    {
      readiness: {
        status: "unavailable-content" as const,
        unavailableContent: [
          {
            kind: "block" as const,
            capabilityId: "plus_private_block",
            stableId: "plusblock001",
            path: ["content", 0, "content", 0] as const,
          },
        ],
      },
    },
    {
      readiness: {
        status: "invalid" as const,
        issues: [{ code: "invalid_document", message: "Invalid document.", path: [] }],
      },
    },
    {
      readiness: {
        status: "unsupported-core-format" as const,
        documentVersion: 5,
        supportedVersion: 4,
        message: "This document uses a future Core format.",
      },
    },
  ])("does not invoke learner projection for $readiness.status readiness", ({ readiness }) => {
    const getByNodeType = vi.fn(() => {
      throw new Error("projection lookup must not run for rejected readiness");
    });
    const getSurfaceVariant = vi.fn(() => {
      throw new Error("Surface projection lookup must not run for rejected readiness");
    });

    const result = projectLearnerPublication(
      readiness,
      { getByNodeType },
      { get: getSurfaceVariant },
    );

    expect(result).toBe(readiness);
    expect(getByNodeType).not.toHaveBeenCalled();
    expect(getSurfaceVariant).not.toHaveBeenCalled();
  });

  it("preserves exact Course theme references for learners", () => {
    const theme = {
      schemaVersion: 1 as const,
      design: { id: "scaffold-flow", revision: "1" },
      colourSystem: { id: "scaffold-indigo", revision: "1" },
      overrides: {},
    };
    const document: JSONContent = {
      type: "courseDocument",
      attrs: { theme },
      content: [
        {
          type: "surface",
          attrs: { id: "surface00001", variant: "page-default" },
          content: [{ type: "paragraph" }],
        },
      ],
    };

    const projectedTheme = projectLearnerDocument(document).document.attrs?.["theme"];
    expect(projectedTheme).toEqual(theme);
    expect(projectedTheme).not.toHaveProperty("preset");
    expect(projectedTheme).not.toHaveProperty("values");
  });

  it("projects a Surface-owned Categorise question as one classify target", () => {
    const projection = projectBuiltInAssessmentDocument(categoriseQuestionDocument("categorise01"));

    expect(projection.targets).toEqual([
      {
        schemaVersion: 2,
        targetId: "categorise01",
        blockId: "categorise01",
        blockType: "categorise",
        interaction: {
          kind: "classify",
          categories: [
            { id: "category0001", label: "Mammal" },
            { id: "category0002", label: "Bird" },
          ],
          items: [
            { id: "item00000002", label: "Robin" },
            { id: "item00000001", label: "Whale" },
          ],
        },
        assessment: {
          kind: "classify",
          correctPlacements: [
            { itemId: "item00000002", categoryId: "category0002" },
            { itemId: "item00000001", categoryId: "category0001" },
          ],
          feedbackByItemId: {
            item00000001: richFeedback("Whales are mammals"),
          },
          summaryFeedback: richFeedback("Review the animal groups"),
        },
        settings: {
          feedbackMode: "on_submit",
          isGraded: true,
          showAnswer: true,
          points: 3,
          maxAttempts: 2,
          legend: "Sort each animal",
        },
      },
    ]);
    expect(projection.warnings).toEqual([]);
    expect(AssessmentTargetContractSchema.parse(projection.targets[0])).toEqual(
      projection.targets[0],
    );
  });

  it("keeps a missing Surface-owned assessment target id observable", () => {
    expect(() => projectBuiltInAssessmentDocument(categoriseQuestionDocument(null))).toThrow(
      'Surface "slide-categorise-question" question is missing its assessment target id.',
    );
  });

  it("keeps an unsupported Categorise question Surface structure observable", () => {
    const document = categoriseQuestionDocument("categorise01");
    document.content![0]!.content!.push({ type: "paragraph" });

    expect(() => projectBuiltInAssessmentDocument(document)).toThrow(
      'Surface "slide-categorise-question" must contain exactly one categorise question.',
    );
  });

  it("keeps invalid Surface-owned assessment contract data observable", () => {
    const document = categoriseQuestionDocument("categorise01");
    const question = firstDescendant(document, "surface_categorise_question");
    question.attrs = { ...question.attrs, settings: { feedbackMode: "after_quiz" } };

    expect(() => projectBuiltInAssessmentDocument(document)).toThrow();
  });

  it("keeps unexpected Surface projection defects observable", () => {
    const ordinarySurface = builtInSurfaceVariantRegistry.get("page-default");
    if (!ordinarySurface) throw new Error("Expected the ordinary test Surface variant");
    const surfaceVariants = {
      get: (variantId: string) =>
        variantId === "defective-assessment-surface"
          ? {
              ...ordinarySurface,
              id: variantId,
              assessmentTargets: {
                projectTargets: () => {
                  throw new Error("Surface projection invariant failed");
                },
                projectLearnerSurface: (surface: JSONContent) => surface,
              },
            }
          : builtInSurfaceVariantRegistry.get(variantId),
    };

    expect(() =>
      projectAssessmentDocumentWithBlocks(
        supported({
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface00018", variant: "defective-assessment-surface" },
            },
          ],
        }),
        builtInBlockRegistry,
        surfaceVariants,
      ),
    ).toThrow("Surface projection invariant failed");
  });

  it("redacts private Surface-owned assessment data while preserving learner content", () => {
    const projection = projectBuiltInAssessmentDocument(categoriseQuestionDocument("categorise01"));
    const learnerQuestion = firstDescendant(
      projection.learnerDocument,
      "surface_categorise_question",
    );
    const learnerJson = JSON.stringify(learnerQuestion);

    expect(attrsOf(learnerQuestion)).toEqual({
      id: "categorise01",
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 3,
        maxAttempts: 2,
        legend: "Sort each animal",
      },
    });
    expect(learnerJson).not.toContain('"assessment"');
    expect(learnerJson).not.toContain("Whales are mammals");
    expect(learnerJson).not.toContain("Review the animal groups");
    expect(textBetween(learnerQuestion)).toContain("Categorise animals");
    expect(textBetween(learnerQuestion)).toContain("Mammal");
    expect(textBetween(learnerQuestion)).toContain("Whale");
  });

  it("treats ordinary Surface variants as a no-op assessment source", () => {
    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00016", variant: "page-default" },
          content: [fieldWithText("paragraph", "Ordinary content")],
        },
      ],
    };

    const projection = projectBuiltInAssessmentDocument(document);

    expect(projection.targets).toEqual([]);
    expect(projection.warnings).toEqual([]);
    expect(projection.learnerDocument).toEqual(document);
  });

  it("reads assessment projection from the explicit built-in registry", async () => {
    const configurationSchema = z.object({
      feedbackMode: z.literal("immediate").default("immediate"),
      isGraded: z.boolean().default(true),
      showAnswer: z.boolean().default(false),
      points: z.number().default(1),
      maxAttempts: z.number().nullable().default(null),
    });

    const definition = defineBlock({
      nodeType: "registry_owned_projection_assessment",
      title: "Registry-owned projection assessment",
      configuration: createAssessmentConfiguration({
        schema: configurationSchema,
        title: "Registry projection settings",
      }),
      capabilities: {
        assessment: defineAssessmentCapability({
          interactionKind: "single-select",
          experience: {
            submit: true,
            attempts: true,
            hints: true,
            showAnswer: true,
            summaryFeedback: true,
            perItemFeedback: true,
          },
          response: mcqResponseCodec,
          projection: {
            projectInteraction: () => ({
              kind: "single-select",
              options: [{ id: "option000001", label: "Registered option" }],
            }),
            projectAssessment: () => ({
              kind: "single-select",
              correctOptionId: "option000001",
              feedbackByOptionId: {
                option000001: richFeedback("Capability feedback"),
              },
            }),
            projectLearnerNode: (node) => ({
              ...node,
              attrs: {
                id: "assess000001",
                projectedBy: "capability",
              },
              content: [{ type: "paragraph" }],
            }),
          },
        }),
      },
    });

    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00002", variant: "page-default" },
          content: [
            {
              type: "registry_owned_projection_assessment",
              attrs: {
                id: "assess000001",
                privateAnswer: "do-not-leak",
                settings: {},
              },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Author text" }],
                },
              ],
            },
            {
              type: "registry_owned_projection_unknown",
              attrs: { id: "unknwn000001" },
            },
          ],
        },
      ],
    };

    const projection = await withBlockDefinitions(
      [definition],
      ({ projectConfiguredAssessmentDocument }) => projectConfiguredAssessmentDocument(document),
    );

    expect(projection.targets).toEqual([
      {
        schemaVersion: 2,
        targetId: "assess000001",
        blockType: "registry_owned_projection_assessment",
        blockId: "assess000001",
        interaction: {
          kind: "single-select",
          options: [{ id: "option000001", label: "Registered option" }],
        },
        assessment: {
          kind: "single-select",
          correctOptionId: "option000001",
          feedbackByOptionId: {
            option000001: richFeedback("Capability feedback"),
          },
        },
        settings: {
          feedbackMode: "immediate",
          isGraded: true,
          showAnswer: false,
          points: 1,
          maxAttempts: null,
        },
      },
    ]);
    expect(
      attrsOf(firstDescendant(projection.learnerDocument, "registry_owned_projection_assessment")),
    ).toEqual({
      id: "assess000001",
      projectedBy: "capability",
    });
    expect(projection.warnings).toEqual([]);
    expect(
      projection.targets.map((target) => AssessmentTargetContractSchema.parse(target)),
    ).toEqual(projection.targets);
    expect(JSON.stringify(projection.learnerDocument)).not.toContain("do-not-leak");
    expect(JSON.stringify(projection.learnerDocument)).not.toContain("Capability feedback");
  });

  it("ignores unknown non-assessment nodes during projection", () => {
    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00003", variant: "page-default" },
          content: [
            {
              type: "unknown_non_assessment_node",
              attrs: { id: "unknown00001", privateAnswer: "not-assessment" },
            },
          ],
        },
      ],
    };

    expect(projectBuiltInAssessmentDocument(document)).toEqual({
      learnerDocument: document,
      targets: [],
      groups: [],
      warnings: [],
    });
  });

  it("omits a truly empty quiz from learner output without a warning", () => {
    const authorDocument: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00004", variant: "page-default" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Published lesson content" }],
            },
            {
              type: "quiz",
              attrs: { id: "quiz00000001", settings: {} },
            },
          ],
        },
      ],
    };
    const projection = projectBuiltInAssessmentDocument(authorDocument);

    expect(projection.targets).toEqual([]);
    expect(projection.groups).toEqual([]);
    expect(projection.warnings).toEqual([]);
    expect(descendantsOfType(projection.learnerDocument, "quiz")).toEqual([]);
    expect(firstDescendant(projection.learnerDocument, "paragraph")).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Published lesson content" }],
    });
    expect(firstDescendant(authorDocument, "quiz")).toEqual({
      type: "quiz",
      attrs: { id: "quiz00000001", settings: {} },
    });
  });

  it("projects quiz groups with ordered child assessment target ids", () => {
    const projection = projectBuiltInAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00005", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: {
                id: "quiz00000002",
                settings: {
                  allowBacktracking: false,
                  reviewTiming: "after_each_answer",
                  reviewDetail: "full_review",
                  attemptsPerQuestion: 2,
                  passingScore: 0.8,
                },
              },
              content: [
                mcqBlock("mcqQuiz00001", "option000001"),
                mcqBlock("mcqQuiz00002", "option000002"),
              ],
            },
          ],
        },
      ],
    });

    expect(projection.targets.map((target) => target.targetId)).toEqual([
      "mcqQuiz00001",
      "mcqQuiz00002",
    ]);
    expect(projection.groups).toEqual([
      {
        schemaVersion: 2,
        kind: "quiz",
        groupId: "quiz00000002",
        targetIds: ["mcqQuiz00001", "mcqQuiz00002"],
        settings: {
          allowBacktracking: false,
          reviewTiming: "after_each_answer",
          reviewDetail: "full_review",
          attemptsPerQuestion: 2,
          isGraded: true,
          passingScore: 0.8,
          timer: {
            enabled: false,
            durationSeconds: 0,
          },
        },
      },
    ]);
    expect(projection.groups[0]).not.toHaveProperty("assessment");
    expect(projection.groups[0]).not.toHaveProperty("interaction");
    expect(AssessmentGroupContractSchema.parse(projection.groups[0])).toEqual(projection.groups[0]);
  });

  it("warns and skips quiz groups with duplicate target ids", () => {
    const projection = projectBuiltInAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00006", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: { id: "quiz00000003", settings: {} },
              content: [
                mcqBlock("duplTarget01", "option000001"),
                mcqBlock("duplTarget01", "option000002"),
              ],
            },
          ],
        },
      ],
    });

    expect(projection.groups).toEqual([]);
    expect(projection.warnings).toContainEqual({
      code: "invalid-assessment-group",
      blockType: "quiz",
      blockId: "quiz00000003",
      surfaceId: "surface00006",
      message:
        "Quiz contains children without projected assessment targets; projection omitted its assessment group.",
    });
  });

  it("warns and skips quiz groups with children missing projected targets", () => {
    const projection = projectBuiltInAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00007", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: { id: "quiz00000004", settings: {} },
              content: [
                mcqBlock("mcqValid0001", "option000001"),
                {
                  type: "unknown_child",
                  attrs: { id: "assess000004" },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(projection.targets.map((target) => target.targetId)).toEqual(["mcqValid0001"]);
    expect(projection.groups).toEqual([]);
    expect(projection.warnings).toContainEqual({
      code: "invalid-assessment-group",
      blockType: "quiz",
      blockId: "quiz00000004",
      surfaceId: "surface00007",
      message:
        "Quiz contains children without projected assessment targets; projection omitted its assessment group.",
    });
  });

  it("does not invent quiz target ids for malformed child content without ids", () => {
    const projection = projectBuiltInAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00008", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: { id: "quiz00000005", settings: {} },
              content: [
                {
                  ...mcqBlock("mcqIdless001", "option000001"),
                  attrs: {
                    ...mcqBlock("mcqIdless001", "option000001").attrs,
                    id: "",
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(projection.targets).toEqual([]);
    expect(projection.groups).toEqual([]);
    expect(projection.warnings).toContainEqual({
      code: "missing-block-id",
      blockType: "mcq",
      blockId: null,
      surfaceId: "surface00008",
      message:
        "Assessment block has no id; projection omitted its target because server storage cannot address it stably.",
    });
    expect(projection.warnings).toContainEqual({
      code: "invalid-assessment-group",
      blockType: "quiz",
      blockId: "quiz00000005",
      surfaceId: "surface00008",
      message:
        "Quiz contains children without projected assessment targets; projection omitted its assessment group.",
    });
  });

  it("throws clearly when a registered assessment block has no projection", async () => {
    const definition = defineBlock({
      nodeType: "missing_projection_assessment",
      title: "Missing projection assessment",
      capabilities: {
        assessment: defineAssessmentCapability({
          interactionKind: "single-select",
          experience: {
            submit: true,
            attempts: true,
            hints: true,
            showAnswer: true,
            summaryFeedback: true,
            perItemFeedback: true,
          },
          response: mcqResponseCodec,
          projection: undefined as never,
        }),
      },
    });

    await expect(
      withBlockDefinitions([definition], ({ projectConfiguredAssessmentDocument }) =>
        projectConfiguredAssessmentDocument({
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: {
                id: "surface00009",
                variant: "page-default",
              },
              content: [
                {
                  type: "missing_projection_assessment",
                  attrs: { id: "assess000005" },
                },
              ],
            },
          ],
        }),
      ),
    ).rejects.toThrow(
      'Assessment block "missing_projection_assessment" (missing_projection_assessment) is missing capabilities.assessment.projection.',
    );
  });

  it("throws clearly when a registered assessment block has no settings attr schema", async () => {
    const definition = defineBlock({
      nodeType: "missing_settings_contract_assessment",
      title: "Missing settings contract assessment",
      capabilities: {
        assessment: defineAssessmentCapability({
          interactionKind: "single-select",
          experience: {
            submit: true,
            attempts: true,
            hints: true,
            showAnswer: true,
            summaryFeedback: true,
            perItemFeedback: true,
          },
          response: mcqResponseCodec,
          projection: {
            projectInteraction: () => ({
              kind: "single-select",
              options: [],
            }),
            projectAssessment: () => ({
              kind: "single-select",
              correctOptionId: null,
              feedbackByOptionId: {},
            }),
            projectLearnerNode: (node) => node,
          },
        }),
      },
    });

    await expect(
      withBlockDefinitions([definition], ({ projectConfiguredAssessmentDocument }) =>
        projectConfiguredAssessmentDocument({
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: {
                id: "surface00010",
                variant: "page-default",
              },
              content: [
                {
                  type: "missing_settings_contract_assessment",
                  attrs: { id: "assess000006" },
                },
              ],
            },
          ],
        }),
      ),
    ).rejects.toThrow(
      'Assessment block "missing_settings_contract_assessment" (missing_settings_contract_assessment) is missing settings attr schema.',
    );
  });

  it("validates projected assessment targets before returning them", async () => {
    const configurationSchema = z.object({
      feedbackMode: z.literal("on_submit").default("on_submit"),
      isGraded: z.boolean().default(true),
      showAnswer: z.boolean().default(true),
      points: z.number().default(1),
      maxAttempts: z.number().nullable().default(null),
    });

    const definition = defineBlock({
      nodeType: "invalid_contract_projection_assessment",
      title: "Invalid contract projection assessment",
      configuration: createAssessmentConfiguration({
        schema: configurationSchema,
        title: "Invalid projection settings",
      }),
      capabilities: {
        assessment: defineAssessmentCapability({
          interactionKind: "single-select",
          experience: {
            submit: true,
            attempts: true,
            hints: true,
            showAnswer: true,
            summaryFeedback: true,
            perItemFeedback: true,
          },
          response: mcqResponseCodec,
          projection: {
            projectInteraction: () => ({ kind: "not-a-real-kind" }) as never,
            projectAssessment: () => ({
              kind: "single-select",
              correctOptionId: null,
              feedbackByOptionId: {},
            }),
            projectLearnerNode: (node) => node,
          },
        }),
      },
    });

    await expect(
      withBlockDefinitions([definition], ({ projectAssessmentTargets }) =>
        projectAssessmentTargets({
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: {
                id: "surface00011",
                variant: "page-default",
              },
              content: [
                {
                  type: "invalid_contract_projection_assessment",
                  attrs: { id: "assess000007" },
                },
              ],
            },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("projects assessment targets while redacting MCQ learner data", () => {
    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: {
            id: "surface00001",
            title: "Lesson",
            variant: "page-default",
          },
          content: [
            {
              type: "mcq",
              attrs: {
                id: "assess000008",
                assessment: {
                  correctOptionId: "option000002",
                  feedbackByOptionId: {
                    option000001: richFeedback("No"),
                    option000002: richFeedback("Yes"),
                  },
                  summaryFeedback: null,
                },
                settings: {
                  feedbackMode: "immediate",
                  isGraded: true,
                  showAnswer: false,
                  legend: "Choose one",
                  points: 2,
                  maxAttempts: 3,
                },
              },
              content: [
                emptyField("assessment_title"),
                emptyField("assessment_instructions"),
                emptyField("assessment_prompt"),
                {
                  type: "assessment_choices_group",
                  content: [
                    selectableChoice("option000001", false, "No"),
                    selectableChoice("option000002", true, "Yes"),
                  ],
                },
                {
                  type: "assessment_actions_group",
                  content: [
                    { type: "assessment_hints_group" },
                    { type: "assessment_summary_feedback" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const projection = projectBuiltInAssessmentDocument(document);

    expect(projection.targets).toEqual([
      {
        schemaVersion: 2,
        targetId: "assess000008",
        blockType: "mcq",
        blockId: "assess000008",
        interaction: {
          kind: "single-select",
          options: [
            { id: "option000001", label: "No" },
            { id: "option000002", label: "Yes" },
          ],
        },
        assessment: {
          kind: "single-select",
          correctOptionId: "option000002",
          feedbackByOptionId: {
            option000001: richFeedback("No"),
            option000002: richFeedback("Yes"),
          },
          summaryFeedback: null,
        },
        settings: {
          feedbackMode: "immediate",
          isGraded: true,
          showAnswer: false,
          points: 2,
          maxAttempts: 3,
          legend: "Choose one",
        },
      },
    ]);

    const learnerChoices = descendantsOfType(projection.learnerDocument, "selectable_choice");
    expect(learnerChoices).toHaveLength(2);
    expect(attrsOf(nthNode(learnerChoices, 0))).toEqual({ id: "option000001" });
    expect(attrsOf(nthNode(learnerChoices, 1))).toEqual({ id: "option000002" });
    expect(
      descendantsOfType(projection.learnerDocument, "selectable_choice_feedback"),
    ).toHaveLength(0);
    expect(
      textBetween(firstDescendant(projection.learnerDocument, "assessment_summary_feedback")),
    ).toBe("");
    expect(attrsOf(firstDescendant(projection.learnerDocument, "mcq"))).not.toHaveProperty(
      "assessment",
    );
    const learnerJson = JSON.stringify(projection.learnerDocument);
    expect(learnerJson).not.toContain('"correctOptionId"');
    expect(learnerJson).not.toContain('"feedbackByOptionId"');
    expect(learnerJson).not.toContain('"summaryFeedback"');

    expect(attrsOf(nthNode(descendantsOfType(document, "selectable_choice"), 1))).toEqual({
      id: "option000002",
    });
  });

  it("separates cloze and hotspot assessment targets from learner JSON", () => {
    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00012", variant: "page-default" },
          content: [fillBlanksBlock(), imageHotspotBlock()],
        },
      ],
    };

    const learner = projectLearnerDocument(document);
    const targets = projectAssessmentTargets(document);

    const blankAttrs = attrsOf(firstDescendant(learner.document, "fill_blank"));
    expect(blankAttrs).toEqual({ id: "blank0000001", placeholder: "term" });
    expect(blankAttrs).not.toHaveProperty("answers");
    expect(blankAttrs).not.toHaveProperty("feedback");
    expect(blankAttrs).not.toHaveProperty("caseSensitive");
    expect(blankAttrs).not.toHaveProperty("trimWhitespace");

    const canvasAttrs = attrsOf(firstDescendant(learner.document, "image_hotspot_canvas"));
    expect(canvasAttrs["data"]).toMatchObject({
      image: {
        mode: "external",
        src: "https://example.com/hotspot.png",
        alt: "A labelled hotspot diagram",
      },
      maxClicks: null,
      hotspots: [
        {
          id: "hotspot00001",
          centerX: 20,
          centerY: 30,
          radius: 8,
          label: "Target",
        },
      ],
    });
    expect(
      (
        (canvasAttrs["data"] as Record<string, unknown>)["hotspots"] as Array<
          Record<string, unknown>
        >
      )[0],
    ).not.toHaveProperty("isCorrect");
    expect(
      (
        (canvasAttrs["data"] as Record<string, unknown>)["hotspots"] as Array<
          Record<string, unknown>
        >
      )[0],
    ).not.toHaveProperty("feedback");

    expect(targets).toMatchObject([
      {
        schemaVersion: 2,
        targetId: "fill00000001",
        blockType: "fill_blanks",
        blockId: "fill00000001",
        interaction: {
          kind: "fill-blanks",
          blanks: [{ id: "blank0000001", label: "term" }],
        },
        assessment: {
          kind: "fill-blanks",
          blanks: [
            {
              blankId: "blank0000001",
              acceptedAnswers: ["ATP", "adenosine triphosphate"],
              caseSensitive: false,
              trimWhitespace: true,
            },
          ],
          feedbackByBlankId: {
            blank0000001: richFeedback("Energy currency"),
          },
          summaryFeedback: null,
        },
      },
      {
        schemaVersion: 2,
        targetId: "hotspotBlk01",
        blockType: "image_hotspot",
        blockId: "hotspotBlk01",
        interaction: {
          kind: "spatial-hotspot",
          hotspots: [
            {
              id: "hotspot00001",
              label: "Target",
              geometry: {
                kind: "circle",
                centerX: 20,
                centerY: 30,
                radius: 8,
              },
            },
          ],
          maxSelections: null,
        },
        assessment: {
          kind: "spatial-hotspot",
          gradingMode: "all-or-nothing",
          correctHotspotIds: ["hotspot00001"],
          feedbackByHotspotId: {
            hotspot00001: richFeedback("Correct region"),
          },
          missFeedback: richFeedback("Try again"),
          summaryFeedback: null,
        },
      },
    ]);
  });

  it("structurally redacts sequencing and matching learner JSON", () => {
    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00013", variant: "page-default" },
          content: [
            sequencingBlock(),
            matchingBlock(),
            {
              ...fillBlanksBlock(),
              attrs: {},
            },
          ],
        },
      ],
    };

    const learner = projectLearnerDocument(document);
    const repeatedLearner = projectLearnerDocument(document);
    const targets = projectAssessmentTargets(document);

    expect(learner.warnings.map((warning) => warning.code)).toEqual(["missing-block-id"]);
    expect(targets.map((target) => target.blockId)).toEqual(["sequen000001", "matching0001"]);

    const sequenceIds = descendantsOfType(learner.document, "sequencing_item").map((item) =>
      String(attrsOf(item)["id"]),
    );
    expect([...sequenceIds].sort((left, right) => left.localeCompare(right))).toEqual([
      "item00000001",
      "item00000002",
    ]);
    expect(sequenceIds).not.toEqual(["item00000001", "item00000002"]);
    expect(
      descendantsOfType(repeatedLearner.document, "sequencing_item").map((item) =>
        String(attrsOf(item)["id"]),
      ),
    ).toEqual(sequenceIds);

    const matchingPairs = descendantsOfType(learner.document, "matching_pair");
    const learnerPairs = matchingPairs.map((pair) => attrsOf(pair));
    expect(learnerPairs).toEqual([{ id: "pair00000001" }, { id: "pair00000002" }]);
    expect(
      descendantsOfType(learner.document, "matching_item").map((item) => attrsOf(item)["id"]),
    ).toEqual(["item00000003", "item00000004"]);
    expect(
      descendantsOfType(learner.document, "matching_target").map((target) => attrsOf(target)["id"]),
    ).toEqual(["target000002", "target000001"]);
    expect(descendantsOfType(learner.document, "matching_feedback")).toHaveLength(0);

    expect(targets.find((entry) => entry.blockId === "sequen000001")).toMatchObject({
      interaction: {
        kind: "sequence",
        items: [{ id: "item00000001" }, { id: "item00000002" }],
      },
      assessment: {
        kind: "sequence",
        correctOrder: ["item00000001", "item00000002"],
        feedbackByItemId: {
          item00000001: richFeedback("Correct first step"),
        },
      },
    });
    expect(targets.find((entry) => entry.blockId === "matching0001")).toMatchObject({
      interaction: {
        kind: "match",
        items: [
          { id: "item00000003", label: "France" },
          { id: "item00000004", label: "Spain" },
        ],
        targets: [
          { id: "target000002", label: "Madrid" },
          { id: "target000001", label: "Paris" },
        ],
      },
      assessment: {
        kind: "match",
        correctPairs: [
          {
            itemId: "item00000003",
            targetId: "target000001",
          },
          {
            itemId: "item00000004",
            targetId: "target000002",
          },
        ],
        feedbackByItemId: {
          item00000003: richFeedback("Correct pair 1"),
          item00000004: richFeedback("Correct pair 2"),
        },
        summaryFeedback: null,
      },
    });
  });

  it("projects one stable Matching source order independent of authored pair nesting", () => {
    const authored = matchingBlock();
    const reordered = structuredClone(authored);
    const reorderedGroup = reordered.content?.find(
      (child) => child.type === "matching_pairs_group",
    );
    reorderedGroup!.content = [...(reorderedGroup?.content ?? [])].reverse();

    const wrap = (block: JSONContent): JSONContent => ({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface00014", variant: "page-default" },
          content: [block],
        },
      ],
    });
    const first = projectBuiltInAssessmentDocument(wrap(authored));
    const repeated = projectBuiltInAssessmentDocument(wrap(reordered));
    const learnerPairAttrs = (document: JSONContent) =>
      descendantsOfType(document, "matching_pair").map((pair) => attrsOf(pair));

    expect(learnerPairAttrs(first.learnerDocument)).toEqual([
      { id: "pair00000001" },
      { id: "pair00000002" },
    ]);
    expect(learnerPairAttrs(repeated.learnerDocument)).toEqual(
      learnerPairAttrs(first.learnerDocument),
    );
    expect(first.targets[0]?.interaction).toEqual({
      kind: "match",
      items: [
        { id: "item00000003", label: "France" },
        { id: "item00000004", label: "Spain" },
      ],
      targets: [
        { id: "target000002", label: "Madrid" },
        { id: "target000001", label: "Paris" },
      ],
    });
    expect(repeated.targets[0]).toEqual(first.targets[0]);
  });
});

async function withBlockDefinitions<T>(
  definitions: readonly BlockDefinition[],
  run: (projection: {
    projectConfiguredAssessmentDocument: typeof projectBuiltInAssessmentDocument;
    projectAssessmentTargets: typeof projectAssessmentTargets;
    projectLearnerDocument: typeof projectLearnerDocument;
  }) => T | Promise<T>,
): Promise<T> {
  const previousRegistry = blockRegistryOverride.current;
  blockRegistryOverride.current = createBlockRegistry(definitions);

  try {
    return await run({
      projectConfiguredAssessmentDocument: projectBuiltInAssessmentDocument,
      projectAssessmentTargets,
      projectLearnerDocument,
    });
  } finally {
    blockRegistryOverride.current = previousRegistry;
  }
}

function selectableChoice(id: string, isCorrect: boolean, label: string): JSONContent {
  void isCorrect;

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

function mcqBlock(id: string, correctOptionId: string): JSONContent {
  return {
    type: "mcq",
    attrs: {
      id,
      assessment: {
        correctOptionId,
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
      },
    },
    content: [
      emptyField("assessment_title"),
      emptyField("assessment_instructions"),
      emptyField("assessment_prompt"),
      {
        type: "assessment_choices_group",
        content: [
          selectableChoice("option000001", correctOptionId === "option000001", "A"),
          selectableChoice("option000002", correctOptionId === "option000002", "B"),
        ],
      },
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function richFeedback(text: string) {
  return {
    kind: "rich-text" as const,
    document: {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

function fillBlanksBlock(): JSONContent {
  return {
    type: "fill_blanks",
    attrs: {
      id: "fill00000001",
      assessment: {
        blanksById: {
          blank0000001: {
            acceptedAnswers: [" ATP ", "adenosine triphosphate"],
            feedback: richFeedback("Energy currency"),
            caseSensitive: false,
            trimWhitespace: true,
          },
        },
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 4,
        maxAttempts: null,
        legend: "Complete the sentence",
      },
    },
    content: [
      emptyField("assessment_title"),
      emptyField("assessment_instructions"),
      {
        type: "fill_blanks_body",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Cellular energy is " },
              {
                type: "fill_blank",
                attrs: {
                  id: "blank0000001",
                  placeholder: "term",
                },
              },
            ],
          },
        ],
      },
      assessmentActions(),
    ],
  };
}

function imageHotspotBlock(): JSONContent {
  return {
    type: "image_hotspot",
    attrs: {
      id: "hotspotBlk01",
      assessment: {
        gradingMode: "all-or-nothing",
        correctHotspotIds: ["hotspot00001"],
        feedbackByHotspotId: {
          hotspot00001: richFeedback("Correct region"),
        },
        missFeedback: richFeedback("Try again"),
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        legend: "Select every target region",
        points: 1,
        maxAttempts: null,
      },
    },
    content: [
      emptyField("assessment_title"),
      emptyField("assessment_instructions"),
      emptyField("assessment_prompt"),
      {
        type: "image_hotspot_canvas",
        attrs: {
          data: {
            image: {
              mode: "external",
              src: "https://example.com/hotspot.png",
              alt: "A labelled hotspot diagram",
            },
            hotspots: [
              {
                id: "hotspot00001",
                centerX: 20,
                centerY: 30,
                radius: 8,
                label: "Target",
              },
            ],
            maxClicks: null,
          },
        },
      },
      assessmentActions(),
    ],
  };
}

function sequencingBlock(): JSONContent {
  return {
    type: "sequencing",
    attrs: {
      id: "sequen000001",
      assessment: {
        correctOrder: ["item00000001", "item00000002"],
        feedbackByItemId: {
          item00000001: richFeedback("Correct first step"),
        },
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        legend: "Order the steps",
        points: 2,
        maxAttempts: null,
      },
    },
    content: [
      emptyField("assessment_title"),
      emptyField("assessment_instructions"),
      emptyField("assessment_prompt"),
      {
        type: "sequencing_items_group",
        content: [
          { type: "sequencing_item", attrs: { id: "item00000001" } },
          { type: "sequencing_item", attrs: { id: "item00000002" } },
        ],
      },
      assessmentActions(),
    ],
  };
}

function matchingBlock(): JSONContent {
  return {
    type: "matching",
    attrs: {
      id: "matching0001",
      assessment: {
        feedbackByItemId: {
          item00000003: richFeedback("Correct pair 1"),
          item00000004: richFeedback("Correct pair 2"),
        },
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 2,
        maxAttempts: null,
        legend: "Match each country to its capital",
      },
    },
    content: [
      emptyField("assessment_title"),
      emptyField("assessment_instructions"),
      emptyField("assessment_prompt"),
      {
        type: "matching_pairs_group",
        content: [
          {
            type: "matching_pair",
            attrs: { id: "pair00000001" },
            content: [
              { ...fieldWithText("matching_item", "France"), attrs: { id: "item00000003" } },
              { ...fieldWithText("matching_target", "Paris"), attrs: { id: "target000001" } },
            ],
          },
          {
            type: "matching_pair",
            attrs: { id: "pair00000002" },
            content: [
              { ...fieldWithText("matching_item", "Spain"), attrs: { id: "item00000004" } },
              { ...fieldWithText("matching_target", "Madrid"), attrs: { id: "target000002" } },
            ],
          },
        ],
      },
      assessmentActions(),
    ],
  };
}

function categoriseQuestionDocument(assessmentTargetId: string | null): JSONContent {
  return {
    type: "courseDocument",
    content: [
      {
        type: "surface",
        attrs: { id: "surface00015", variant: "slide-categorise-question" },
        content: [
          {
            type: "surface_categorise_question",
            attrs: {
              id: assessmentTargetId,
              assessment: {
                feedbackByItemId: {
                  item00000001: richFeedback("Whales are mammals"),
                },
                summaryFeedback: richFeedback("Review the animal groups"),
              },
              settings: {
                feedbackMode: "on_submit",
                isGraded: true,
                showAnswer: true,
                points: 3,
                maxAttempts: 2,
                legend: "Sort each animal",
              },
            },
            content: [
              fieldWithText("assessment_title", "Categorise animals"),
              fieldWithText("assessment_instructions", "Sort into categories"),
              fieldWithText("assessment_prompt", "Where does each animal belong?"),
              {
                type: "categorise_content",
                content: [
                  {
                    type: "categorise_bins_group",
                    content: [
                      categoriseBin("category0001", "Mammal", "item00000001", "Whale"),
                      categoriseBin("category0002", "Bird", "item00000002", "Robin"),
                    ],
                  },
                ],
              },
              assessmentActions(),
            ],
          },
        ],
      },
    ],
  };
}

function categoriseBin(
  categoryId: string,
  categoryLabel: string,
  itemId: string,
  itemLabel: string,
): JSONContent {
  return {
    type: "categorise_bin",
    attrs: { id: categoryId },
    content: [
      fieldWithText("categorise_bin_title", categoryLabel),
      {
        type: "categorise_items_group",
        content: [
          {
            type: "categorise_item",
            attrs: { id: itemId },
            content: [fieldWithText("categorise_item_body", itemLabel)],
          },
        ],
      },
    ],
  };
}

function emptyField(type: string): JSONContent {
  return { type, content: [{ type: "paragraph" }] };
}

function assessmentActions(): JSONContent {
  return {
    type: "assessment_actions_group",
    content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
  };
}

function fieldWithText(type: string, text: string): JSONContent {
  return {
    type,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function firstDescendant(root: JSONContent, type: string): JSONContent {
  const node = descendantsOfType(root, type)[0];
  if (!node) throw new Error(`Expected descendant ${type}`);
  return node;
}

function nthNode(nodes: JSONContent[], index: number): JSONContent {
  const node = nodes[index];
  if (!node) throw new Error(`Expected node at index ${index}`);
  return node;
}

function descendantsOfType(root: JSONContent, type: string): JSONContent[] {
  const out: JSONContent[] = [];

  function walk(node: JSONContent) {
    if (node.type === type) out.push(node);
    for (const child of Array.isArray(node.content) ? node.content : []) {
      walk(child);
    }
  }

  walk(root);
  return out;
}

function attrsOf(node: JSONContent): Record<string, unknown> {
  return node.attrs && typeof node.attrs === "object" ? node.attrs : {};
}

function textBetween(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(textBetween).join(" ");
}
