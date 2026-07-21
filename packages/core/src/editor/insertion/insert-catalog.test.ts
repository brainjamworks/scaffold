import { TextT } from "@phosphor-icons/react";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { validateCatalogNodeAttrs } from "./catalog-validation";
import type { InsertAction } from "./insert-action";
import { createInsertCatalog } from "./insert-catalog";

function action(id: string, overrides: Partial<InsertAction> = {}): InsertAction {
  return {
    id,
    nodeType: `${id}_block`,
    title: id,
    description: `${id} description`,
    icon: TextT,
    category: "content",
    keywords: [id, "scaffold"],
    content: () => ({ type: `${id}_block` }),
    ...overrides,
  };
}

describe("createInsertCatalog", () => {
  it("constructs an isolated searchable catalog in source order", () => {
    const first = action("first");
    const second = action("second", { category: "media" });
    const catalog = createInsertCatalog([first, second]);

    expect(catalog.actions.map((candidate) => candidate.id)).toEqual(["first", "second"]);
    expect(catalog.getById("second")?.nodeType).toBe("second_block");
    expect(catalog.getByCategory("content").map((candidate) => candidate.id)).toEqual(["first"]);
    expect(catalog.getByCategory("media").map((candidate) => candidate.id)).toEqual(["second"]);
    expect(catalog.getById("missing")).toBeUndefined();
  });

  it("fails when action ids are duplicated", () => {
    expect(() => createInsertCatalog([action("same"), action("same")])).toThrow(
      'Duplicate insert action id "same".',
    );
  });

  it("fails when a variant parent is missing", () => {
    expect(() => createInsertCatalog([action("variant", { variantOf: "missing" })])).toThrow(
      'Insert action "variant" references missing variant parent "missing".',
    );
  });

  it("fails when a variant refers to itself", () => {
    expect(() => createInsertCatalog([action("self", { variantOf: "self" })])).toThrow(
      'Insert action "self" cannot be its own variant parent.',
    );
  });

  it("fails when a variant targets a different node type than its parent", () => {
    expect(() =>
      createInsertCatalog([
        action("chart", { nodeType: "chart_block" }),
        action("bar-chart", {
          nodeType: "other_block",
          variantOf: "chart",
        }),
      ]),
    ).toThrow(
      'Insert action "bar-chart" targets node type "other_block", but its variant parent "chart" targets "chart_block".',
    );
  });

  it("owns immutable snapshots without recursively freezing embedded values", () => {
    const content = vi.fn(() => ({ type: "example_block" }));
    const validator = vi.fn(() => null);
    const sourceKeywords = ["example"];
    const source = {
      ...action("example", {
        content,
        validateNode: validator,
        keywords: sourceKeywords,
      }),
    };
    const input = [source];
    const catalog = createInsertCatalog(input);

    input.push(action("later"));
    sourceKeywords.push("later");
    source.title = "mutated source";

    expect(catalog.actions).toHaveLength(1);
    expect(catalog.actions[0]?.title).toBe("example");
    expect(catalog.actions[0]?.keywords).toEqual(["example"]);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.actions)).toBe(true);
    expect(Object.isFrozen(catalog.actions[0])).toBe(true);
    expect(Object.isFrozen(catalog.actions[0]?.keywords)).toBe(true);
    expect(Object.isFrozen(content)).toBe(false);
    expect(Object.isFrozen(validator)).toBe(false);
    expect(Object.isFrozen(TextT)).toBe(false);
    expect(catalog.actions[0]?.content()).toEqual({ type: "example_block" });
  });

  it("returns immutable category snapshots", () => {
    const catalog = createInsertCatalog([action("first"), action("second")]);
    const contentActions = catalog.getByCategory("content");

    expect(Object.isFrozen(contentActions)).toBe(true);
    expect(() => {
      Reflect.apply(Array.prototype.push, contentActions, [action("third")]);
    }).toThrow();
  });
});

describe("validateCatalogNodeAttrs", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "example_block" },
      text: {},
      example_block: {
        attrs: { data: { default: null } },
        toDOM: () => ["div", 0],
      },
    },
  });

  it("returns a structured issue for invalid node attrs", () => {
    const validate = validateCatalogNodeAttrs([
      {
        nodeType: "example_block",
        schema: z.object({ data: z.object({ value: z.string() }) }),
        field: "data",
        message: "Example data is invalid.",
      },
    ]);
    const node = schema.nodeFromJSON({
      type: "example_block",
      attrs: { data: { value: 42 } },
    });

    expect(validate(node)).toEqual({
      code: "invalid_catalog_content",
      field: "data",
      message: "Example data is invalid.",
    });
  });

  it("accepts valid attrs and checks descendants", () => {
    const validate = validateCatalogNodeAttrs([
      {
        nodeType: "example_block",
        schema: z.object({ data: z.object({ value: z.string() }) }),
      },
    ]);
    const node = schema.nodeFromJSON({
      type: "example_block",
      attrs: { data: { value: "valid" } },
    });

    expect(validate(node)).toBeNull();
  });
});
