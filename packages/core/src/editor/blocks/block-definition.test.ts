import { ArticleIcon } from "@phosphor-icons/react";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { defineConfiguration } from "@/editor/configuration/definition";
import {
  defineAssessmentCapability,
  defineBlock,
  getBlockAttrSchema,
  type AssessmentCapabilityResponseDefinition,
  type BlockDefinitionInput,
} from "./block-definition";

const insertDefinition = {
  id: "insert-fixture",
  title: "Fixture",
  description: "Insert a fixture block.",
  icon: ArticleIcon,
  category: "content" as const,
  content: () => ({ type: "fixture" }),
};

describe("defineBlock", () => {
  it("normalizes deterministic definition data without collecting the block", () => {
    const schema = z.object({ emphasis: z.boolean() });
    const configuration = defineConfiguration({
      attr: "settings",
      schema,
      controls: [
        {
          kind: "boolean",
          name: "emphasis",
          label: "Emphasis",
          placement: {
            quickMenu: { presentation: "icon-toggle" },
            sheet: { section: "appearance" },
          },
        },
      ],
      sheet: {
        title: "Fixture settings",
        sections: [{ id: "appearance", title: "Appearance" }],
      },
    });
    const frame = {
      resizable: true,
      preserveAspectRatio: false,
      aspectRatio: 16 / 9,
    };
    const definition = defineBlock({
      nodeType: "fixture",
      configuration,
      frame,
      insert: insertDefinition,
    });

    expect(definition).toMatchObject({
      nodeType: "fixture",
      attrSchemas: { settings: schema },
      frame: {
        resizable: true,
        resizeMode: "responsive",
        preserveAspectRatio: false,
        aspectRatio: 16 / 9,
      },
      quickMenu: {
        attr: "settings",
        controls: [{ kind: "boolean", name: "emphasis", presentation: "icon-toggle" }],
      },
      settingsSheet: {
        nodeType: "fixture",
        attr: "settings",
        title: "Fixture settings",
        sections: [{ id: "appearance", title: "Appearance" }],
      },
    });
    expect(getBlockAttrSchema(definition, "settings")).toBe(schema);
  });

  it("returns a shallow-frozen owned record without freezing embedded values", () => {
    const schema = z.object({ label: z.string() });
    const configuration = defineConfiguration({
      attr: "data",
      schema,
      controls: [],
    });
    const definition = defineBlock({
      nodeType: "fixture_immutable",
      configuration,
      insert: insertDefinition,
    });

    expect(Object.isFrozen(definition)).toBe(true);
    expect(() => Object.assign(definition, { nodeType: "changed" })).toThrow(TypeError);
    expect(definition.configuration).toBe(configuration);
    expect(definition.insert).toBe(insertDefinition);
    expect(Object.isFrozen(configuration)).toBe(false);
    expect(Object.isFrozen(schema)).toBe(false);
    expect(Object.isFrozen(insertDefinition)).toBe(false);
    expect(Object.isFrozen(insertDefinition.icon)).toBe(false);
    expect(Object.isFrozen(insertDefinition.content)).toBe(false);
  });

  it("keeps assessment capability declarations pure and default-free", () => {
    const input = {
      interactionKind: "single-select" as const,
      experience: {
        submit: true,
        attempts: true,
        hints: false,
        showAnswer: false,
        summaryFeedback: true,
        perItemFeedback: false,
      },
      response: {
        schema: z.object({ optionId: z.string().nullable() }),
        toContractResponse: () => {
          throw new Error("not used by this definition test");
        },
        fromContractResponse: () => ({ optionId: null }),
        hasResponse: () => false,
      },
      projection: {
        projectInteraction: () => {
          throw new Error("not used by this definition test");
        },
        projectAssessment: () => {
          throw new Error("not used by this definition test");
        },
        projectLearnerNode: (node: Record<string, unknown>) => node,
      },
    };

    const capability = defineAssessmentCapability(input);

    expect(capability).toBe(input);
    expect(capability).not.toHaveProperty("defaults");
    expect(capability.response).not.toHaveProperty("project");
  });

  it("preserves concrete interaction and structural policy metadata", () => {
    const definition = defineBlock({
      nodeType: "policy_fixture",
      childSettings: {
        managedFields: [
          {
            childGroup: "assessment_question",
            names: ["feedbackMode", "showAnswer"],
            reason: "Managed by parent",
          },
        ],
      },
      interaction: {
        embeddedChildSelection: "delegate-to-parent",
      },
      placeholders: {
        policy_fixture_child: "Owned by the block",
        policy_fixture_dynamic: ({ depth }) => `Depth ${depth}`,
      },
      stagedBoundedHost: {
        childGroup: "assessment_question",
      },
      authoringControls: {
        controls: () => [{ kind: "action", id: "reset", label: "Reset" }],
      },
    });

    expect(definition).toMatchObject({
      childSettings: {
        managedFields: [
          {
            childGroup: "assessment_question",
            names: ["feedbackMode", "showAnswer"],
            reason: "Managed by parent",
          },
        ],
      },
      interaction: {
        embeddedChildSelection: "delegate-to-parent",
      },
      stagedBoundedHost: {
        childGroup: "assessment_question",
      },
    });
    expect(definition.placeholders?.policy_fixture_child).toBe("Owned by the block");
    expect(
      typeof definition.placeholders?.policy_fixture_dynamic === "function"
        ? definition.placeholders.policy_fixture_dynamic({ depth: 3 } as never)
        : undefined,
    ).toBe("Depth 3");
    expect(
      definition.authoringControls?.controls({
        editor: {} as never,
        nodeType: "policy_fixture",
        pos: 0,
      }),
    ).toEqual([{ kind: "action", id: "reset", label: "Reset" }]);
  });
});

