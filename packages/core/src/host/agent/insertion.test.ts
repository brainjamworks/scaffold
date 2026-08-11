import type { Icon } from "@phosphor-icons/react";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import type { InsertAction } from "@/editor/insertion/insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";

import { createCatalogNodeChecked } from "./insertion";

const TestIcon = (() => null) as unknown as Icon;
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    plus_block: {
      attrs: { id: { default: null } },
      content: "inline*",
      group: "block",
    },
  },
});

const coreAction: InsertAction = {
  id: "core-paragraph",
  nodeType: "paragraph",
  title: "Paragraph",
  description: "Insert a Core paragraph",
  icon: TestIcon,
  category: "content",
  content: () => ({
    type: "paragraph",
    content: [{ type: "text", text: "Core content" }],
  }),
};

const plusAction: InsertAction = {
  id: "plus-private-block",
  nodeType: "plus_block",
  title: "Private Plus Block",
  description: "Insert a private Plus Block",
  icon: TestIcon,
  category: "content",
  content: () => ({
    type: "plus_block",
    attrs: { id: "plus-stable-id" },
  }),
};

describe("Agent host createCatalogNodeChecked", () => {
  it("creates a Core action from the supplied catalog", () => {
    const catalog = createInsertCatalog([coreAction]);

    const result = createCatalogNodeChecked({
      catalog,
      schema,
      actionId: coreAction.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item).toBe(catalog.getById(coreAction.id));
    expect(result.node.type.name).toBe("paragraph");
    expect(result.node.textContent).toBe("Core content");
  });

  it("creates a Plus-style action from the supplied catalog", () => {
    const catalog = createInsertCatalog([plusAction]);

    const result = createCatalogNodeChecked({
      catalog,
      schema,
      actionId: plusAction.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item).toBe(catalog.getById(plusAction.id));
    expect(result.node.type.name).toBe("plus_block");
    expect(result.node.attrs["id"]).toBe("plus-stable-id");
  });

  it("rejects an action absent from the supplied catalog", () => {
    const result = createCatalogNodeChecked({
      catalog: createInsertCatalog([]),
      schema,
      actionId: "callout",
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "unknown_catalog_item",
        message: 'Insert action "callout" is not in the supplied catalog.',
      },
    });
  });

  it("creates the supplied action with a content override", () => {
    const result = createCatalogNodeChecked({
      catalog: createInsertCatalog([coreAction]),
      schema,
      actionId: coreAction.id,
      contentOverride: {
        type: "paragraph",
        content: [{ type: "text", text: "Overridden content" }],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.textContent).toBe("Overridden content");
  });
});
