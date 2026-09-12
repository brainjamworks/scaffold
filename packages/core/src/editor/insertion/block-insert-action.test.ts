import { ArticleIcon } from "@phosphor-icons/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockInsertAction, createBlockInsertActions } from "./block-insert-action";

describe("createBlockInsertAction", () => {
  it("derives divergent action and node identities without mutating the definition", () => {
    const definition = defineBlock({
      nodeType: "fixture",
      title: "Fixture block",
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
      title: "Fixture block",
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
    const hidden = defineBlock({ nodeType: "hidden", title: "Hidden fixture block" });
    const visible = defineBlock({
      nodeType: "fixture",
      title: "Fixture block",
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
      title: "Fixture block",
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
      title: "Fixture block",
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
});
