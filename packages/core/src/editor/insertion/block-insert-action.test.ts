import { ArticleIcon } from "@phosphor-icons/react";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { defineBlock } from "@/editor/blocks/block-definition";
import { defineConfiguration } from "@/editor/configuration/definition";
import { createBlockInsertAction, createBlockInsertActions } from "./block-insert-action";

const schema = new Schema({
  nodes: {
    doc: { content: "fixture" },
    text: {},
    fixture: {
      attrs: { data: { default: null } },
      toDOM: () => ["div", 0],
    },
  },
});

function fixtureNode(data: unknown) {
  return schema.nodeFromJSON({ type: "fixture", attrs: { data } });
}

describe("createBlockInsertAction", () => {
  it("derives divergent action and node identities without mutating the definition", () => {
    const definition = defineBlock({
      nodeType: "fixture",
      insert: {
        id: "insert-fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture", attrs: { data: { label: "Fixture" } } }),
      },
    });

    const action = createBlockInsertAction(definition);

    expect(action).toMatchObject({ id: "insert-fixture", nodeType: "fixture" });
    expect(definition).not.toHaveProperty("id");
  });

  it("keeps the singular projector focused on the primary action", () => {
    const definition = defineBlock({
      nodeType: "fixture",
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
        variants: [
          {
            id: "fixture-preset",
            title: "Fixture preset",
            description: "Insert a fixture preset.",
            content: () => ({ type: "fixture", attrs: { data: { label: "Preset" } } }),
          },
        ],
      },
    });

    const action = createBlockInsertAction(definition);

    expect(action).toMatchObject({ id: "fixture", nodeType: "fixture" });
    expect(action).not.toHaveProperty("variants");
  });

  it("returns null for a non-insertable definition and filters it from array derivation", () => {
    const hidden = defineBlock({ nodeType: "hidden" });
    const visible = defineBlock({
      nodeType: "fixture",
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
      },
    });

    expect(createBlockInsertAction(hidden)).toBeNull();
    expect(createBlockInsertActions([hidden, visible]).map((action) => action.id)).toEqual([
      "fixture",
    ]);
  });

  it("projects the primary action followed by explicitly declared variants", () => {
    const primaryContent = vi.fn(() => ({
      type: "fixture",
      attrs: { data: { label: "Default" } },
    }));
    const firstContent = vi.fn(() => ({ type: "fixture", attrs: { data: { label: "First" } } }));
    const secondContent = vi.fn(() => ({ type: "fixture", attrs: { data: { label: "Second" } } }));
    const definition = defineBlock({
      nodeType: "fixture",
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        keywords: ["fixture", "default"],
        content: primaryContent,
        variants: [
          {
            id: "fixture-first",
            title: "First fixture",
            description: "Insert the first fixture preset.",
            keywords: ["fixture", "first"],
            content: firstContent,
          },
          {
            id: "fixture-second",
            title: "Second fixture",
            description: "Insert the second fixture preset.",
            keywords: ["fixture", "second"],
            content: secondContent,
          },
        ],
      },
    });

    const actions = createBlockInsertActions([definition]);

    expect(actions.map((action) => action.id)).toEqual([
      "fixture",
      "fixture-first",
      "fixture-second",
    ]);
    expect(actions[0]).toMatchObject({
      id: "fixture",
      nodeType: "fixture",
      category: "content",
      icon: ArticleIcon,
    });
    expect(actions[0]).not.toHaveProperty("variantOf");
    expect(actions[1]).toMatchObject({
      id: "fixture-first",
      nodeType: "fixture",
      variantOf: "fixture",
      category: "content",
      icon: ArticleIcon,
      title: "First fixture",
      description: "Insert the first fixture preset.",
      keywords: ["fixture", "first"],
    });
    expect(actions[2]).toMatchObject({
      id: "fixture-second",
      nodeType: "fixture",
      variantOf: "fixture",
      category: "content",
      icon: ArticleIcon,
    });
    expect(primaryContent).not.toHaveBeenCalled();
    expect(firstContent).not.toHaveBeenCalled();
    expect(secondContent).not.toHaveBeenCalled();

    const firstNode = actions[1]?.content();
    const nextFirstNode = actions[1]?.content();
    expect(firstContent).toHaveBeenCalledTimes(2);
    expect(firstNode).toEqual({ type: "fixture", attrs: { data: { label: "First" } } });
    expect(nextFirstNode).toEqual(firstNode);
    expect(nextFirstNode).not.toBe(firstNode);
  });

  it("projects bounded placement onto primary and variant actions", () => {
    const definition = defineBlock({
      nodeType: "fixture",
      boundedPlacement: "fill",
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
        variants: [
          {
            id: "fixture-preset",
            title: "Fixture preset",
            description: "Insert a fixture preset.",
            content: () => ({ type: "fixture" }),
          },
        ],
      },
    });

    expect(createBlockInsertActions([definition]).map((action) => action.boundedPlacement)).toEqual(
      ["fill", "fill"],
    );
  });

  it("validates the configured attr with the definition schema", () => {
    const definition = defineBlock({
      nodeType: "fixture",
      configuration: defineConfiguration({
        attr: "data",
        schema: z.object({ label: z.string() }),
        controls: [],
      }),
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
      },
    });
    const action = createBlockInsertAction(definition);

    expect(action?.validateNode?.(fixtureNode({ label: "Valid" }))).toBeNull();
    expect(action?.validateNode?.(fixtureNode({ label: 42 }))).toEqual({
      code: "invalid_catalog_content",
      field: "data",
      message: 'Insert action "fixture" produced invalid "data" attrs for "fixture".',
    });
  });

  it("runs block-local validation before configuration validation", () => {
    const validateNode = vi.fn(() => ({
      code: "invalid_catalog_content" as const,
      message: "Block-local validation failed.",
    }));
    const definition = defineBlock({
      nodeType: "fixture",
      configuration: defineConfiguration({
        attr: "data",
        schema: z.object({ label: z.string() }),
        controls: [],
      }),
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
        validateNode,
      },
    });
    const action = createBlockInsertAction(definition);

    expect(action?.validateNode?.(fixtureNode({ label: 42 }))).toEqual({
      code: "invalid_catalog_content",
      message: "Block-local validation failed.",
    });
    expect(validateNode).toHaveBeenCalledOnce();
  });

  it("short-circuits variant validation when the owning validator fails", () => {
    const calls: string[] = [];
    const owningValidateNode = vi.fn(() => {
      calls.push("owning");
      return {
        code: "invalid_catalog_content" as const,
        message: "Owning Block validation failed.",
      };
    });
    const variantValidateNode = vi.fn(() => {
      calls.push("variant");
      return {
        code: "invalid_catalog_content" as const,
        message: "Variant-local validation failed.",
      };
    });
    const configurationValidateNode = vi.fn(() => {
      calls.push("configuration");
      return false;
    });
    const definition = defineBlock({
      nodeType: "fixture",
      configuration: defineConfiguration({
        attr: "data",
        schema: z.custom(configurationValidateNode),
        controls: [],
      }),
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
        validateNode: owningValidateNode,
        variants: [
          {
            id: "fixture-preset",
            title: "Fixture preset",
            description: "Insert a fixture preset.",
            content: () => ({ type: "fixture" }),
            validateNode: variantValidateNode,
          },
        ],
      },
    });
    const [, variant] = createBlockInsertActions([definition]);

    expect(variant?.validateNode?.(fixtureNode({ label: 42 }))).toEqual({
      code: "invalid_catalog_content",
      message: "Owning Block validation failed.",
    });
    expect(calls).toEqual(["owning"]);
    expect(owningValidateNode).toHaveBeenCalledOnce();
    expect(variantValidateNode).not.toHaveBeenCalled();
    expect(configurationValidateNode).not.toHaveBeenCalled();
  });

  it("short-circuits configuration validation when the variant validator fails", () => {
    const calls: string[] = [];
    const owningValidateNode = vi.fn(() => {
      calls.push("owning");
      return null;
    });
    const variantValidateNode = vi.fn(() => {
      calls.push("variant");
      return {
        code: "invalid_catalog_content" as const,
        message: "Variant-local validation failed.",
      };
    });
    const configurationValidateNode = vi.fn(() => {
      calls.push("configuration");
      return false;
    });
    const definition = defineBlock({
      nodeType: "fixture",
      configuration: defineConfiguration({
        attr: "data",
        schema: z.custom(configurationValidateNode),
        controls: [],
      }),
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
        validateNode: owningValidateNode,
        variants: [
          {
            id: "fixture-preset",
            title: "Fixture preset",
            description: "Insert a fixture preset.",
            content: () => ({ type: "fixture" }),
            validateNode: variantValidateNode,
          },
        ],
      },
    });
    const [, variant] = createBlockInsertActions([definition]);

    expect(variant?.validateNode?.(fixtureNode({ label: 42 }))).toEqual({
      code: "invalid_catalog_content",
      message: "Variant-local validation failed.",
    });
    expect(calls).toEqual(["owning", "variant"]);
    expect(owningValidateNode).toHaveBeenCalledOnce();
    expect(variantValidateNode).toHaveBeenCalledOnce();
    expect(configurationValidateNode).not.toHaveBeenCalled();
  });

  it("runs configuration validation after owning and variant validators succeed", () => {
    const calls: string[] = [];
    const owningValidateNode = vi.fn(() => {
      calls.push("owning");
      return null;
    });
    const variantValidateNode = vi.fn(() => {
      calls.push("variant");
      return null;
    });
    const configurationValidateNode = vi.fn(() => {
      calls.push("configuration");
      return false;
    });
    const definition = defineBlock({
      nodeType: "fixture",
      configuration: defineConfiguration({
        attr: "data",
        schema: z.custom(configurationValidateNode),
        controls: [],
      }),
      insert: {
        id: "fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
        validateNode: owningValidateNode,
        variants: [
          {
            id: "fixture-preset",
            title: "Fixture preset",
            description: "Insert a fixture preset.",
            content: () => ({ type: "fixture" }),
            validateNode: variantValidateNode,
          },
        ],
      },
    });
    const [, variant] = createBlockInsertActions([definition]);

    expect(variant?.validateNode?.(fixtureNode({ label: 42 }))).toEqual({
      code: "invalid_catalog_content",
      field: "data",
      message: 'Insert action "fixture-preset" produced invalid "data" attrs for "fixture".',
    });
    expect(calls).toEqual(["owning", "variant", "configuration"]);
    expect(owningValidateNode).toHaveBeenCalledOnce();
    expect(variantValidateNode).toHaveBeenCalledOnce();
    expect(configurationValidateNode).toHaveBeenCalledOnce();
  });

  it("rejects a node whose type differs from the definition", () => {
    const otherSchema = new Schema({
      nodes: {
        doc: { content: "other" },
        text: {},
        other: { toDOM: () => ["div", 0] },
      },
    });
    const definition = defineBlock({
      nodeType: "fixture",
      configuration: defineConfiguration({
        attr: "data",
        schema: z.object({ label: z.string() }),
        controls: [],
      }),
      insert: {
        id: "insert-fixture",
        title: "Fixture",
        description: "Insert a fixture.",
        icon: ArticleIcon,
        category: "content",
        content: () => ({ type: "fixture" }),
      },
    });
    const action = createBlockInsertAction(definition);

    expect(action?.validateNode?.(otherSchema.node("other"))).toEqual({
      code: "invalid_catalog_content",
      message: 'Insert action "insert-fixture" produced "other", not "fixture".',
    });
  });
});
