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
