import { ArticleIcon } from "@phosphor-icons/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { codeBlockDefinition } from "./code/code-block/code-block-definition";
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
  it("keeps Code Block outside the visual presentation catalogue", () => {
    expect(codeBlockDefinition.documentSemantics?.presentation?.actionIds).toEqual([]);
  });
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
      title: "Fixture block",
      configuration,
      frame,
      insert: insertDefinition,
      control: undefined as never,
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
    expect(Object.hasOwn(definition, "control")).toBe(false);
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
      title: "Immutable fixture",
      configuration,
      insert: insertDefinition,
    });

    expect(Object.isFrozen(definition)).toBe(true);
    expect(() => Object.assign(definition, { nodeType: "changed" })).toThrow(TypeError);
    expect(definition.configuration).toBe(configuration);
    expect(definition.insert).not.toBe(insertDefinition);
    expect(Object.isFrozen(definition.insert)).toBe(true);
    expect(Object.isFrozen(configuration)).toBe(false);
    expect(Object.isFrozen(schema)).toBe(false);
    expect(Object.isFrozen(insertDefinition)).toBe(false);
    expect(Object.isFrozen(insertDefinition.icon)).toBe(false);
    expect(Object.isFrozen(insertDefinition.content)).toBe(false);
  });

  it("owns nested insert variant metadata without executing content factories", () => {
    const primaryKeywords = ["fixture", "default"];
    const firstVariantKeywords = ["fixture", "first"];
    const primaryContent = vi.fn(() => ({ type: "fixture" }));
    const firstVariantContent = vi.fn(() => ({ type: "fixture", attrs: { preset: "first" } }));
    const secondVariantContent = vi.fn(() => ({ type: "fixture", attrs: { preset: "second" } }));
    const variants = [
      {
        id: "fixture-first",
        title: "First fixture",
        description: "Insert the first fixture preset.",
        keywords: firstVariantKeywords,
        content: firstVariantContent,
      },
      {
        id: "fixture-second",
        title: "Second fixture",
        description: "Insert the second fixture preset.",
        content: secondVariantContent,
      },
    ];
    const insert = {
      ...insertDefinition,
      keywords: primaryKeywords,
      content: primaryContent,
      variants,
    };

    const definition = defineBlock({ nodeType: "fixture", title: "Fixture block", insert });

    expect(primaryContent).not.toHaveBeenCalled();
    expect(firstVariantContent).not.toHaveBeenCalled();
    expect(secondVariantContent).not.toHaveBeenCalled();
    expect(definition.insert).not.toBe(insert);
    expect(Object.isFrozen(definition.insert)).toBe(true);
    expect(definition.insert?.keywords).toEqual(["fixture", "default"]);
    expect(definition.insert?.keywords).not.toBe(primaryKeywords);
    expect(Object.isFrozen(definition.insert?.keywords)).toBe(true);
    expect(definition.insert?.variants).not.toBe(variants);
    expect(Object.isFrozen(definition.insert?.variants)).toBe(true);
    expect(definition.insert?.variants?.map((variant) => variant.id)).toEqual([
      "fixture-first",
      "fixture-second",
    ]);
    expect(definition.insert?.variants?.[0]).not.toBe(variants[0]);
    expect(Object.isFrozen(definition.insert?.variants?.[0])).toBe(true);
    expect(definition.insert?.variants?.[0]?.keywords).toEqual(["fixture", "first"]);
    expect(definition.insert?.variants?.[0]?.keywords).not.toBe(firstVariantKeywords);
    expect(Object.isFrozen(definition.insert?.variants?.[0]?.keywords)).toBe(true);
    expect(definition.insert?.content).toBe(primaryContent);
    expect(definition.insert?.variants?.[0]?.content).toBe(firstVariantContent);
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

  it("owns semantic shells without invoking callbacks and keeps title independent of insertion", () => {
    const describe = vi.fn(() => ({ label: "Safe label" }));
    const projectChildren = vi.fn(() => []);
    const actionIds = ["reveal"];
    const documentSemantics = {
      describe,
      presentation: { actionIds },
      projectChildren,
    };

    const definition = defineBlock({
      nodeType: "semantic_fixture",
      title: "Semantic fixture",
      insert: { ...insertDefinition, title: "Different insertion title" },
      documentSemantics,
    });

    expect(definition.title).toBe("Semantic fixture");
    expect(definition.insert?.title).toBe("Different insertion title");
    expect(definition.documentSemantics).not.toBe(documentSemantics);
    expect(definition.documentSemantics?.describe).toBe(describe);
    expect(definition.documentSemantics?.projectChildren).toBe(projectChildren);
    expect(definition.documentSemantics?.presentation?.actionIds).toEqual(["reveal"]);
    expect(definition.documentSemantics?.presentation?.actionIds).not.toBe(actionIds);
    expect(Object.isFrozen(definition.documentSemantics)).toBe(true);
    expect(Object.isFrozen(definition.documentSemantics?.presentation)).toBe(true);
    expect(Object.isFrozen(definition.documentSemantics?.presentation?.actionIds)).toBe(true);
    expect(describe).not.toHaveBeenCalled();
    expect(projectChildren).not.toHaveBeenCalled();
  });

  it("normalizes an owner Control Definition without invoking semantic callbacks", () => {
    const projectChildren = vi.fn(() => []);
    const control = {
      owner: {
        events: [{ type: "submitted", label: "Submitted" }],
      },
    } as const;

    const definition = defineBlock({
      nodeType: "controlled_fixture",
      title: "Controlled fixture",
      documentSemantics: { projectChildren },
      control,
    });

    expect(definition.control).toEqual(control);
    expect(definition.control).not.toBe(control);
    expect(Object.isFrozen(definition.control)).toBe(true);
    expect(Object.isFrozen(definition.control?.owner)).toBe(true);
    expect(Object.isFrozen(definition.control?.owner?.events)).toBe(true);
    expect(Object.isFrozen(definition.control?.owner?.events?.[0])).toBe(true);
    expect(Object.isFrozen(control)).toBe(false);
    expect(projectChildren).not.toHaveBeenCalled();
  });

  it("rejects malformed Control Definitions as broken definition invariants", () => {
    expect(() =>
      defineBlock({
        nodeType: "invalid_control_fixture",
        title: "Invalid control fixture",
        control: { owner: {} } as never,
      }),
    ).toThrow('Control capability set "owner" must declare at least one capability.');
  });

  it("preserves concrete interaction and structural policy metadata", () => {
    const definition = defineBlock({
      nodeType: "policy_fixture",
      title: "Policy fixture",
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
    title: "Missing insert id",
    // @ts-expect-error insert.id is required for stable authoring action identity.
    insert: {
      title: "Missing id",
      description: "Invalid declaration",
      icon: ArticleIcon,
      category: "content",
      content: () => ({ type: "missing_insert_id" }),
    },
  });

  defineBlock({
    nodeType: "invalid_primary_variant",
    title: "Invalid primary variant",
    insert: {
      ...insertDefinition,
      // @ts-expect-error Block declarations cannot choose a variant parent.
      variantOf: "another-action",
    },
  });

  defineBlock({
    nodeType: "invalid_variant_metadata",
    title: "Invalid variant metadata",
    insert: {
      ...insertDefinition,
      variants: [
        {
          id: "invalid-variant",
          title: "Invalid variant",
          description: "Invalid duplicated owner metadata.",
          content: () => ({ type: "invalid_variant_metadata" }),
          // @ts-expect-error Block variants inherit nodeType from their owner.
          nodeType: "another_node",
        },
      ],
    },
  });

  const rejectLegacyFields = (input: BlockDefinitionInput): BlockDefinitionInput => input;
  rejectLegacyFields({
    nodeType: "legacy_id",
    title: "Legacy id",
    // @ts-expect-error top-level ids are not part of the final block definition contract.
    id: "legacy_id",
  });
  rejectLegacyFields({
    nodeType: "legacy_movement",
    title: "Legacy movement",
    // @ts-expect-error unused block-level movement is excluded from the final contract.
    movement: { source: "block" },
  });
  rejectLegacyFields({
    nodeType: "legacy_runtime_projection",
    title: "Legacy runtime projection",
    // @ts-expect-error unused runtime projection is excluded from the final contract.
    runtimeProjection: { kind: "legacy" },
  });
  rejectLegacyFields({
    nodeType: "legacy_workspace",
    title: "Legacy workspace",
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
