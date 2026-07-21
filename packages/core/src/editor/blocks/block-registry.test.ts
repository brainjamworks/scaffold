import { ArticleIcon } from "@phosphor-icons/react";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { z } from "zod";

import { mcqResponseCodec } from "./assessment/mcq/assessment";
import type { BlockCapabilitiesDefinition, BlockDefinition } from "./block-definition";
import { createBlockRegistry, type BlockDefinitionLookup } from "./block-registry";

function createDefinition(
  nodeType: string,
  options: Partial<BlockDefinition> = {},
): BlockDefinition {
  return {
    nodeType,
    insert: {
      id: `insert-${nodeType}`,
      title: nodeType,
      description: `Insert ${nodeType}`,
      icon: ArticleIcon,
      category: "content",
      content: () => ({ type: nodeType }),
    },
    ...options,
  };
}

describe("createBlockRegistry", () => {
  it("constructs independent nodeType-keyed registries", () => {
    const alpha = createDefinition("alpha");
    const beta = createDefinition("beta");

    const first = createBlockRegistry([alpha]);
    const second = createBlockRegistry([beta]);
    const firstLookup: BlockDefinitionLookup = first;

    expect(firstLookup.getByNodeType("alpha")).toBe(alpha);
    expect(first.getByNodeType("beta")).toBeUndefined();
    expect(second.getByNodeType("beta")).toBe(beta);
    expect(second.getByNodeType("alpha")).toBeUndefined();
  });

  it("preserves source order in definitions and derived node-type arrays", () => {
    const assessmentCapabilities = {
      assessment: {
        interactionKind: "single-select",
        experience: {
          submit: true,
          attempts: true,
          hints: false,
          showAnswer: false,
          summaryFeedback: false,
          perItemFeedback: false,
        },
        response: mcqResponseCodec,
        projection: {
          projectInteraction: () => ({ kind: "single-select" as const, options: [] }),
          projectAssessment: () => ({
            kind: "single-select" as const,
            correctOptionId: null,
            feedbackByOptionId: {},
          }),
          projectLearnerNode: (node) => node,
        },
      },
    } satisfies BlockCapabilitiesDefinition;
    const alpha = createDefinition("alpha", {
      identity: { stableChildNodeTypes: ["alpha_item", "shared_item"] },
      frame: { resizable: true },
      capabilities: assessmentCapabilities,
    });
    const beta = createDefinition("beta", {
      identity: { stableChildNodeTypes: ["shared_item", "beta_item"] },
      frame: { resizable: false },
    });
    const gamma = createDefinition("gamma", {
      capabilities: assessmentCapabilities,
      frame: { resizable: true },
    });

    const registry = createBlockRegistry([alpha, beta, gamma]);

    expect(registry.definitions).toEqual([alpha, beta, gamma]);
    expect(registry.stableIdNodeTypes).toEqual([
      "alpha",
      "alpha_item",
      "shared_item",
      "beta",
      "beta_item",
      "gamma",
    ]);
    expect(registry.assessmentNodeTypes).toEqual(["alpha", "gamma"]);
    expect(registry.resizableNodeTypes).toEqual(["alpha", "gamma"]);
    expect(registry.getByNodeType("missing")).toBeUndefined();
  });

  it("copies and freezes owned arrays without freezing caller-owned values", () => {
    const schema = z.object({ label: z.string() });
    const definition = createDefinition("mutable-caller-value", {
      attrSchemas: { data: schema },
    });
    const input = [definition];

    const registry = createBlockRegistry(input);
    input.push(createDefinition("late-addition"));

    expect(registry.definitions).toEqual([definition]);
    expect(registry.getByNodeType("late-addition")).toBeUndefined();
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.definitions)).toBe(true);
    expect(Object.isFrozen(registry.stableIdNodeTypes)).toBe(true);
    expect(Object.isFrozen(registry.assessmentNodeTypes)).toBe(true);
    expect(Object.isFrozen(registry.resizableNodeTypes)).toBe(true);
    expect(() => Reflect.apply(Array.prototype.push, registry.definitions, [definition])).toThrow(
      TypeError,
    );
    expect(Object.isFrozen(definition)).toBe(false);
    expect(Object.isFrozen(definition.insert)).toBe(false);
    expect(Object.isFrozen(schema)).toBe(false);
    expect(definition.insert?.content()).toEqual({ type: "mutable-caller-value" });
    expect(schema.safeParse({ label: "still usable" }).success).toBe(true);
    expectTypeOf(registry.definitions).toEqualTypeOf<readonly BlockDefinition[]>();
  });

  it("rejects duplicate node types regardless of insert action identity", () => {
    const first = createDefinition("duplicate", {
      insert: {
        id: "first-action",
        title: "First",
        description: "First action",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "duplicate" }),
      },
    });
    const second = createDefinition("duplicate", {
      insert: {
        id: "second-action",
        title: "Second",
        description: "Second action",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "duplicate" }),
      },
    });

    expect(() => createBlockRegistry([first, second])).toThrow(
      'Duplicate block node type "duplicate".',
    );
  });
});
