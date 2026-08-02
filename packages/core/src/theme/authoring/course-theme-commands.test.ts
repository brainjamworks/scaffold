// @vitest-environment happy-dom

import type { CourseThemeRef, PersistedCourseTheme } from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
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
  selectCourseColourSystem,
  selectCourseDesign,
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
  rootClassName: "sc-course-theme-scaffold-editorial-v1",
} satisfies CourseDesignThemeRevision;
const designRegistry = createCourseDesignThemeRegistry([
  SCAFFOLD_FLOW_DESIGN_V1,
  alternateDesign,
]);
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
  it("persists an exact design and its default colour-system reference", () => {
    const editor = createEditor();

    expect(selectCourseDesign(editor, reference(alternateDesign), designRegistry)).toBe(true);

    expect(readTheme(editor)).toEqual({
      schemaVersion: 1,
      design: reference(alternateDesign),
      colourSystem: reference(alternateColourSystem),
      overrides: {},
    });
  });

  it("changes only the exact colour-system reference", () => {
    const editor = createEditor();
    const before = readTheme(editor);

    expect(
      selectCourseColourSystem(
        editor,
        reference(alternateColourSystem),
        colourSystemRegistry,
      ),
    ).toBe(true);

    expect(readTheme(editor)).toEqual({
      ...before,
      colourSystem: reference(alternateColourSystem),
    });
  });

  it("refuses unknown exact references without changing the document", () => {
    const editor = createEditor();
    const before = editor.getJSON();
    const unknown = { id: "missing", revision: "1" };

    expect(selectCourseDesign(editor, unknown, designRegistry)).toBe(false);
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

    expect(selectCourseDesign(editor, reference(alternateDesign), designRegistry)).toBe(false);
    expect(
      selectCourseColourSystem(
        editor,
        reference(alternateColourSystem),
        colourSystemRegistry,
      ),
    ).toBe(false);
    expect(resetCourseTheme(editor)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("refuses to update a document with the wrong root node", () => {
    const editor = createWrongRootEditor();
    const before = editor.getJSON();

    expect(selectCourseDesign(editor, reference(alternateDesign), designRegistry)).toBe(false);
    expect(
      selectCourseColourSystem(
        editor,
        reference(alternateColourSystem),
        colourSystemRegistry,
      ),
    ).toBe(false);
    expect(resetCourseTheme(editor)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("keeps ordinary selection in undo and redo history", () => {
    const editor = createEditor();

    expect(selectCourseDesign(editor, reference(alternateDesign), designRegistry)).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor)).toEqual(createDefaultPersistedCourseTheme());
    expect(editor.commands.redo()).toBe(true);
    expect(readTheme(editor).design).toEqual(reference(alternateDesign));
  });

  it("resets to application defaults in a fresh history group", () => {
    const editor = createEditor();
    expect(selectCourseDesign(editor, reference(alternateDesign), designRegistry)).toBe(true);

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

    expect(selectCourseDesign(editor, reference(alternateDesign), designRegistry)).toBe(true);
    expect(
      selectCourseColourSystem(
        editor,
        reference(alternateColourSystem),
        colourSystemRegistry,
      ),
    ).toBe(true);

    expect(JSON.stringify(readTheme(editor))).not.toMatch(
      /label|description|radix|typography|semantics|rootClassName/,
    );
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

function documentContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page", theme: createDefaultPersistedCourseTheme() },
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
