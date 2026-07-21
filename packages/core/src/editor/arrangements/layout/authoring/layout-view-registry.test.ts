import { CircleIcon, type Icon } from "@phosphor-icons/react";
import { Schema } from "@tiptap/pm/model";
import type { ComponentType } from "react";
import { describe, expect, it } from "vite-plus/test";

import {
  builtInLayoutAuthoringViewRegistry,
  builtInLayoutAuthoringViews,
} from "./built-in-layout-views";
import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import type { LayoutDefinition } from "../model/layout-definition";
import { createLayoutRegistry } from "../model/layout-registry";
import type { LayoutComponentProps, LayoutViewRegistration } from "./layout-view-definition";
import { createLayoutAuthoringViewRegistry } from "./layout-view-registry";

const nodeSchema = new Schema({
  nodes: {
    doc: { content: "block*" },
    layout: { group: "block", attrs: { variant: { default: null } } },
    paragraph: { group: "block" },
    text: {},
  },
});

const TestIcon: Icon = CircleIcon;
const TestLayoutView = (() => null) as ComponentType<LayoutComponentProps>;

function createDefinition(id: string): LayoutDefinition {
  return {
    id,
    title: `Layout ${id}`,
    description: `Description for ${id}`,
    icon: TestIcon,
    createContent: () => ({ type: "layout", attrs: { variant: id } }),
  };
}

function createView(id: string): LayoutViewRegistration {
  return { id, layout: TestLayoutView };
}

describe("createLayoutAuthoringViewRegistry", () => {
  it("constructs exact built-in authoring parity", () => {
    const definitionIds = builtInLayoutRegistry.definitions.map((definition) => definition.id);

    expect(builtInLayoutAuthoringViews.map((view) => view.id)).toEqual(definitionIds);
    expect(builtInLayoutAuthoringViewRegistry.getById("accordion")?.nodeType).toBe("layout");
  });

  it("compares keys independently of view order", () => {
    const definitions = createLayoutRegistry([
      createDefinition("first"),
      createDefinition("second"),
    ]);
    const registry = createLayoutAuthoringViewRegistry(definitions, [
      createView("second"),
      createView("first"),
    ]);

    expect(registry.getById("first")?.id).toBe("first");
    expect(registry.getById("second")?.id).toBe("second");
  });

  it("rejects duplicate authoring IDs deterministically", () => {
    const definitions = createLayoutRegistry([createDefinition("duplicate")]);

    expect(() =>
      createLayoutAuthoringViewRegistry(definitions, [
        createView("duplicate"),
        createView("duplicate"),
      ]),
    ).toThrow('Layout authoring view IDs are duplicated: "duplicate".');
  });

  it("rejects sorted missing and extra authoring IDs", () => {
    const definitions = createLayoutRegistry([
      createDefinition("missing-z"),
      createDefinition("shared"),
      createDefinition("missing-a"),
    ]);

    expect(() =>
      createLayoutAuthoringViewRegistry(definitions, [
        createView("extra-z"),
        createView("shared"),
        createView("extra-a"),
      ]),
    ).toThrow(
      'Layout authoring view IDs do not match definitions. Missing: "missing-a", "missing-z". Extra: "extra-a", "extra-z".',
    );
  });

  it("looks up only layout nodes with known persisted variants", () => {
    const definitions = createLayoutRegistry([createDefinition("known")]);
    const registry = createLayoutAuthoringViewRegistry(definitions, [createView("known")]);

    expect(registry.getForNode(nodeSchema.node("layout", { variant: "known" }))?.id).toBe("known");
    expect(registry.getForNode(nodeSchema.node("layout", { variant: "unknown" }))).toBeUndefined();
    expect(registry.getForNode(nodeSchema.node("paragraph"))).toBeUndefined();
  });

  it("copies and shallow-freezes its owned collection records", () => {
    const definitions = createLayoutRegistry([createDefinition("immutable")]);
    const view = createView("immutable");
    const views = [view];
    const registry = createLayoutAuthoringViewRegistry(definitions, views);
    const registered = registry.getById("immutable");

    views.splice(0, 1);

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(views)).toBe(false);
    expect(Object.isFrozen(view)).toBe(false);
    expect(registered?.layout).toBe(TestLayoutView);
    expect(registry.getById("immutable")?.id).toBe("immutable");
  });
});
