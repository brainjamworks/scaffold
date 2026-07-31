import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import type { ConfigurationDefinition } from "./definition";
import type { SettingsSheetApplyInput } from "./settings-sheet";
import { deriveSettingsSheetDefinition } from "./settings-sheet-derivation";

describe("deriveSettingsSheetDefinition", () => {
  it("merges scalar fields and direct-child collections by declared sheet order", () => {
    const collectionSchema = z.object({ label: z.string() });
    const settingsSheet = deriveSettingsSheetDefinition({
      attr: "data",
      schema: z.object({ before: z.string(), after: z.string() }),
      sheet: {
        title: "Mixed settings",
        sections: [{ id: "content", title: "Content" }],
      },
      controls: [
        {
          kind: "text",
          name: "after",
          label: "After collection",
          placement: { sheet: { section: "content", order: 30 } },
        },
        {
          kind: "text",
          name: "before",
          label: "Before collection",
          placement: { sheet: { section: "content", order: 10 } },
        },
      ],
      collections: [
        {
          id: "items",
          childNodeType: "fixture_item",
          attr: "data",
          schema: collectionSchema,
          initialValue: { label: "" },
          itemLabel: "Item",
          addLabel: "Add item",
          placement: { sheet: { section: "content", order: 20 } },
          fields: [{ kind: "text", name: "label", label: "Label" }],
        },
      ],
    });

    expect(settingsSheet?.sections[0]?.items).toMatchObject([
      { kind: "text", name: "before" },
      { kind: "directChildCollection", id: "items" },
      { kind: "text", name: "after" },
    ]);
    expect(settingsSheet?.sections[0]).not.toHaveProperty("fields");
    expect(settingsSheet?.sections[0]).not.toHaveProperty("collections");
  });

  it("derives named sheet fields from sheet-placed configuration controls", () => {
    const toDraft = (raw: unknown) => raw;
    const persistedSchema = z.object({ persisted: z.string() });
    const editSchema = z.object({
      title: z.string(),
      showLegend: z.boolean(),
    });
    const settingsSheet = deriveSettingsSheetDefinition({
      attr: "settings",
      schema: persistedSchema,
      editSchema,
      sheet: {
        title: "Block settings",
        sections: [{ id: "main", title: "Main" }],
      },
      toDraft,
      controls: [
        {
          kind: "image",
          name: "background",
          label: "Background image",
          mediaStorage: "url",
          positioning: "crop",
          chooseLabel: "Choose background image",
          placement: { sheet: { section: "main", order: 5 } },
        },
        {
          kind: "dataGrid",
          name: "table",
          label: "Table data",
          placement: { sheet: { section: "main", order: 15 } },
        },
        {
          kind: "select",
          name: "mapping.value",
          label: "Value",
          optionsSource: {
            kind: "dataGridColumns",
            name: "table",
            columnTypes: ["number"],
          },
          placement: { sheet: { section: "main", order: 25 } },
        },
        {
          kind: "boolean",
          name: "showLegend",
          label: "Show legend",
          placement: { sheet: { section: "main", order: 20 } },
        },
        {
          kind: "text",
          name: "title",
          label: "Title",
          placement: { sheet: { section: "main", order: 10 } },
        },
      ],
    });

    expect(settingsSheet?.sections[0]?.items).toMatchObject([
      {
        kind: "image",
        name: "background",
        label: "Background image",
        mediaStorage: "url",
        positioning: "crop",
        chooseLabel: "Choose background image",
      },
      { kind: "text", name: "title", label: "Title" },
      { kind: "dataGrid", name: "table", label: "Table data" },
      { kind: "boolean", name: "showLegend", label: "Show legend" },
      {
        kind: "select",
        name: "mapping.value",
        label: "Value",
        optionsSource: {
          kind: "dataGridColumns",
          name: "table",
          columnTypes: ["number"],
        },
      },
    ]);
    expect(settingsSheet?.schema).toBe(persistedSchema);
    expect(settingsSheet?.editSchema).toBe(editSchema);
    expect(settingsSheet?.toDraft).toBe(toDraft);
  });

  it("derives reusable colour picker inputs for sheet-placed colour controls", () => {
    const palette = [
      { value: "", label: "Inherited" },
      { value: "#161d77", label: "Navy" },
    ];
    const settingsSheet = deriveSettingsSheetDefinition({
      attr: "settings",
      schema: z.object({ accentColor: z.string().optional() }),
      sheet: {
        title: "Colour settings",
        sections: [{ id: "appearance", title: "Appearance" }],
      },
      controls: [
        {
          kind: "color",
          name: "accentColor",
          label: "Accent colour",
          pickerLabel: "Accent",
          labelSuffix: "accent",
          palette,
          fallbackColor: "#ffffff",
          resetValue: "",
          resetLabel: "Use inherited",
          resetAriaLabel: "Use inherited accent colour",
          customHint: "Enter an accent hex colour, for example #161d77.",
          placement: { sheet: { section: "appearance" } },
        },
      ],
    });

    expect(settingsSheet?.sections[0]?.items[0]).toEqual({
      kind: "color",
      name: "accentColor",
      label: "Accent colour",
      pickerLabel: "Accent",
      labelSuffix: "accent",
      palette,
      fallbackColor: "#ffffff",
      resetValue: "",
      resetLabel: "Use inherited",
      resetAriaLabel: "Use inherited accent colour",
      customHint: "Enter an accent hex colour, for example #161d77.",
    });
  });

  it("preserves sheet select presentation independently of quick-menu presentation", () => {
    const settingsSheet = deriveSettingsSheetDefinition({
      attr: "settings",
      schema: z.object({ mode: z.string() }),
      sheet: {
        title: "Mode settings",
        sections: [{ id: "behaviour", title: "Behaviour" }],
      },
      controls: [
        {
          kind: "select",
          name: "mode",
          label: "Mode",
          options: [
            { value: "practice", label: "Practice" },
            { value: "graded", label: "Graded" },
          ],
          presentation: "segmented",
          placement: {
            quickMenu: { presentation: "menu" },
            sheet: { section: "behaviour" },
          },
        },
      ],
    });

    expect(settingsSheet?.sections[0]?.items[0]).toMatchObject({
      kind: "select",
      name: "mode",
      presentation: "segmented",
    });
  });

  it("derives direct-child collections into their declared sections in declaration order", () => {
    const firstSchema = z.object({
      image: z.object({ imageUrl: z.string() }).optional(),
      caption: z.object({ type: z.literal("doc") }),
    });
    const secondSchema = z.object({ note: z.string() });
    const settingsSheet = deriveSettingsSheetDefinition({
      attr: "data",
      schema: z.object({}),
      sheet: {
        title: "Collection settings",
        sections: [{ id: "items", title: "Items" }],
      },
      controls: [],
      collections: [
        {
          id: "primary",
          childNodeType: "fixture_item",
          attr: "data",
          schema: firstSchema,
          initialValue: { caption: { type: "doc" } },
          itemLabel: "Primary item",
          addLabel: "Add primary item",
          referenceStyle: "lower-alpha",
          placement: { sheet: { section: "items", order: 20 } },
          fields: [
            {
              kind: "image",
              name: "image",
              label: "Image",
              mediaStorage: "canonical",
            },
            {
              kind: "richText",
              name: "caption",
              label: "Caption",
              placeholder: "Describe this image",
            },
          ],
        },
        {
          id: "secondary",
          childNodeType: "fixture_note",
          attr: "data",
          schema: secondSchema,
          initialValue: { note: "" },
          itemLabel: "Note",
          addLabel: "Add note",
          placement: { sheet: { section: "items", order: 10 } },
          fields: [{ kind: "textarea", name: "note", label: "Note" }],
        },
      ],
    });

    expect(settingsSheet?.sections[0]?.items).toEqual([
      {
        kind: "directChildCollection",
        id: "secondary",
        childNodeType: "fixture_note",
        attr: "data",
        schema: secondSchema,
        initialValue: { note: "" },
        itemLabel: "Note",
        addLabel: "Add note",
        fields: [{ kind: "textarea", name: "note", label: "Note" }],
      },
      {
        kind: "directChildCollection",
        id: "primary",
        childNodeType: "fixture_item",
        attr: "data",
        schema: firstSchema,
        initialValue: { caption: { type: "doc" } },
        itemLabel: "Primary item",
        addLabel: "Add primary item",
        referenceStyle: "lower-alpha",
        fields: [
          {
            kind: "image",
            name: "image",
            label: "Image",
            mediaStorage: "canonical",
          },
          {
            kind: "richText",
            name: "caption",
            label: "Caption",
            placeholder: "Describe this image",
          },
        ],
      },
    ]);
  });

  it("freezes every owned projection level while preserving borrowed leaves", () => {
    const persistedSchema = z.object({ mode: z.string() });
    const editSchema = z.object({ mode: z.string() });
    const collectionSchema = z.object({ mode: z.string() });
    const createInitialDraft = () => ({ mode: "compact" });
    const toDraft = (raw: unknown) => raw;
    const apply = ({ tr }: SettingsSheetApplyInput) => ({ ok: true as const, tr });
    const defaultOpenSections = ["main"];
    const selectOptions = [{ value: "compact", label: "Compact" }];
    const collectionOptions = [{ value: "detail", label: "Detail" }];
    const sectionDescription = createElement("span", null, "Section description");
    const fieldDescription = createElement("span", null, "Field description");
    const sectionDescriptionWasFrozen = Object.isFrozen(sectionDescription);
    const fieldDescriptionWasFrozen = Object.isFrozen(fieldDescription);
    const initialValue = { mode: "detail" };
    const configuration = {
      attr: "settings",
      schema: persistedSchema,
      editSchema,
      createInitialDraft,
      toDraft,
      apply,
      sheet: {
        title: "Fixture settings",
        sections: [{ id: "main", title: "Main", description: sectionDescription }],
        defaultOpenSections,
      },
      controls: [
        {
          kind: "select",
          name: "mode",
          label: "Mode",
          description: fieldDescription,
          options: selectOptions,
          placement: { sheet: { section: "main" } },
        },
      ],
      collections: [
        {
          id: "items",
          childNodeType: "fixture_item",
          attr: "data",
          schema: collectionSchema,
          initialValue,
          itemLabel: "Item",
          addLabel: "Add item",
          placement: { sheet: { section: "main" } },
          fields: [
            {
              kind: "select",
              name: "mode",
              label: "Mode",
              options: collectionOptions,
            },
          ],
        },
      ],
    } satisfies ConfigurationDefinition;

    const settingsSheet = deriveSettingsSheetDefinition(configuration);
    if (!settingsSheet) throw new Error("Expected a settings-sheet projection.");
    const section = settingsSheet.sections[0];
    const field = section?.items.find((item) => item.kind === "select");
    const collection = section?.items.find((item) => item.kind === "directChildCollection");
    const collectionField = collection?.fields[0];

    expect(Object.isFrozen(settingsSheet)).toBe(true);
    expect(Object.isFrozen(settingsSheet.sections)).toBe(true);
    expect(Object.isFrozen(section)).toBe(true);
    expect(Object.isFrozen(section?.items)).toBe(true);
    expect(section?.items.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(collection)).toBe(true);
    expect(Object.isFrozen(collection?.fields)).toBe(true);
    expect(collection?.fields.every(Object.isFrozen)).toBe(true);

    expect(settingsSheet.schema).toBe(persistedSchema);
    expect(settingsSheet.editSchema).toBe(editSchema);
    expect(settingsSheet.createInitialDraft).toBe(createInitialDraft);
    expect(settingsSheet.toDraft).toBe(toDraft);
    expect(settingsSheet.apply).toBe(apply);
    expect(settingsSheet.defaultOpenSections).toBe(defaultOpenSections);
    expect(section?.description).toBe(sectionDescription);
    expect(field?.description).toBe(fieldDescription);
    expect(field?.kind === "select" ? field.options : undefined).toBe(selectOptions);
    expect(collection?.schema).toBe(collectionSchema);
    expect(collection?.initialValue).toBe(initialValue);
    expect(collectionField?.kind === "select" ? collectionField.options : undefined).toBe(
      collectionOptions,
    );

    expect(Object.isFrozen(configuration)).toBe(false);
    expect(Object.isFrozen(configuration.sheet)).toBe(false);
    expect(Object.isFrozen(persistedSchema)).toBe(false);
    expect(Object.isFrozen(editSchema)).toBe(false);
    expect(Object.isFrozen(collectionSchema)).toBe(false);
    expect(Object.isFrozen(createInitialDraft)).toBe(false);
    expect(Object.isFrozen(toDraft)).toBe(false);
    expect(Object.isFrozen(apply)).toBe(false);
    expect(Object.isFrozen(defaultOpenSections)).toBe(false);
    expect(Object.isFrozen(selectOptions)).toBe(false);
    expect(Object.isFrozen(collectionOptions)).toBe(false);
    expect(Object.isFrozen(sectionDescription)).toBe(sectionDescriptionWasFrozen);
    expect(Object.isFrozen(fieldDescription)).toBe(fieldDescriptionWasFrozen);
    expect(Object.isFrozen(initialValue)).toBe(false);
  });
});
