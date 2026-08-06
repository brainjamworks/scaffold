// @vitest-environment happy-dom

import type { CourseThemeRef, PersistedCourseTheme } from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import {
  createCourseColourSystemRegistry,
  type CourseColourSystemRevision,
} from "@/theme/course/colour-systems/registry";
import { SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 } from "@/theme/course/colour-systems/scaffold-indigo/v1";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import {
  createCourseDesignThemeRegistry,
  type CourseDesignThemeRevision,
} from "@/theme/course/designs/registry";
import { SCAFFOLD_FLOW_DESIGN_V1 } from "@/theme/course/designs/scaffold-flow/v1/definition";

import {
  resetCourseTheme,
  resetCourseThemeOverride,
  resetCourseThemeOverrideSection,
  selectCourseColourSystem,
  selectCourseDesign,
  setCourseDesignOverride,
  setCourseTypographyOverride,
} from "./course-theme-commands";

const editors: Editor[] = [];
const alternateColourSystem = {
  ...SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1,
  id: "scaffold-coral",
  label: "Scaffold Coral",
  radix: { ...SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.radix, accentColor: "crimson" },
} satisfies CourseColourSystemRevision;
const alternateDesign = {
  ...SCAFFOLD_FLOW_DESIGN_V1,
  id: "scaffold-editorial",
  label: "Scaffold Editorial",
  defaultColourSystem: { id: alternateColourSystem.id, revision: alternateColourSystem.revision },
  authorDefaults: {
    typography: {
      ...SCAFFOLD_FLOW_DESIGN_V1.authorDefaults.typography,
      defaultFontId: "scaffold-poppins",
      headingFontId: "scaffold-source-serif-4",
      bodyWeight: 500,
      headingWeight: 700,
      courseTextSize: "larger",
      uppercaseHeadings: true,
    },
    design: {
      ...SCAFFOLD_FLOW_DESIGN_V1.authorDefaults.design,
      roundness: "full",
      density: "spacious",
    },
  },
  rootClassName: "sc-course-theme-scaffold-editorial-v1",
} satisfies CourseDesignThemeRevision;
const designRegistry = createCourseDesignThemeRegistry([SCAFFOLD_FLOW_DESIGN_V1, alternateDesign]);
const colourSystemRegistry = createCourseColourSystemRegistry([
  SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1,
  alternateColourSystem,
]);
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
  it("sets and replaces sparse group fields while preserving unrelated intent", () => {
    const editor = createEditor(
      themeWithOverrides({
        typography: { bodyLineSpacing: "relaxed" },
        design: { stroke: "strong" },
      }),
    );

    expect(setCourseTypographyOverride(editor, "headingWeight", 800, designRegistry)).toBe(true);
    expect(setCourseTypographyOverride(editor, "headingWeight", 700, designRegistry)).toBe(true);
    expect(setCourseDesignOverride(editor, "density", "compact", designRegistry)).toBe(true);

    expect(readTheme(editor).overrides).toEqual({
      typography: { bodyLineSpacing: "relaxed", headingWeight: 700 },
      design: { stroke: "strong", density: "compact" },
    });
  });

  it("normalizes a selected design default back to inherited state", () => {
    const editor = createEditor(
      themeWithOverrides({
        typography: { headingWeight: 800 },
        design: { density: "compact" },
      }),
    );

    expect(setCourseTypographyOverride(editor, "headingWeight", 600, designRegistry)).toBe(true);

    expect(readTheme(editor).overrides).toEqual({ design: { density: "compact" } });
  });

  it("resets one field and removes its empty nested section", () => {
    const editor = createEditor(
      themeWithOverrides({
        typography: { uppercaseHeadings: true },
        design: { density: "compact" },
      }),
    );

    expect(
      resetCourseThemeOverride(editor, "typography", "uppercaseHeadings", designRegistry),
    ).toBe(true);
    expect(readTheme(editor).overrides).toEqual({ design: { density: "compact" } });
  });

  it("resets only the selected override section", () => {
    const editor = createEditor(
      themeWithOverrides({
        typography: { headingWeight: 800 },
        design: { density: "compact", shadow: "soft" },
      }),
    );

    expect(resetCourseThemeOverrideSection(editor, "design", designRegistry)).toBe(true);
    expect(readTheme(editor).overrides).toEqual({ typography: { headingWeight: 800 } });
  });

  it("keeps field set and reset actions in undo and redo history", () => {
    const editor = createEditor(themeWithOverrides({ design: { density: "spacious" } }));

    expect(setCourseDesignOverride(editor, "density", "compact", designRegistry)).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).overrides).toEqual({ design: { density: "spacious" } });
    expect(editor.commands.redo()).toBe(true);
    expect(readTheme(editor).overrides).toEqual({ design: { density: "compact" } });

    expect(resetCourseThemeOverride(editor, "design", "density", designRegistry)).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).overrides).toEqual({ design: { density: "compact" } });
    expect(editor.commands.redo()).toBe(true);
    expect(readTheme(editor).overrides).toEqual({});
  });

  it("rejects invalid fields, values, font roles, and unavailable selected designs", () => {
    const editor = createEditor();
    const before = editor.getJSON();
    const missingDesignRegistry = createCourseDesignThemeRegistry([alternateDesign]);

    expect(
      Reflect.apply(setCourseTypographyOverride, undefined, [
        editor,
        "fontSize",
        "giant",
        designRegistry,
      ]),
    ).toBe(false);
    expect(
      Reflect.apply(setCourseDesignOverride, undefined, [
        editor,
        "density",
        "cramped",
        designRegistry,
      ]),
    ).toBe(false);
    expect(
      setCourseTypographyOverride(
        editor,
        "defaultFontId",
        "scaffold-jetbrains-mono",
        designRegistry,
      ),
    ).toBe(false);
    expect(setCourseDesignOverride(editor, "density", "compact", missingDesignRegistry)).toBe(
      false,
    );
    expect(
      Reflect.apply(resetCourseThemeOverride, undefined, [
        editor,
        "typography",
        "fontSize",
        designRegistry,
      ]),
    ).toBe(false);
    expect(
      Reflect.apply(resetCourseThemeOverrideSection, undefined, [editor, "colors", designRegistry]),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("persists an exact design and its default colour-system reference", () => {
    const editor = createEditor();

    expect(
      selectCourseDesign(editor, reference(alternateDesign), designRegistry, colourSystemRegistry),
    ).toBe(true);

    expect(readTheme(editor)).toEqual({
      schemaVersion: 1,
      design: reference(alternateDesign),
      colourSystem: reference(alternateColourSystem),
      overrides: {},
    });
  });

  it("preserves valid author intent and re-normalizes it against the target design", () => {
    const editor = createEditor(
      themeWithOverrides({
        typography: {
          defaultFontId: "scaffold-poppins",
          headingWeight: 700,
          bodyLineSpacing: "relaxed",
        },
        design: { roundness: "full", density: "compact" },
      }),
    );

    expect(
      selectCourseDesign(editor, reference(alternateDesign), designRegistry, colourSystemRegistry),
    ).toBe(true);

    expect(readTheme(editor)).toEqual({
      schemaVersion: 1,
      design: reference(alternateDesign),
      colourSystem: reference(alternateColourSystem),
      overrides: {
        typography: { bodyLineSpacing: "relaxed" },
        design: { density: "compact" },
      },
    });
  });

  it("refuses a design whose default colour system is not registered", () => {
    const editor = createEditor();
    const before = editor.getJSON();
    const missingDefaultDesign = {
      ...alternateDesign,
      defaultColourSystem: { id: "missing-colours", revision: "1" },
    } satisfies CourseDesignThemeRevision;
    const registry = createCourseDesignThemeRegistry([missingDefaultDesign]);

    expect(
      selectCourseDesign(editor, reference(missingDefaultDesign), registry, colourSystemRegistry),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("changes only the exact colour-system reference", () => {
    const editor = createEditor(
      themeWithOverrides({
        typography: { headingWeight: 800 },
        design: { density: "compact" },
      }),
    );
    const before = readTheme(editor);

    expect(
      selectCourseColourSystem(editor, reference(alternateColourSystem), colourSystemRegistry),
    ).toBe(true);

    expect(readTheme(editor)).toEqual({
      ...before,
      colourSystem: reference(alternateColourSystem),
    });
  });

  it("rejects selection when preserved author intent is invalid", () => {
    const invalidFontTheme = themeWithOverrides({
      typography: { defaultFontId: "missing-font" },
    });
    const designEditor = createEditor(invalidFontTheme);
    const colourEditor = createEditor(invalidFontTheme);
    const designBefore = designEditor.getJSON();
    const colourBefore = colourEditor.getJSON();

    expect(
      selectCourseDesign(
        designEditor,
        reference(alternateDesign),
        designRegistry,
        colourSystemRegistry,
      ),
    ).toBe(false);
    expect(
      selectCourseColourSystem(
        colourEditor,
        reference(alternateColourSystem),
        colourSystemRegistry,
      ),
    ).toBe(false);
    expect(designEditor.getJSON()).toEqual(designBefore);
    expect(colourEditor.getJSON()).toEqual(colourBefore);
  });

  it("refuses unknown exact references without changing the document", () => {
    const editor = createEditor();
    const before = editor.getJSON();
    const unknown = { id: "missing", revision: "1" };

    expect(selectCourseDesign(editor, unknown, designRegistry, colourSystemRegistry)).toBe(false);
    expect(selectCourseColourSystem(editor, unknown, colourSystemRegistry)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("refuses to update a malformed persisted theme", () => {
    const editor = createEditor();
    replaceThemeAttr(editor, {
      schemaVersion: 1,
      design: reference(SCAFFOLD_FLOW_DESIGN_V1),
      colourSystem: reference(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1),
      overrides: { unsupported: true },
    });
    const before = editor.getJSON();

    expect(
      selectCourseDesign(editor, reference(alternateDesign), designRegistry, colourSystemRegistry),
    ).toBe(false);
    expect(
      selectCourseColourSystem(editor, reference(alternateColourSystem), colourSystemRegistry),
    ).toBe(false);
    expect(setCourseTypographyOverride(editor, "headingWeight", 800, designRegistry)).toBe(false);
    expect(setCourseDesignOverride(editor, "density", "compact", designRegistry)).toBe(false);
    expect(resetCourseThemeOverride(editor, "typography", "headingWeight", designRegistry)).toBe(
      false,
    );
    expect(resetCourseThemeOverrideSection(editor, "typography", designRegistry)).toBe(false);
    expect(resetCourseTheme(editor)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("refuses to update a document with the wrong root node", () => {
    const editor = createWrongRootEditor();
    const before = editor.getJSON();

    expect(
      selectCourseDesign(editor, reference(alternateDesign), designRegistry, colourSystemRegistry),
    ).toBe(false);
    expect(
      selectCourseColourSystem(editor, reference(alternateColourSystem), colourSystemRegistry),
    ).toBe(false);
    expect(setCourseTypographyOverride(editor, "headingWeight", 800, designRegistry)).toBe(false);
    expect(setCourseDesignOverride(editor, "density", "compact", designRegistry)).toBe(false);
    expect(resetCourseThemeOverride(editor, "typography", "headingWeight", designRegistry)).toBe(
      false,
    );
    expect(resetCourseThemeOverrideSection(editor, "typography", designRegistry)).toBe(false);
    expect(resetCourseTheme(editor)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("keeps ordinary selections in undo and redo history", () => {
    const designEditor = createEditor();
    const colourEditor = createEditor();

    expect(
      selectCourseDesign(
        designEditor,
        reference(alternateDesign),
        designRegistry,
        colourSystemRegistry,
      ),
    ).toBe(true);
    expect(designEditor.commands.undo()).toBe(true);
    expect(readTheme(designEditor)).toEqual(createDefaultPersistedCourseTheme());
    expect(designEditor.commands.redo()).toBe(true);
    expect(readTheme(designEditor).design).toEqual(reference(alternateDesign));

    expect(
      selectCourseColourSystem(
        colourEditor,
        reference(alternateColourSystem),
        colourSystemRegistry,
      ),
    ).toBe(true);
    expect(colourEditor.commands.undo()).toBe(true);
    expect(readTheme(colourEditor)).toEqual(createDefaultPersistedCourseTheme());
    expect(colourEditor.commands.redo()).toBe(true);
    expect(readTheme(colourEditor).colourSystem).toEqual(reference(alternateColourSystem));
  });

  it("resets to application defaults in a fresh history group", () => {
    const editor = createEditor();
    expect(
      selectCourseDesign(editor, reference(alternateDesign), designRegistry, colourSystemRegistry),
    ).toBe(true);

    expect(resetCourseTheme(editor)).toBe(true);
    expect(readTheme(editor)).toEqual(createDefaultPersistedCourseTheme());
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor)).toEqual({
      schemaVersion: 1,
      design: reference(alternateDesign),
      colourSystem: reference(alternateColourSystem),
      overrides: {},
    });
  });

  it("does not copy design or colour-system definitions into the document", () => {
    const editor = createEditor();

    expect(
      selectCourseDesign(editor, reference(alternateDesign), designRegistry, colourSystemRegistry),
    ).toBe(true);
    expect(
      selectCourseColourSystem(editor, reference(alternateColourSystem), colourSystemRegistry),
    ).toBe(true);

    expect(JSON.stringify(readTheme(editor))).not.toMatch(
      /label|description|radix|typography|semantics|rootClassName/,
    );
  });
});

function createEditor(theme: PersistedCourseTheme = createDefaultPersistedCourseTheme()): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false }),
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      TestArrangementNode,
      TestRegionNode,
    ],
    content: documentContent(theme),
  });
  editors.push(editor);
  return editor;
}

function createWrongRootEditor(): Editor {
  const WrongRootDocumentNode = Node.create({
    name: "doc",
    topNode: true,
    content: "block+",
  });
  const editor = new Editor({
    extensions: [WrongRootDocumentNode, StarterKit.configure({ document: false })],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  editors.push(editor);
  return editor;
}

function documentContent(theme: PersistedCourseTheme): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page", theme },
        content: [
          {
            type: "surface",
            attrs: { id: "surface00001", variant: "page-default" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function reference(definition: { id: string; revision: string }): CourseThemeRef {
  return { id: definition.id, revision: definition.revision };
}

function readTheme(editor: Editor): PersistedCourseTheme {
  return structuredClone(editor.getJSON().content![0]!.attrs!["theme"]);
}

function replaceThemeAttr(editor: Editor, theme: unknown): void {
  const courseDocument = editor.state.doc.firstChild!;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(0, undefined, {
      ...courseDocument.attrs,
      theme,
    }),
  );
}

function themeWithOverrides(overrides: PersistedCourseTheme["overrides"]): PersistedCourseTheme {
  return { ...createDefaultPersistedCourseTheme(), overrides };
}
