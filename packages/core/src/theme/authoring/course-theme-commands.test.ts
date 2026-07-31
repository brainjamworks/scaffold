// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import {
  SCAFFOLD_DEFAULT_PRESET,
  SCAFFOLD_EDITORIAL_PRESET,
  SCAFFOLD_MINIMAL_PRESET,
  createScaffoldDefaultTheme,
} from "@/theme/model";

import {
  resetCourseTheme,
  resetCourseThemeDarkDerivation,
  resetCourseThemePaletteSection,
  resetCourseThemeSection,
  selectCoursePreset,
  updateCourseTheme,
  updateCourseThemePaletteSlot,
} from "./course-theme-commands";

const editors: Editor[] = [];
const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: "arrangement",
  content: "block+",
});
const TestRegionNode = Node.create({
  name: "testRegion",
  group: "region",
  content: "block+",
});

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("course theme commands", () => {
  it("selects a preset as a complete immutable snapshot", () => {
    const editor = createEditor();

    expect(selectCoursePreset(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);

    expect(readTheme(editor)).toEqual({
      schemaVersion: 1,
      preset: {
        id: SCAFFOLD_EDITORIAL_PRESET.id,
        revision: SCAFFOLD_EDITORIAL_PRESET.revision,
      },
      values: SCAFFOLD_EDITORIAL_PRESET.values,
    });
    expect(readTheme(editor).values).not.toBe(SCAFFOLD_EDITORIAL_PRESET.values);
  });

  it("replaces custom values when switching presets", () => {
    const editor = createEditor();
    const customised = createScaffoldDefaultTheme();
    customised.values!.typography.typeScale = 1.33;
    expect(updateCourseTheme(editor, customised)).toBe(true);

    expect(selectCoursePreset(editor, SCAFFOLD_MINIMAL_PRESET)).toBe(true);

    expect(readTheme(editor).values).toEqual(SCAFFOLD_MINIMAL_PRESET.values);
    expect(readTheme(editor).values!.typography.typeScale).toBe(
      SCAFFOLD_MINIMAL_PRESET.values.typography.typeScale,
    );
  });

  it("resets the complete theme to its selected preset", () => {
    const editor = createEditor();
    expect(selectCoursePreset(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);
    const customised = readTheme(editor);
    customised.values!.design.roundness = 0.9;
    expect(updateCourseTheme(editor, customised)).toBe(true);

    expect(resetCourseTheme(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);

    expect(readTheme(editor).values).toEqual(SCAFFOLD_EDITORIAL_PRESET.values);
  });

  it("participates in normal undo and redo history", () => {
    const editor = createEditor();

    expect(selectCoursePreset(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).preset.id).toBe(SCAFFOLD_DEFAULT_PRESET.id);
    expect(editor.commands.redo()).toBe(true);
    expect(readTheme(editor).preset.id).toBe(SCAFFOLD_EDITORIAL_PRESET.id);
  });

  it("materialises a light author-slot edit and updates only its derived dark slot", () => {
    const editor = createEditor();
    const before = readTheme(editor);
    const statuses = structuredClone(before.values!.colors.resolved.light.success);
    const darkSecondary = before.values!.colors.author.dark.values.secondary;

    expect(
      updateCourseThemePaletteSlot(editor, SCAFFOLD_DEFAULT_PRESET, "light", "primary", "#123456"),
    ).toBe(true);

    const colors = readTheme(editor).values!.colors;
    expect(colors.author.light.primary).toBe("#123456");
    expect(colors.author.dark.values.primary).not.toBe(
      before.values!.colors.author.dark.values.primary,
    );
    expect(colors.author.dark.values.secondary).toBe(darkSecondary);
    expect(colors.resolved.light.primary).toBe("#123456");
    expect(colors.resolved.light.success).toEqual(statuses);
  });

  it("detaches only the edited dark slot from later light derivation", () => {
    const editor = createEditor();
    expect(
      updateCourseThemePaletteSlot(editor, SCAFFOLD_DEFAULT_PRESET, "dark", "primary", "#abcdef"),
    ).toBe(true);
    expect(
      updateCourseThemePaletteSlot(editor, SCAFFOLD_DEFAULT_PRESET, "light", "primary", "#123456"),
    ).toBe(true);
    expect(
      updateCourseThemePaletteSlot(
        editor,
        SCAFFOLD_DEFAULT_PRESET,
        "light",
        "secondary",
        "#fedcba",
      ),
    ).toBe(true);

    const dark = readTheme(editor).values!.colors.author.dark;
    expect(dark.sourceBySlot.primary).toBe("custom");
    expect(dark.values.primary).toBe("#abcdef");
    expect(dark.sourceBySlot.secondary).toBe("derived");
    expect(dark.values.secondary).not.toBe(
      SCAFFOLD_DEFAULT_PRESET.values.colors.author.dark.values.secondary,
    );
  });

  it("restores one or every dark slot to preset derivation", () => {
    const editor = createEditor();
    expect(
      updateCourseThemePaletteSlot(editor, SCAFFOLD_DEFAULT_PRESET, "dark", "primary", "#abcdef"),
    ).toBe(true);
    expect(
      updateCourseThemePaletteSlot(editor, SCAFFOLD_DEFAULT_PRESET, "dark", "secondary", "#fedcba"),
    ).toBe(true);

    expect(resetCourseThemeDarkDerivation(editor, SCAFFOLD_DEFAULT_PRESET, "primary")).toBe(true);
    expect(readTheme(editor).values!.colors.author.dark.sourceBySlot).toMatchObject({
      primary: "derived",
      secondary: "custom",
    });

    expect(resetCourseThemeDarkDerivation(editor, SCAFFOLD_DEFAULT_PRESET)).toBe(true);
    expect(
      new Set(Object.values(readTheme(editor).values!.colors.author.dark.sourceBySlot)),
    ).toEqual(new Set(["derived"]));
  });

  it("preserves deliberately poor author-selected contrast", () => {
    const editor = createEditor();

    expect(
      updateCourseThemePaletteSlot(editor, SCAFFOLD_DEFAULT_PRESET, "light", "primary", "#ffffff"),
    ).toBe(true);

    expect(readTheme(editor).values!.colors.author.light.primary).toBe("#ffffff");
    expect(readTheme(editor).values!.colors.resolved.light.primary).toBe("#ffffff");
  });

  it("resets only colours to the selected preset and remains undoable", () => {
    const editor = createEditor();
    expect(selectCoursePreset(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);
    const customised = readTheme(editor);
    customised.values!.colors.resolved.light.primary = "#123456";
    customised.values!.typography.typeScale = 1.33;
    expect(updateCourseTheme(editor, customised)).toBe(true);

    expect(resetCourseThemeSection(editor, SCAFFOLD_EDITORIAL_PRESET, "colors")).toBe(true);

    expect(readTheme(editor).values!.colors).toEqual(SCAFFOLD_EDITORIAL_PRESET.values.colors);
    expect(readTheme(editor).values!.typography.typeScale).toBe(1.33);
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).values!.colors.resolved.light.primary).toBe("#123456");
  });

  it("resets one author palette section as one undoable materialisation", () => {
    const editor = createEditor();
    expect(
      updateCourseThemePaletteSlot(editor, SCAFFOLD_DEFAULT_PRESET, "light", "primary", "#123456"),
    ).toBe(true);
    expect(
      updateCourseThemePaletteSlot(
        editor,
        SCAFFOLD_DEFAULT_PRESET,
        "light",
        "background",
        "#abcdef",
      ),
    ).toBe(true);

    expect(resetCourseThemePaletteSection(editor, SCAFFOLD_DEFAULT_PRESET, "creative")).toBe(true);

    expect(readTheme(editor).values!.colors.author.light.primary).toBe(
      SCAFFOLD_DEFAULT_PRESET.values.colors.author.light.primary,
    );
    expect(readTheme(editor).values!.colors.author.light.background).toBe("#abcdef");
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).values!.colors.author.light.primary).toBe("#123456");
  });
});

function createEditor(): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false }),
      CourseDocumentNode,
      SurfaceNode,
      TestArrangementNode,
      TestRegionNode,
    ],
    content: documentContent(),
  });
  editors.push(editor);
  return editor;
}

function documentContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page", theme: createScaffoldDefaultTheme() },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-1", variant: "page-default" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function readTheme(editor: Editor) {
  return structuredClone(editor.getJSON().content![0]!.attrs!["theme"]);
}
