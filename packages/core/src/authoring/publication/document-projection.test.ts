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
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import { mcqResponseCodec } from "@/editor/blocks/assessment/mcq/assessment";

import {
  projectAssessmentDocument,
  projectAssessmentTargets,
  projectLearnerDocument,
} from "./document-projection";

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
      get stableIdNodeTypes() {
        return activeRegistry().stableIdNodeTypes;
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
              options: [{ id: "registered-option", label: "Registered option" }],
            }),
            projectAssessment: () => ({
              kind: "single-select",
              correctOptionId: "registered-option",
              feedbackByOptionId: {
                "registered-option": richFeedback("Capability feedback"),
              },
            }),
            projectLearnerNode: (node) => ({
              ...node,
              attrs: {
                id: "registered-block",
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
          attrs: { id: "registry-surface", variant: "page-default" },
          content: [
            {
              type: "registry_owned_projection_assessment",
              attrs: {
                id: "registered-block",
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
              attrs: { id: "unknown-node" },
            },
          ],
        },
      ],
    };

    const projection = await withBlockDefinitions([definition], ({ projectAssessmentDocument }) =>
      projectAssessmentDocument(document),
    );

    expect(projection.targets).toEqual([
      {
        schemaVersion: 1,
        targetId: "registered-block",
        blockType: "registry_owned_projection_assessment",
        blockId: "registered-block",
        interaction: {
          kind: "single-select",
          options: [{ id: "registered-option", label: "Registered option" }],
        },
        assessment: {
          kind: "single-select",
          correctOptionId: "registered-option",
          feedbackByOptionId: {
            "registered-option": richFeedback("Capability feedback"),
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
      id: "registered-block",
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
          attrs: { id: "surface-unknown", variant: "page-default" },
          content: [
            {
              type: "unknown_non_assessment_node",
              attrs: { id: "unknown-1", privateAnswer: "not-assessment" },
            },
          ],
        },
      ],
    };

    expect(projectAssessmentDocument(document)).toEqual({
      learnerDocument: document,
      targets: [],
      groups: [],
      warnings: [],
    });
  });

  it("warns and emits no group for an empty quiz", () => {
    const projection = projectAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface-empty-quiz", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: { id: "quiz-empty", settings: {} },
            },
          ],
        },
      ],
    });

    expect(projection.targets).toEqual([]);
    expect(projection.groups).toEqual([]);
    expect(projection.warnings).toContainEqual({
      code: "empty-assessment-group",
      blockType: "quiz",
      blockId: "quiz-empty",
      surfaceId: "surface-empty-quiz",
      message: "Quiz has no playable assessment targets; projection omitted its assessment group.",
    });
  });

  it("projects quiz groups with ordered child assessment target ids", () => {
    const projection = projectAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface-quiz", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: {
                id: "quiz-1",
                settings: {
                  allowBacktracking: false,
                  reviewTiming: "after_each_answer",
                  reviewDetail: "full_review",
                  attemptsPerQuestion: 2,
                },
              },
              content: [mcqBlock("mcq-quiz-1", "a"), mcqBlock("mcq-quiz-2", "b")],
            },
          ],
        },
      ],
    });

    expect(projection.targets.map((target) => target.targetId)).toEqual([
      "mcq-quiz-1",
      "mcq-quiz-2",
    ]);
    expect(projection.groups).toEqual([
      {
        schemaVersion: 1,
        kind: "quiz",
        groupId: "quiz-1",
        targetIds: ["mcq-quiz-1", "mcq-quiz-2"],
        settings: {
          allowBacktracking: false,
          reviewTiming: "after_each_answer",
          reviewDetail: "full_review",
          attemptsPerQuestion: 2,
          isGraded: true,
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
    const projection = projectAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface-duplicate-quiz", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: { id: "quiz-duplicate", settings: {} },
              content: [mcqBlock("duplicate-target", "a"), mcqBlock("duplicate-target", "b")],
            },
          ],
        },
      ],
    });

    expect(projection.groups).toEqual([]);
    expect(projection.warnings).toContainEqual({
      code: "invalid-assessment-group",
      blockType: "quiz",
      blockId: "quiz-duplicate",
      surfaceId: "surface-duplicate-quiz",
      message:
        "Quiz contains children without projected assessment targets; projection omitted its assessment group.",
    });
  });

  it("warns and skips quiz groups with children missing projected targets", () => {
    const projection = projectAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface-malformed-quiz", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: { id: "quiz-malformed", settings: {} },
              content: [
                mcqBlock("mcq-valid-child", "a"),
                {
                  type: "unknown_child",
                  attrs: { id: "missing-target-child" },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(projection.targets.map((target) => target.targetId)).toEqual(["mcq-valid-child"]);
    expect(projection.groups).toEqual([]);
    expect(projection.warnings).toContainEqual({
      code: "invalid-assessment-group",
      blockType: "quiz",
      blockId: "quiz-malformed",
      surfaceId: "surface-malformed-quiz",
      message:
        "Quiz contains children without projected assessment targets; projection omitted its assessment group.",
    });
  });

  it("does not invent quiz target ids for malformed child content without ids", () => {
    const projection = projectAssessmentDocument({
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface-idless-quiz", variant: "page-default" },
          content: [
            {
              type: "quiz",
              attrs: { id: "quiz-idless-child", settings: {} },
              content: [
                {
                  ...mcqBlock("mcq-idless-child", "a"),
                  attrs: {
                    ...mcqBlock("mcq-idless-child", "a").attrs,
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
      surfaceId: "surface-idless-quiz",
      message:
        "Assessment block has no id; projection omitted its target because server storage cannot address it stably.",
    });
    expect(projection.warnings).toContainEqual({
      code: "empty-assessment-group",
      blockType: "quiz",
      blockId: "quiz-idless-child",
      surfaceId: "surface-idless-quiz",
      message: "Quiz has no playable assessment targets; projection omitted its assessment group.",
    });
  });

  it("throws clearly when a registered assessment block has no projection", async () => {
    const definition = defineBlock({
      nodeType: "missing_projection_assessment",
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
      withBlockDefinitions([definition], ({ projectAssessmentDocument }) =>
        projectAssessmentDocument({
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: {
                id: "missing-projection-surface",
                variant: "page-default",
              },
              content: [
                {
                  type: "missing_projection_assessment",
                  attrs: { id: "missing-projection-block" },
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
      withBlockDefinitions([definition], ({ projectAssessmentDocument }) =>
        projectAssessmentDocument({
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: {
                id: "missing-settings-contract-surface",
                variant: "page-default",
              },
              content: [
                {
                  type: "missing_settings_contract_assessment",
                  attrs: { id: "missing-settings-contract-block" },
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
                id: "invalid-contract-surface",
                variant: "page-default",
              },
              content: [
                {
                  type: "invalid_contract_projection_assessment",
                  attrs: { id: "invalid-contract-block" },
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
            id: "surface-1",
            title: "Lesson",
            variant: "page-default",
          },
          content: [
            {
              type: "mcq",
              attrs: {
                id: "mcq-1",
                assessment: {
                  correctOptionId: "b",
                  feedbackByOptionId: {
                    a: richFeedback("No"),
                    b: richFeedback("Yes"),
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
                  content: [selectableChoice("a", false, "No"), selectableChoice("b", true, "Yes")],
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

    const projection = projectAssessmentDocument(document);

    expect(projection.targets).toEqual([
      {
        schemaVersion: 1,
        targetId: "mcq-1",
        blockType: "mcq",
        blockId: "mcq-1",
        interaction: {
          kind: "single-select",
          options: [
            { id: "a", label: "a" },
            { id: "b", label: "b" },
          ],
        },
        assessment: {
          kind: "single-select",
          correctOptionId: "b",
          feedbackByOptionId: {
            a: richFeedback("No"),
            b: richFeedback("Yes"),
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
    expect(attrsOf(nthNode(learnerChoices, 0))).toEqual({ id: "a" });
    expect(attrsOf(nthNode(learnerChoices, 1))).toEqual({ id: "b" });
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
      id: "b",
    });
  });

  it("separates cloze and hotspot assessment targets from learner JSON", () => {
    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface-2", variant: "page-default" },
          content: [fillBlanksBlock(), imageHotspotBlock()],
        },
      ],
    };

    const learner = projectLearnerDocument(document);
    const targets = projectAssessmentTargets(document);

    const blankAttrs = attrsOf(firstDescendant(learner.document, "fill_blank"));
    expect(blankAttrs).toEqual({ id: "blank-1", placeholder: "term" });
    expect(blankAttrs).not.toHaveProperty("answers");
    expect(blankAttrs).not.toHaveProperty("feedback");
    expect(blankAttrs).not.toHaveProperty("caseSensitive");
    expect(blankAttrs).not.toHaveProperty("trimWhitespace");

    const canvasAttrs = attrsOf(firstDescendant(learner.document, "image_hotspot_canvas"));
    expect(canvasAttrs["data"]).toMatchObject({
      debug: false,
      image: null,
      maxClicks: null,
      hotspots: [
        {
          id: "hotspot-1",
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
        schemaVersion: 1,
        targetId: "fill-1",
        blockType: "fill_blanks",
        blockId: "fill-1",
        interaction: {
          kind: "fill-blanks",
          blanks: [{ id: "blank-1", label: "term" }],
        },
        assessment: {
          kind: "fill-blanks",
          blanks: [
            {
              blankId: "blank-1",
              acceptedAnswers: ["ATP", "adenosine triphosphate"],
              caseSensitive: false,
              trimWhitespace: true,
            },
          ],
          feedbackByBlankId: {
            "blank-1": richFeedback("Energy currency"),
          },
          summaryFeedback: null,
        },
      },
      {
        schemaVersion: 1,
        targetId: "hotspot-block-1",
        blockType: "image_hotspot",
        blockId: "hotspot-block-1",
        interaction: {
          kind: "spatial-hotspot",
          hotspots: [
            {
              id: "hotspot-1",
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
          correctHotspotIds: ["hotspot-1"],
          feedbackByHotspotId: {
            "hotspot-1": richFeedback("Correct region"),
          },
          missFeedback: richFeedback("Try again"),
          summaryFeedback: null,
        },
      },
    ]);
  });

  it("redacts malformed hotspot canvas data without preserving private fields", () => {
    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface-malformed-hotspot", variant: "page-default" },
          content: [
            {
              type: "image_hotspot",
              attrs: {
                id: "malformed-hotspot-block",
                settings: {
                  feedbackMode: "on_submit",
                  isGraded: true,
                  showAnswer: true,
                  points: 1,
                  maxAttempts: null,
                },
              },
              content: [
                {
                  type: "image_hotspot_canvas",
                  attrs: {
                    data: {
                      debug: true,
                      missFeedback: { summary: "leaked miss feedback" },
                      hotspots: [
                        {
                          id: "leaky-hotspot",
                          centerX: "not a number",
                          isCorrect: true,
                          feedback: { summary: "leaked hotspot feedback" },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const learner = projectLearnerDocument(document);
    const canvasData = attrsOf(firstDescendant(learner.document, "image_hotspot_canvas"))[
      "data"
    ] as Record<string, unknown>;
    const learnerHotspots = canvasData["hotspots"] as Array<Record<string, unknown>>;

    expect(canvasData["debug"]).toBe(false);
    expect(canvasData).not.toHaveProperty("missFeedback");
    expect(canvasData).not.toHaveProperty("gradingMode");
    expect(learnerHotspots).toHaveLength(1);
    expect(learnerHotspots[0]).not.toHaveProperty("isCorrect");
    expect(learnerHotspots[0]).not.toHaveProperty("feedback");
  });

  it("structurally redacts sequencing and matching learner JSON", () => {
    const document: JSONContent = {
      type: "courseDocument",
      content: [
        {
          type: "surface",
          attrs: { id: "surface-3", variant: "page-default" },
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
    const targets = projectAssessmentTargets(document);

    expect(learner.warnings.map((warning) => warning.code)).toEqual(["missing-block-id"]);
    expect(targets.map((target) => target.blockId)).toEqual(["seq-1", "matching-1"]);

    const sequenceIds = descendantsOfType(learner.document, "sequencing_item").map((item) =>
      String(attrsOf(item)["id"]),
    );
    expect([...sequenceIds].sort((left, right) => left.localeCompare(right))).toEqual([
      "first",
      "second",
    ]);
    expect(sequenceIds).not.toEqual(["first", "second"]);

    const matchingPairs = descendantsOfType(learner.document, "matching_pair");
    const learnerPairs = matchingPairs.map((pair) => attrsOf(pair));
    expect(learnerPairs).toEqual([
      { itemId: "left-1", targetId: "right-2" },
      { itemId: "left-2", targetId: "right-1" },
    ]);
    expect(descendantsOfType(learner.document, "matching_feedback")).toHaveLength(0);

    expect(targets.find((entry) => entry.blockId === "seq-1")).toMatchObject({
      interaction: {
        kind: "sequence",
        items: [{ id: "first" }, { id: "second" }],
      },
      assessment: {
        kind: "sequence",
        correctOrder: ["first", "second"],
        feedbackByItemId: {
          first: richFeedback("Correct first step"),
        },
      },
    });
    expect(targets.find((entry) => entry.blockId === "matching-1")).toMatchObject({
      interaction: {
        kind: "match",
        items: [
          { id: "left-1", label: "France" },
          { id: "left-2", label: "Spain" },
        ],
        targets: [
          { id: "right-1", label: "Paris" },
          { id: "right-2", label: "Madrid" },
        ],
      },
      assessment: {
        kind: "match",
        correctPairs: [
          {
            itemId: "left-1",
            targetId: "right-1",
          },
          {
            itemId: "left-2",
            targetId: "right-2",
          },
        ],
        feedbackByItemId: {
          "left-1": richFeedback("Correct pair 1"),
          "left-2": richFeedback("Correct pair 2"),
        },
        summaryFeedback: null,
      },
    });
  });
});

async function withBlockDefinitions<T>(
  definitions: readonly BlockDefinition[],
  run: (projection: {
    projectAssessmentDocument: typeof projectAssessmentDocument;
    projectAssessmentTargets: typeof projectAssessmentTargets;
    projectLearnerDocument: typeof projectLearnerDocument;
  }) => T | Promise<T>,
): Promise<T> {
  const previousRegistry = blockRegistryOverride.current;
  blockRegistryOverride.current = createBlockRegistry(definitions);

  try {
    return await run({
      projectAssessmentDocument,
      projectAssessmentTargets,
      projectLearnerDocument,
    });
  } finally {
    blockRegistryOverride.current = previousRegistry;
  }
}

function selectableChoice(id: string, isCorrect: boolean, feedback: string): JSONContent {
  void isCorrect;
  void feedback;

  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph", content: [{ type: "text", text: id }] }],
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
          selectableChoice("a", correctOptionId === "a", "A"),
          selectableChoice("b", correctOptionId === "b", "B"),
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
      id: "fill-1",
      assessment: {
        blanksById: {
          "blank-1": {
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
                  id: "blank-1",
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
      id: "hotspot-block-1",
      assessment: {
        gradingMode: "all-or-nothing",
        correctHotspotIds: ["hotspot-1"],
        feedbackByHotspotId: {
          "hotspot-1": richFeedback("Correct region"),
        },
        missFeedback: richFeedback("Try again"),
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
        type: "image_hotspot_canvas",
        attrs: {
          data: {
            image: null,
            hotspots: [
              {
                id: "hotspot-1",
                centerX: 20,
                centerY: 30,
                radius: 8,
                label: "Target",
              },
            ],
            maxClicks: null,
            debug: false,
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
      id: "seq-1",
      assessment: {
        correctOrder: ["first", "second"],
        feedbackByItemId: {
          first: richFeedback("Correct first step"),
        },
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
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
          { type: "sequencing_item", attrs: { id: "first" } },
          { type: "sequencing_item", attrs: { id: "second" } },
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
      id: "matching-1",
      assessment: {
        correctPairs: [
          { itemId: "left-1", targetId: "right-1" },
          { itemId: "left-2", targetId: "right-2" },
        ],
        feedbackByItemId: {
          "left-1": richFeedback("Correct pair 1"),
          "left-2": richFeedback("Correct pair 2"),
        },
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 2,
        maxAttempts: null,
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
            attrs: { itemId: "left-1", targetId: "right-1" },
            content: [
              fieldWithText("matching_item", "France"),
              fieldWithText("matching_target", "Paris"),
            ],
          },
          {
            type: "matching_pair",
            attrs: { itemId: "left-2", targetId: "right-2" },
            content: [
              fieldWithText("matching_item", "Spain"),
              fieldWithText("matching_target", "Madrid"),
            ],
          },
        ],
      },
      assessmentActions(),
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
