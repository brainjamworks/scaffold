import { CircleIcon } from "@phosphor-icons/react";
import { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { z } from "zod";

import { defineConfiguration } from "@/editor/configuration/definition";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { builtInLayoutAuthoringViewRegistry } from "../authoring/built-in-layout-views";
import { builtInLayoutRuntimeViewRegistry } from "../runtime/built-in-layout-views";
import { accordionLayoutDefinition } from "../accordion/accordion-definition";
import { builtInLayoutRegistry } from "./built-in-layout-definitions";
import {
  defineLayout,
  type LayoutDefinition,
  type LayoutPlaceholderContext,
  type RegisteredLayoutDefinition,
  type RegisteredLayoutSectionDefinition,
} from "./layout-definition";
import { createLayoutRegistry } from "./layout-registry";

type BuiltInLayoutDefinitions =
  typeof import("./built-in-layout-definitions").builtInLayoutDefinitions;

const nodeSchema = new Schema({
  nodes: {
    doc: { content: "block*" },
    layout: { group: "block", attrs: { variant: { default: null } } },
    paragraph: { group: "block" },
    text: {},
  },
});

function createDefinition(id: string): LayoutDefinition {
  return {
    id,
    title: `Layout ${id}`,
    description: `Description for ${id}`,
    icon: CircleIcon,
    createContent: () => ({ type: "layout", attrs: { variant: id } }),
  };
}

function createPlaceholderContext(): LayoutPlaceholderContext {
  const node = nodeSchema.node("layout", { variant: "with-placeholders" });
  const ancestor = nodeSchema.node("doc", undefined, [node]);

  return {
    editor: Object.create(Editor.prototype),
    node,
    pos: 0,
    ancestor,
    depth: 0,
    $pos: ancestor.resolve(0),
  };
}

describe("createLayoutRegistry", () => {
  it("preserves definition order in an isolated registry", () => {
    const registry = createLayoutRegistry([createDefinition("first"), createDefinition("second")]);

    expect(registry.definitions.map((definition) => definition.id)).toEqual(["first", "second"]);
    expect(registry.getById("first")).toMatchObject({ id: "first", nodeType: "layout" });
    expect(registry.getById("missing")).toBeUndefined();
  });

  it("looks up only layout nodes with known persisted variants", () => {
    const registry = createLayoutRegistry([createDefinition("known")]);

    expect(registry.getForNode(nodeSchema.node("layout", { variant: "known" }))?.id).toBe("known");
    expect(registry.getForNode(nodeSchema.node("layout", { variant: "unknown" }))).toBeUndefined();
    expect(registry.getForNode(nodeSchema.node("paragraph"))).toBeUndefined();
  });

  it("resolves static and functional placeholders", () => {
    const context = createPlaceholderContext();
    const registry = createLayoutRegistry([
      {
        ...createDefinition("with-placeholders"),
        placeholders: {
          title: "Static placeholder",
          body: ({ pos }) => `Dynamic placeholder at ${pos}`,
        },
      },
    ]);

    expect(registry.resolvePlaceholder("with-placeholders", "title", context)).toBe(
      "Static placeholder",
    );
    expect(registry.resolvePlaceholder("with-placeholders", "body", context)).toBe(
      "Dynamic placeholder at 0",
    );
    expect(registry.resolvePlaceholder("with-placeholders", "missing", context)).toBeUndefined();
    expect(registry.resolvePlaceholder("unknown", "title", context)).toBeUndefined();
  });

  it("rejects blank and duplicate definition IDs", () => {
    expect(() => createLayoutRegistry([createDefinition("")])).toThrow(
      'Layout definition ID "" must not be blank.',
    );
    expect(() => createLayoutRegistry([createDefinition("   ")])).toThrow(
      'Layout definition ID "   " must not be blank.',
    );
    expect(() =>
      createLayoutRegistry([createDefinition("duplicate"), createDefinition("duplicate")]),
    ).toThrow('Layout definition ID "duplicate" is duplicated.');
  });

  it("shallow-freezes owned collections and normalized records only", () => {
    const keywords = ["fixture"];
    const placeholders = { title: "Fixture title" };
    const section = {
      label: "Fixture section",
      addLabel: "Add fixture section",
      create: () => ({ type: "section" }),
    };
    const definition = {
      ...createDefinition("immutable"),
      keywords,
      placeholders,
      section,
    };
    const input = [definition];

    const registry = createLayoutRegistry(input);
    const registered = registry.getById(definition.id);

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.definitions)).toBe(true);
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered?.section)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(definition)).toBe(false);
    expect(Object.isFrozen(keywords)).toBe(false);
    expect(Object.isFrozen(placeholders)).toBe(false);
    expect(Object.isFrozen(section)).toBe(false);
    expect(registered?.keywords).toBe(keywords);
    expect(registered?.placeholders).toBe(placeholders);
    expect(registered?.icon).toBe(definition.icon);
    expect(registered?.createContent).toBe(definition.createContent);
  });

  it("derives the existing layout and section configuration surfaces", () => {
    const registered = createLayoutRegistry([accordionLayoutDefinition]).getById("accordion");

    expect(registered?.quickMenu?.controls.map((control) => control.name)).toEqual([
      "allowMultiple",
      "variant",
    ]);
    expect(registered?.settingsSheet?.nodeType).toBe("layout");
    expect(registered?.section?.settingsSheet?.nodeType).toBe("section");
  });

  it("freezes layout-owned settings-sheet wrappers", () => {
    const layoutSchema = z.object({ label: z.string() });
    const sectionSchema = z.object({ label: z.string() });
    const layoutConfiguration = defineConfiguration({
      attr: "options",
      schema: layoutSchema,
      controls: [],
      sheet: {
        title: "Layout settings",
        sections: [{ id: "layout", title: "Layout" }],
      },
    });
    const sectionConfiguration = defineConfiguration({
      attr: "options",
      schema: sectionSchema,
      controls: [],
      sheet: {
        title: "Section settings",
        sections: [{ id: "section", title: "Section" }],
      },
    });
    const definition: LayoutDefinition = {
      ...createDefinition("configured"),
      configuration: layoutConfiguration,
      section: {
        label: "Section",
        addLabel: "Add section",
        configuration: sectionConfiguration,
        create: () => ({ type: "section" }),
      },
    };

    const registered = createLayoutRegistry([definition]).getById(definition.id);

    expect(Object.isFrozen(registered?.settingsSheet)).toBe(true);
    expect(Object.isFrozen(registered?.section?.settingsSheet)).toBe(true);
    expect(registered?.configuration).toBe(layoutConfiguration);
    expect(registered?.section?.configuration).toBe(sectionConfiguration);
    expect(registered?.settingsSheet?.schema).toBe(layoutSchema);
    expect(registered?.section?.settingsSheet?.schema).toBe(sectionSchema);
    expect(Object.isFrozen(layoutConfiguration)).toBe(false);
    expect(Object.isFrozen(sectionConfiguration)).toBe(false);
    expect(Object.isFrozen(layoutSchema)).toBe(false);
    expect(Object.isFrozen(sectionSchema)).toBe(false);
  });

  it("exposes the approved readonly layout contracts", () => {
    expectTypeOf<BuiltInLayoutDefinitions>().toEqualTypeOf<readonly LayoutDefinition[]>();
    expectTypeOf<RegisteredLayoutDefinition["section"]>().toEqualTypeOf<
      RegisteredLayoutSectionDefinition | undefined
    >();
  });

  it("keeps registries isolated", () => {
    const first = createLayoutRegistry([createDefinition("shared"), createDefinition("first")]);
    const second = createLayoutRegistry([createDefinition("shared"), createDefinition("second")]);

    expect(first.definitions.map((definition) => definition.id)).toEqual(["shared", "first"]);
    expect(second.definitions.map((definition) => definition.id)).toEqual(["shared", "second"]);
    expect(first.getById("shared")).not.toBe(second.getById("shared"));
    expect(first.getById("second")).toBeUndefined();
    expect(second.getById("first")).toBeUndefined();
  });

  it("constructs the exact built-in registry without setup", async () => {
    const { builtInLayoutDefinitions, builtInLayoutRegistry } =
      await import("./built-in-layout-definitions");
    const expectedIds = ["accordion", "paginated", "process-flow", "tabs"];

    expect(builtInLayoutDefinitions.map((definition) => definition.id)).toEqual(expectedIds);
    expect(builtInLayoutRegistry.definitions.map((definition) => definition.id)).toEqual(
      expectedIds,
    );
    expect(builtInLayoutRegistry.getById("accordion")?.nodeType).toBe("layout");
  });

  it("normalizes definitions without mutating built-in registries or catalogs", () => {
    const definition = createDefinition("isolated-definition");
    const builtInIds = builtInLayoutRegistry.definitions.map(({ id }) => id);
    const insertIds = builtInInsertCatalog.actions.map(({ id }) => id);

    const first = defineLayout(definition);
    const second = defineLayout(definition);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first).toMatchObject({ id: definition.id, nodeType: "layout" });
    expect(builtInLayoutRegistry.definitions.map(({ id }) => id)).toEqual(builtInIds);
    expect(builtInLayoutRegistry.getById(definition.id)).toBeUndefined();
    expect(builtInLayoutAuthoringViewRegistry.getById(definition.id)).toBeUndefined();
    expect(builtInLayoutRuntimeViewRegistry.getById(definition.id)).toBeUndefined();
    expect(builtInInsertCatalog.actions.map(({ id }) => id)).toEqual(insertIds);
    expect(builtInInsertCatalog.getById(definition.id)).toBeUndefined();
  });
});

// oxlint-disable-next-line no-constant-condition -- compile-time contract assertions must not run.
if (false) {
  const definition = {} as LayoutDefinition;
  // @ts-expect-error layout definition identity is readonly after declaration.
  definition.id = "changed";

  const registered = {} as RegisteredLayoutDefinition;
  // @ts-expect-error normalized layout identity remains readonly.
  registered.nodeType = "layout";

  const section = {} as RegisteredLayoutSectionDefinition;
  // @ts-expect-error normalized section metadata remains readonly.
  section.label = "Changed";

  const builtIns = [] as unknown as BuiltInLayoutDefinitions;
  // @ts-expect-error the canonical built-in seam exposes readonly definitions.
  builtIns[0]!.id = "changed";
}
