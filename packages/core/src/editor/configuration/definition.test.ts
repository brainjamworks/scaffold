import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  defineConfiguration,
  getConfigurationControlDescriptorId,
  type ConfigurationControlDescriptor,
} from "./definition";

describe("block configuration descriptors", () => {
  it("accepts controls placed in quick menu and sheet surfaces", () => {
    const controls: ConfigurationControlDescriptor[] = [
      {
        kind: "select",
        name: "feedbackMode",
        label: "Feedback mode",
        options: [
          { value: "on_submit", label: "On submit" },
          { value: "immediate", label: "Immediate" },
        ],
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "behaviour" },
        },
      },
      {
        kind: "boolean",
        name: "showAnswer",
        label: "Show answer",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "behaviour" },
        },
      },
      {
        kind: "number",
        name: "points",
        label: "Points",
        min: 0,
        step: 1,
        integer: true,
        placement: {
          sheet: { section: "scoring" },
        },
      },
    ];

    const configuration = defineConfiguration({
      attr: "settings",
      schema: z.object({}),
      sheet: {
        title: "Block settings",
        sections: [
          { id: "behaviour", title: "Behaviour" },
          { id: "scoring", title: "Scoring" },
        ],
      },
      controls,
    });

    expect(configuration.attr).toBe("settings");
    expect(configuration.controls).toBe(controls);
    expect(configuration.controls.map(getConfigurationControlDescriptorId)).toEqual([
      "name:feedbackMode",
      "name:showAnswer",
      "name:points",
    ]);
  });

  it("rejects duplicate control names within one configuration", () => {
    expect(() =>
      defineConfiguration({
        attr: "settings",
        schema: z.object({}),
        controls: [
          { kind: "boolean", name: "showAnswer", label: "Show answer" },
          { kind: "number", name: "showAnswer", label: "Score" },
        ],
      }),
    ).toThrow('Duplicate configuration control descriptor "name:showAnswer".');
  });

  it("rejects sheet placements that reference missing sections", () => {
    expect(() =>
      defineConfiguration({
        attr: "settings",
        schema: z.object({}),
        sheet: {
          title: "Block settings",
          sections: [{ id: "scoring", title: "Scoring" }],
        },
        controls: [
          {
            kind: "boolean",
            name: "showAnswer",
            label: "Show answer",
            placement: { sheet: { section: "behaviour" } },
          },
        ],
      }),
    ).toThrow(
      'Configuration control "name:showAnswer" references missing sheet section "behaviour".',
    );
  });

  it("rejects quick menu placement for sheet-only control kinds", () => {
    expect(() =>
      defineConfiguration({
        attr: "settings",
        schema: z.object({}),
        controls: [
          {
            kind: "textarea",
            name: "summary",
            label: "Summary",
            placement: { quickMenu: { presentation: "menu" } },
          },
        ],
      }),
    ).toThrow('Configuration control "name:summary" cannot be placed in the quick menu.');
  });

  it("rejects quick menu placement for image controls", () => {
    expect(() =>
      defineConfiguration({
        attr: "settings",
        schema: z.object({}),
        controls: [
          {
            kind: "image",
            name: "background",
            label: "Background image",
            mediaStorage: "url",
            placement: { quickMenu: { presentation: "menu" } },
          },
        ],
      }),
    ).toThrow('Configuration control "name:background" cannot be placed in the quick menu.');
  });

  it("rejects quick menu placement for data grid controls", () => {
    expect(() =>
      defineConfiguration({
        attr: "settings",
        schema: z.object({}),
        controls: [
          {
            kind: "dataGrid",
            name: "table",
            label: "Table data",
            placement: { quickMenu: { presentation: "menu" } },
          },
        ],
      }),
    ).toThrow('Configuration control "name:table" cannot be placed in the quick menu.');
  });

  it("rejects dynamic select options in quick menu placement", () => {
    expect(() =>
      defineConfiguration({
        attr: "settings",
        schema: z.object({}),
        controls: [
          {
            kind: "select",
            name: "mapping.value",
            label: "Value",
            optionsSource: {
              kind: "dataGridColumns",
              name: "table",
            },
            placement: { quickMenu: { presentation: "menu" } },
          },
        ],
      }),
    ).toThrow(
      'Configuration control "name:mapping.value" cannot use dynamic options in the quick menu.',
    );
  });

  it("accepts a schema-valid direct-child collection in a declared sheet section", () => {
    const configuration = defineConfiguration({
      attr: "data",
      schema: z.object({ type: z.literal("fixture") }),
      sheet: {
        title: "Fixture settings",
        sections: [{ id: "items", title: "Items" }],
      },
      controls: [],
      collections: [
        {
          id: "items",
          childNodeType: "fixture_item",
          attr: "data",
          schema: z.object({ title: z.string() }),
          initialValue: { title: "" },
          itemLabel: "Item",
          addLabel: "Add item",
          referenceStyle: "lower-alpha",
          placement: { sheet: { section: "items" } },
          fields: [{ kind: "text", name: "title", label: "Title" }],
        },
      ],
    });

    expect(configuration.collections?.[0]?.id).toBe("items");
  });

  it("rejects duplicate collection ids", () => {
    const collection = {
      id: "items",
      childNodeType: "fixture_item",
      attr: "data" as const,
      schema: z.object({ title: z.string() }),
      initialValue: { title: "" },
      itemLabel: "Item",
      addLabel: "Add item",
      placement: { sheet: { section: "items" } },
      fields: [{ kind: "text" as const, name: "title", label: "Title" }],
    };

    expect(() =>
      defineConfiguration({
        attr: "data",
        schema: z.object({}),
        sheet: {
          title: "Fixture settings",
          sections: [{ id: "items", title: "Items" }],
        },
        controls: [],
        collections: [collection, collection],
      }),
    ).toThrow('Duplicate configuration collection descriptor "items".');
  });

  it("rejects collections without a valid sheet-only placement", () => {
    const baseCollection = {
      id: "items",
      childNodeType: "fixture_item",
      attr: "data" as const,
      schema: z.object({ title: z.string() }),
      initialValue: { title: "" },
      itemLabel: "Item",
      addLabel: "Add item",
      fields: [{ kind: "text" as const, name: "title", label: "Title" }],
    };

    expect(() =>
      defineConfiguration({
        attr: "data",
        schema: z.object({}),
        controls: [],
        collections: [
          {
            ...baseCollection,
            placement: { sheet: { section: "items" } },
          },
        ],
      }),
    ).toThrow(
      'Configuration collection "items" declares sheet placement, but no sheet is configured.',
    );

    expect(() =>
      defineConfiguration({
        attr: "data",
        schema: z.object({}),
        sheet: {
          title: "Fixture settings",
          sections: [{ id: "other", title: "Other" }],
        },
        controls: [],
        collections: [
          {
            ...baseCollection,
            placement: { sheet: { section: "items" } },
          },
        ],
      }),
    ).toThrow('Configuration collection "items" references missing sheet section "items".');

    expect(() =>
      defineConfiguration({
        attr: "data",
        schema: z.object({}),
        sheet: {
          title: "Fixture settings",
          sections: [{ id: "items", title: "Items" }],
        },
        controls: [],
        collections: [
          {
            ...baseCollection,
            placement: {
              quickMenu: { presentation: "menu" as const },
              sheet: { section: "items" },
            },
          },
        ],
      }),
    ).toThrow('Configuration collection "items" cannot be placed in the quick menu.');
  });

  it("rejects invalid initial values, placed fields, and nested collections", () => {
    const defineFixture = (fields: ConfigurationControlDescriptor[]) =>
      defineConfiguration({
        attr: "data",
        schema: z.object({}),
        sheet: {
          title: "Fixture settings",
          sections: [{ id: "items", title: "Items" }],
        },
        controls: [],
        collections: [
          {
            id: "items",
            childNodeType: "fixture_item",
            attr: "data",
            schema: z.object({ title: z.string() }),
            initialValue: { title: "" },
            itemLabel: "Item",
            addLabel: "Add item",
            placement: { sheet: { section: "items" } },
            fields,
          },
        ],
      });

    expect(() =>
      defineConfiguration({
        attr: "data",
        schema: z.object({}),
        sheet: {
          title: "Fixture settings",
          sections: [{ id: "items", title: "Items" }],
        },
        controls: [],
        collections: [
          {
            id: "items",
            childNodeType: "fixture_item",
            attr: "data",
            schema: z.object({ title: z.string() }),
            initialValue: { title: 42 },
            itemLabel: "Item",
            addLabel: "Add item",
            placement: { sheet: { section: "items" } },
            fields: [{ kind: "text", name: "title", label: "Title" }],
          },
        ],
      }),
    ).toThrow('Configuration collection "items" has an invalid initial value.');

    expect(() =>
      defineFixture([
        {
          kind: "text",
          name: "title",
          label: "Title",
          placement: { sheet: { section: "items" } },
        },
      ]),
    ).toThrow('Configuration collection "items" field "name:title" cannot declare placement.');

    expect(() =>
      defineFixture([
        {
          kind: "collection",
          name: "children",
          label: "Children",
        } as unknown as ConfigurationControlDescriptor,
      ]),
    ).toThrow('Configuration collection "items" cannot contain nested collections.');
  });
});
