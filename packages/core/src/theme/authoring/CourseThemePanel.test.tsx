// @vitest-environment happy-dom

import type { CourseThemeRef, PersistedCourseTheme } from "@scaffold/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import {
  createCourseColourSystemRegistry,
  type CourseColourSystemRegistry,
  type CourseColourSystemRevision,
} from "@/theme/course/colour-systems/registry";
import { SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 } from "@/theme/course/colour-systems/scaffold-indigo/v1";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import {
  createCourseDesignThemeRegistry,
  type CourseDesignThemeRegistry,
  type CourseDesignThemeRevision,
} from "@/theme/course/designs/registry";
import { SCAFFOLD_FLOW_DESIGN_V1 } from "@/theme/course/designs/scaffold-flow/v1/definition";

import { CourseThemePanel } from "./CourseThemePanel";

const editors: Editor[] = [];
const alternateColourSystem = {
  ...SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1,
  id: "scaffold-coral",
  label: "Scaffold Coral",
  description: "A warm complete Course colour system.",
  radix: { ...SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.radix, accentColor: "crimson" },
} satisfies CourseColourSystemRevision;
const alternateDesign = {
  ...SCAFFOLD_FLOW_DESIGN_V1,
  id: "scaffold-editorial",
  label: "Scaffold Editorial",
  description: "An editorial Course design.",
  defaultColourSystem: reference(alternateColourSystem),
  rootClassName: "sc-course-theme-scaffold-editorial-v1",
} satisfies CourseDesignThemeRevision;
const designs = createCourseDesignThemeRegistry([SCAFFOLD_FLOW_DESIGN_V1, alternateDesign]);
const colourSystems = createCourseColourSystemRegistry([
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
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("CourseThemePanel", () => {
  it("retains the theme trigger, tooltip, right sheet, card selectors, and reset footer", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(<PanelHarness editor={editor} />);

    const trigger = screen.getByRole("button", { name: "Open course theme" });
    expect(trigger).toHaveClass("sc-icon-button");
    expect(trigger).toHaveTextContent("");
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Course theme");
    await user.unhover(trigger);
    await user.click(trigger);

    const panel = screen.getByRole("dialog", { name: "Course theme" });
    expect(panel).toHaveTextContent(
      "Choose a complete Course design and colour system for learner-facing content.",
    );
    expect(within(panel).getByRole("button", { name: "Design" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(panel).getByRole("button", { name: "Colour system" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(panel).getByRole("radiogroup", { name: "Course design" })).toHaveClass(
      "sc-settings-card-select",
    );
    expect(within(panel).getByRole("radiogroup", { name: "Course colour system" })).toHaveClass(
      "sc-settings-card-select",
    );
    const reset = within(panel).getByRole("button", { name: "Reset complete theme" });
    expect(reset.closest(".sc-sheet-footer")).not.toBeNull();
    expect(reset.closest(".sc-sheet-body")).toBeNull();
  });

  it("renders exact options from registry labels and descriptions", async () => {
    const user = userEvent.setup();
    render(<PanelHarness editor={createEditor()} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    for (const design of designs.definitions) {
      const option = screen.getByRole("radio", { name: `Use ${design.label} design` });
      expect(option).toHaveTextContent(design.label);
      expect(option).toHaveTextContent(design.description);
    }
    for (const colourSystem of colourSystems.definitions) {
      const option = screen.getByRole("radio", {
        name: `Use ${colourSystem.label} colour system`,
      });
      expect(option).toHaveTextContent(colourSystem.label);
      expect(option).toHaveTextContent(colourSystem.description);
    }
  });

  it("selects a design and adopts its exact default colour system", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const onThemeChange = vi.fn();
    render(<PanelHarness editor={editor} onThemeChange={onThemeChange} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await user.click(screen.getByRole("radio", { name: "Use Scaffold Editorial design" }));

    expect(readTheme(editor)).toEqual({
      schemaVersion: 1,
      design: reference(alternateDesign),
      colourSystem: reference(alternateColourSystem),
      overrides: {},
    });
    expect(onThemeChange).toHaveBeenLastCalledWith(readTheme(editor));
    expect(screen.getByRole("radio", { name: "Use Scaffold Coral colour system" })).toBeChecked();
  });

  it("changes only the exact colour-system reference", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(<PanelHarness editor={editor} />);
    const before = readTheme(editor);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await user.click(screen.getByRole("radio", { name: "Use Scaffold Coral colour system" }));

    expect(readTheme(editor)).toEqual({
      ...before,
      colourSystem: reference(alternateColourSystem),
    });
  });

  it("resets to application defaults without changing course content", async () => {
    const user = userEvent.setup();
    const editor = createEditor({
      schemaVersion: 1,
      design: reference(alternateDesign),
      colourSystem: reference(alternateColourSystem),
      overrides: {},
    });
    const contentBefore = editor.getJSON().content![0]!.content;
    render(<PanelHarness editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await user.click(screen.getByRole("button", { name: "Reset complete theme" }));

    expect(readTheme(editor)).toEqual(createDefaultPersistedCourseTheme());
    expect(editor.getJSON().content![0]!.content).toEqual(contentBefore);
  });

  it("keeps selection and reset in separate undo history groups", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(<PanelHarness editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    await user.click(screen.getByRole("radio", { name: "Use Scaffold Editorial design" }));
    await user.click(screen.getByRole("button", { name: "Reset complete theme" }));

    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).design).toEqual(reference(alternateDesign));
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor)).toEqual(createDefaultPersistedCourseTheme());
  });

  it("reports unavailable references independently and leaves their selectors unselected", async () => {
    const user = userEvent.setup();
    const editor = createEditor({
      schemaVersion: 1,
      design: { id: "missing-design", revision: "7" },
      colourSystem: { id: "missing-colours", revision: "3" },
      overrides: {},
    });
    render(<PanelHarness editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saved design missing-design@7 is unavailable.");
    expect(status).toHaveTextContent("Saved colour system missing-colours@3 is unavailable.");
    expect(
      screen
        .getAllByRole("radio")
        .every((option) => option.getAttribute("data-state") !== "on"),
    ).toBe(true);

    await user.click(screen.getByRole("radio", { name: "Use Scaffold Editorial design" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(readTheme(editor).design).toEqual(reference(alternateDesign));
    expect(readTheme(editor).colourSystem).toEqual(reference(alternateColourSystem));
  });

  it("synchronizes selected cards when the persisted theme prop changes", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const defaults = createDefaultPersistedCourseTheme();
    const view = render(
      <CourseThemePanel
        editor={editor}
        designs={designs}
        colourSystems={colourSystems}
        theme={defaults}
        onThemeChange={() => undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    expect(screen.getByRole("radio", { name: "Use Scaffold Flow design" })).toBeChecked();

    view.rerender(
      <CourseThemePanel
        editor={editor}
        designs={designs}
        colourSystems={colourSystems}
        theme={{
          schemaVersion: 1,
          design: reference(alternateDesign),
          colourSystem: reference(alternateColourSystem),
          overrides: {},
        }}
        onThemeChange={() => undefined}
      />,
    );

    expect(screen.getByRole("radio", { name: "Use Scaffold Editorial design" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Use Scaffold Coral colour system" })).toBeChecked();
  });

  it("restores the saved selection when the document command refuses a write", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    replaceThemeAttr(editor, { malformed: true });
    const onThemeChange = vi.fn();
    render(
      <CourseThemePanel
        editor={editor}
        designs={designs}
        colourSystems={colourSystems}
        theme={createDefaultPersistedCourseTheme()}
        onThemeChange={onThemeChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await user.click(screen.getByRole("radio", { name: "Use Scaffold Editorial design" }));

    expect(screen.getByRole("radio", { name: "Use Scaffold Flow design" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Use Scaffold Editorial design" })).not.toBeChecked();
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(editor.state.doc.firstChild?.attrs["theme"]).toEqual({ malformed: true });
  });

  it("disables theme mutations without a live editor", () => {
    render(
      <CourseThemePanel
        editor={null}
        designs={designs}
        colourSystems={colourSystems}
        theme={createDefaultPersistedCourseTheme()}
        onThemeChange={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Open course theme" })).toBeDisabled();
  });

  it("contains no arbitrary colour or provisional non-colour controls", async () => {
    const user = userEvent.setup();
    render(<PanelHarness editor={createEditor()} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    expect(screen.queryByRole("button", { name: /edit .*current value/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /font/i })).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

function createEditor(theme: PersistedCourseTheme = createDefaultPersistedCourseTheme()): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false }),
      CourseDocumentNode,
      SurfaceNode,
      TestArrangementNode,
      TestRegionNode,
    ],
    content: documentContent(theme),
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
            attrs: { id: "surface-1", variant: "page-default" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Keep me" }] }],
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

function PanelHarness({
  editor,
  designRegistry = designs,
  colourSystemRegistry = colourSystems,
  onThemeChange = () => undefined,
}: {
  editor: Editor;
  designRegistry?: CourseDesignThemeRegistry;
  colourSystemRegistry?: CourseColourSystemRegistry;
  onThemeChange?: (theme: PersistedCourseTheme) => void;
}) {
  const [theme, setTheme] = useState(() => readTheme(editor));
  return (
    <CourseThemePanel
      editor={editor}
      designs={designRegistry}
      colourSystems={colourSystemRegistry}
      theme={theme}
      onThemeChange={(nextTheme) => {
        setTheme(nextTheme);
        onThemeChange(nextTheme);
      }}
    />
  );
}
