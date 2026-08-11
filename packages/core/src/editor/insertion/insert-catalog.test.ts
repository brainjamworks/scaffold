import { TextT } from "@phosphor-icons/react";
import { describe, expect, it, vi } from "vite-plus/test";

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

  it("rejects insertion action ids that are not kebab-case", () => {
    expect(() =>
      createInsertCatalog([action("stat_highlight", { nodeType: "stat_highlight" })]),
    ).toThrow('Insert action id "stat_highlight" must be a stable kebab-case name.');
  });

  it("keeps several authoring actions distinct from one persisted Block node type", () => {
    const catalog = createInsertCatalog([
      action("stat-highlight", { nodeType: "stat_highlight" }),
      action("stat-highlight-emphasis", {
        nodeType: "stat_highlight",
        variantOf: "stat-highlight",
      }),
    ]);

    expect(catalog.actions.map(({ id, nodeType }) => ({ id, nodeType }))).toEqual([
      { id: "stat-highlight", nodeType: "stat_highlight" },
      { id: "stat-highlight-emphasis", nodeType: "stat_highlight" },
    ]);
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
    const sourceKeywords = ["example"];
    const source = {
      ...action("example", {
        content,
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

  it("does not consume command, provider, DOM, or transient lookalikes in local metadata", () => {
    const localKeys = [
      "table:add-row-after",
      "heading.toggle:H2",
      "YouTube/Vimeo",
      "palette:derive-dark",
      ":r0:",
      "surface@pending",
    ];
    const catalog = createInsertCatalog([action("local-key-owner", { keywords: localKeys })]);

    expect(catalog.getById("local-key-owner")?.keywords).toEqual(localKeys);
  });
});