if (false) {
  defineBlock({
    nodeType: "missing_insert_id",
    // @ts-expect-error insert.id is required for stable authoring action identity.
    insert: {
      title: "Missing id",
      description: "Invalid declaration",
      icon: ArticleIcon,
      category: "content",
      content: () => ({ type: "missing_insert_id" }),
    },
  });

  const rejectLegacyFields = (input: BlockDefinitionInput): BlockDefinitionInput => input;
  rejectLegacyFields({
    nodeType: "legacy_id",
    // @ts-expect-error top-level ids are not part of the final block definition contract.
    id: "legacy_id",
  });
  rejectLegacyFields({
    nodeType: "legacy_movement",
    // @ts-expect-error unused block-level movement is excluded from the final contract.
    movement: { source: "block" },
  });
  rejectLegacyFields({
    nodeType: "legacy_runtime_projection",
    // @ts-expect-error unused runtime projection is excluded from the final contract.
    runtimeProjection: { kind: "legacy" },
  });
  rejectLegacyFields({
    nodeType: "legacy_workspace",
    // @ts-expect-error unused block-level workspace is excluded from the final contract.
    workspace: {},
  });

  defineAssessmentCapability({
    interactionKind: "single-select",
    experience: {
      submit: true,
      attempts: true,
      hints: false,
      showAnswer: false,
      summaryFeedback: true,
      perItemFeedback: false,
    },
    response: {
      schema: z.object({}),
      toContractResponse: () => {
        throw new Error("not executed");
      },
      fromContractResponse: () => ({}),
      hasResponse: () => false,
    },
    projection: {
      projectInteraction: () => {
        throw new Error("not executed");
      },
      projectAssessment: () => {
        throw new Error("not executed");
      },
      projectLearnerNode: (node) => node,
    },
    // @ts-expect-error assessment capability defaults were removed from the final contract.
    defaults: { title: "Legacy", instructions: "Legacy" },
  });

  const responseDefinition = {} as AssessmentCapabilityResponseDefinition;
  // @ts-expect-error the one-way response member was removed atomically.
  responseDefinition.project;
}
