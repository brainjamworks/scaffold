// @vitest-environment happy-dom

import type { CourseThemeRef, PersistedCourseTheme } from "@scaffold/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
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
  authorDefaults: {
    ...SCAFFOLD_FLOW_DESIGN_V1.authorDefaults,
    design: {
      roundness: "full",
      stroke: "strong",
      shadow: "soft",
      density: "spacious",
    },
  },
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
    expect(reset.closest(".sc-app-sheet-footer")).not.toBeNull();
    expect(reset.closest(".sc-settings-form__footer-actions")).not.toBeNull();
    expect(reset.closest(".sc-app-sheet-body")).toBeNull();
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
      screen.getAllByRole("radio").every((option) => option.getAttribute("data-state") !== "on"),
    ).toBe(true);

    await user.click(screen.getByRole("radio", { name: "Use Scaffold Editorial design" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(readTheme(editor).design).toEqual(reference(alternateDesign));
    expect(readTheme(editor).colourSystem).toEqual(reference(alternateColourSystem));
  });

  it("shows the four effective inherited Design overrides after the complete design selector", async () => {
    const user = userEvent.setup();
    render(<PanelHarness editor={createEditor()} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    const panel = screen.getByRole("dialog", { name: "Course theme" });
    const design = within(panel).getByRole("region", { name: "Design" });
    const selector = within(design).getByRole("radiogroup", { name: "Course design" });
    const roundness = within(design).getByRole("combobox", { name: "Roundness" });
    expect(
      selector.compareDocumentPosition(roundness) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(roundness).toHaveTextContent("Rounded");
    expect(within(design).getByRole("combobox", { name: "Stroke" })).toHaveTextContent("Standard");
    expect(within(design).getByRole("combobox", { name: "Shadow" })).toHaveTextContent("None");
    expect(within(design).getByRole("combobox", { name: "Density" })).toHaveTextContent(
      "Comfortable",
    );
    expect(within(design).getAllByText("Inherited")).toHaveLength(4);
    expect(within(design).getAllByRole("button", { name: /^Use inherited / })).toHaveLength(4);
    expect(
      within(design).getByRole("button", { name: "Reset all Design overrides" }),
    ).toBeDisabled();
  });

  it("writes each Design override immediately as semantic intent", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const onThemeChange = vi.fn();
    render(<PanelHarness editor={editor} onThemeChange={onThemeChange} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await chooseSelectOption(user, "Roundness", "Square");
    await chooseSelectOption(user, "Stroke", "Strong");
    await chooseSelectOption(user, "Shadow", "Defined");
    await chooseSelectOption(user, "Density", "Spacious");

    expect(readTheme(editor).overrides).toEqual({
      design: { roundness: "square", stroke: "strong", shadow: "defined", density: "spacious" },
    });
    expect(onThemeChange).toHaveBeenLastCalledWith(readTheme(editor));
    expect(
      within(screen.getByRole("region", { name: "Design" })).getAllByText("Custom"),
    ).toHaveLength(4);
  });

  it("individually resets each sparse Design override", async () => {
    const user = userEvent.setup();
    const editor = createEditor({
      ...createDefaultPersistedCourseTheme(),
      overrides: {
        typography: { courseTextSize: "larger" },
        design: { roundness: "square", stroke: "strong", shadow: "defined", density: "spacious" },
      },
    });
    render(<PanelHarness editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await user.click(screen.getByRole("button", { name: "Use inherited roundness" }));
    expect(readTheme(editor).overrides.design).toEqual({
      stroke: "strong",
      shadow: "defined",
      density: "spacious",
    });
    await user.click(screen.getByRole("button", { name: "Use inherited stroke" }));
    await user.click(screen.getByRole("button", { name: "Use inherited shadow" }));
    await user.click(screen.getByRole("button", { name: "Use inherited density" }));

    expect(readTheme(editor).overrides).toEqual({ typography: { courseTextSize: "larger" } });
    expect(screen.getByRole("combobox", { name: "Roundness" })).toHaveTextContent("Rounded");
  });

  it("resets only Design overrides through the Design section action", async () => {
    const user = userEvent.setup();
    const initialTheme: PersistedCourseTheme = {
      schemaVersion: 1,
      design: reference(SCAFFOLD_FLOW_DESIGN_V1),
      colourSystem: reference(alternateColourSystem),
      overrides: {
        typography: { courseTextSize: "larger", uppercaseHeadings: true },
        design: { roundness: "square", density: "spacious" },
      },
    };
    const editor = createEditor(initialTheme);
    const onThemeChange = vi.fn();
    render(<PanelHarness editor={editor} onThemeChange={onThemeChange} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    const reset = screen.getByRole("button", { name: "Reset all Design overrides" });
    expect(reset).toHaveTextContent("Reset Design overrides");
    expect(reset.closest(".sc-settings-form__section-actions")).not.toBeNull();
    expect(reset.closest(".sc-app-sheet-footer")).toBeNull();
    await user.click(reset);

    expect(readTheme(editor)).toEqual({
      ...initialTheme,
      overrides: { typography: initialTheme.overrides.typography },
    });
    expect(onThemeChange).toHaveBeenLastCalledWith(readTheme(editor));
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor)).toEqual(initialTheme);
  });

  it("re-normalizes and resynchronizes Design overrides when selecting a complete design", async () => {
    const user = userEvent.setup();
    const editor = createEditor({
      ...createDefaultPersistedCourseTheme(),
      overrides: {
        typography: { courseTextSize: "larger" },
        design: { roundness: "full", stroke: "light" },
      },
    });
    const onTransaction = vi.fn();
    editor.on("transaction", onTransaction);
    render(<PanelHarness editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await user.click(screen.getByRole("radio", { name: "Use Scaffold Editorial design" }));

    expect(onTransaction).toHaveBeenCalledTimes(1);
    expect(readTheme(editor)).toEqual({
      schemaVersion: 1,
      design: reference(alternateDesign),
      colourSystem: reference(alternateColourSystem),
      overrides: {
        typography: { courseTextSize: "larger" },
        design: { stroke: "light" },
      },
    });
    expect(screen.getByRole("combobox", { name: "Roundness" })).toHaveTextContent("Full");
    expect(screen.getByRole("button", { name: "Use inherited roundness" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Stroke" })).toHaveTextContent("Light");
    expect(screen.getByRole("button", { name: "Use inherited stroke" })).toBeEnabled();
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

  it("shows effective inherited typography values from registered options", async () => {
    const user = userEvent.setup();
    render(<PanelHarness editor={createEditor()} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    const panel = screen.getByRole("dialog", { name: "Course theme" });
    const typography = within(panel).getByRole("region", { name: "Typography" });
    expect(within(typography).getByRole("combobox", { name: "Body font" })).toHaveTextContent(
      "Satoshi",
    );
    expect(within(typography).getByRole("combobox", { name: "Heading font" })).toHaveTextContent(
      "Satoshi",
    );
    expect(within(typography).getByRole("combobox", { name: "Code font" })).toHaveTextContent(
      "JetBrains Mono",
    );
    expect(within(typography).getByRole("combobox", { name: "Body weight" })).toHaveTextContent(
      "400",
    );
    expect(within(typography).getByRole("combobox", { name: "Heading weight" })).toHaveTextContent(
      "600",
    );
    expect(
      within(typography).getByRole("combobox", { name: "Course text size" }),
    ).toHaveTextContent("Standard");
    expect(
      within(typography).getByRole("combobox", { name: "Body line spacing" }),
    ).toHaveTextContent("Standard");
    expect(
      within(typography).getByRole("combobox", { name: "Heading line spacing" }),
    ).toHaveTextContent("Standard");
    expect(
      within(typography).getByRole("combobox", { name: "Heading letter spacing" }),
    ).toHaveTextContent("Standard");
    expect(
      within(typography).getByRole("checkbox", { name: "Uppercase headings" }),
    ).not.toBeChecked();
    expect(within(typography).getAllByText("Inherited")).toHaveLength(10);
    expect(within(typography).getAllByRole("button", { name: /^Use inherited / })).toHaveLength(10);
    for (const reset of within(typography).getAllByRole("button", { name: /^Use inherited / })) {
      expect(reset).toBeDisabled();
    }
    expect(
      within(typography).getByRole("button", { name: "Reset all typography overrides" }),
    ).toBeDisabled();

    const bodyFont = within(typography).getByRole("combobox", { name: "Body font" });
    await user.click(bodyFont);
    expect(screen.queryByRole("option", { name: "JetBrains Mono" })).toBeNull();
    await user.keyboard("{Escape}");
    const codeFont = within(typography).getByRole("combobox", { name: "Code font" });
    await user.click(codeFont);
    expect(screen.queryByRole("option", { name: "Satoshi" })).toBeNull();
    await user.keyboard("{Escape}");
    expect(within(typography).queryByRole("button", { name: /apply|save/i })).toBeNull();
  });

  it("writes each typography choice immediately and reports the live theme", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const onThemeChange = vi.fn();
    render(<PanelHarness editor={editor} onThemeChange={onThemeChange} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await chooseSelectOption(user, "Body font", "Poppins");
    await chooseSelectOption(user, "Heading font", "Source Serif 4");
    await chooseSelectOption(user, "Body weight", "500");
    await chooseSelectOption(user, "Heading weight", "700");
    await chooseSelectOption(user, "Course text size", "Larger");
    await chooseSelectOption(user, "Body line spacing", "Relaxed");
    await chooseSelectOption(user, "Heading line spacing", "Tight");
    await chooseSelectOption(user, "Heading letter spacing", "Wide");
    await user.click(screen.getByRole("checkbox", { name: "Uppercase headings" }));

    expect(readTheme(editor).overrides).toEqual({
      typography: {
        defaultFontId: "scaffold-poppins",
        headingFontId: "scaffold-source-serif-4",
        bodyWeight: 500,
        headingWeight: 700,
        courseTextSize: "larger",
        bodyLineSpacing: "relaxed",
        headingLineSpacing: "tight",
        headingLetterSpacing: "wide",
        uppercaseHeadings: true,
      },
    });
    expect(onThemeChange).toHaveBeenLastCalledWith(readTheme(editor));
    expect(screen.getAllByText("Custom")).toHaveLength(9);
  });

  it("resets only its associated sparse typography field", async () => {
    const user = userEvent.setup();
    const editor = createEditor({
      ...createDefaultPersistedCourseTheme(),
      overrides: {
        typography: {
          defaultFontId: "scaffold-poppins",
          headingFontId: "scaffold-source-serif-4",
          bodyWeight: 500,
        },
      },
    });
    render(<PanelHarness editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await user.click(screen.getByRole("button", { name: "Use inherited body font" }));

    expect(readTheme(editor).overrides).toEqual({
      typography: { headingFontId: "scaffold-source-serif-4", bodyWeight: 500 },
    });
    expect(screen.getByRole("combobox", { name: "Body font" })).toHaveTextContent("Satoshi");
    expect(screen.getByRole("button", { name: "Use inherited body font" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use inherited heading font" })).toBeEnabled();
  });

  it("individually resets each semantic typography field", async () => {
    const user = userEvent.setup();
    const editor = createEditor({
      ...createDefaultPersistedCourseTheme(),
      overrides: {
        typography: {
          courseTextSize: "larger",
          bodyLineSpacing: "relaxed",
          headingLineSpacing: "tight",
          headingLetterSpacing: "wide",
          uppercaseHeadings: true,
        },
      },
    });
    render(<PanelHarness editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    await user.click(screen.getByRole("button", { name: "Use inherited course text size" }));
    expect(readTheme(editor).overrides.typography).toEqual({
      bodyLineSpacing: "relaxed",
      headingLineSpacing: "tight",
      headingLetterSpacing: "wide",
      uppercaseHeadings: true,
    });
    await user.click(screen.getByRole("button", { name: "Use inherited body line spacing" }));
    await user.click(screen.getByRole("button", { name: "Use inherited heading line spacing" }));
    await user.click(screen.getByRole("button", { name: "Use inherited heading letter spacing" }));
    await user.click(screen.getByRole("button", { name: "Use inherited uppercase headings" }));

    expect(readTheme(editor).overrides).toEqual({});
    expect(screen.getByRole("combobox", { name: "Course text size" })).toHaveTextContent(
      "Standard",
    );
    expect(screen.getByRole("checkbox", { name: "Uppercase headings" })).not.toBeChecked();
  });

  it("resets the Typography section while preserving unrelated theme intent", async () => {
    const user = userEvent.setup();
    const initialTheme: PersistedCourseTheme = {
      schemaVersion: 1,
      design: reference(SCAFFOLD_FLOW_DESIGN_V1),
      colourSystem: reference(alternateColourSystem),
      overrides: {
        typography: { defaultFontId: "scaffold-poppins", courseTextSize: "larger" },
        design: { density: "compact" },
      },
    };
    const editor = createEditor(initialTheme);
    const onThemeChange = vi.fn();
    render(<PanelHarness editor={editor} onThemeChange={onThemeChange} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    const reset = screen.getByRole("button", { name: "Reset all typography overrides" });
    expect(reset.closest(".sc-settings-form__section-actions")).not.toBeNull();
    expect(reset.closest(".sc-app-sheet-footer")).toBeNull();
    await user.click(reset);

    expect(readTheme(editor)).toEqual({
      ...initialTheme,
      overrides: { design: { density: "compact" } },
    });
    expect(onThemeChange).toHaveBeenLastCalledWith(readTheme(editor));
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor)).toEqual(initialTheme);
  });

  it("resynchronizes external typography values without dispatching a transaction", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const onTransaction = vi.fn();
    editor.on("transaction", onTransaction);
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

    const externalTheme: PersistedCourseTheme = {
      ...defaults,
      overrides: {
        typography: {
          defaultFontId: "scaffold-poppins",
          headingWeight: 700,
          courseTextSize: "larger",
          bodyLineSpacing: "relaxed",
          headingLineSpacing: "tight",
          headingLetterSpacing: "wide",
          uppercaseHeadings: true,
        },
        design: {
          roundness: "square",
          stroke: "strong",
          shadow: "defined",
          density: "spacious",
        },
      },
    };
    replaceThemeAttr(editor, externalTheme);
    expect(onTransaction).toHaveBeenCalledTimes(1);
    onTransaction.mockClear();

    view.rerender(
      <CourseThemePanel
        editor={editor}
        designs={designs}
        colourSystems={colourSystems}
        theme={externalTheme}
        onThemeChange={() => undefined}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Body font" })).toHaveTextContent("Poppins");
    expect(screen.getByRole("combobox", { name: "Heading weight" })).toHaveTextContent("700");
    expect(screen.getByRole("combobox", { name: "Course text size" })).toHaveTextContent("Larger");
    expect(screen.getByRole("combobox", { name: "Body line spacing" })).toHaveTextContent(
      "Relaxed",
    );
    expect(screen.getByRole("combobox", { name: "Heading line spacing" })).toHaveTextContent(
      "Tight",
    );
    expect(screen.getByRole("combobox", { name: "Heading letter spacing" })).toHaveTextContent(
      "Wide",
    );
    expect(screen.getByRole("checkbox", { name: "Uppercase headings" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Roundness" })).toHaveTextContent("Square");
    expect(screen.getByRole("combobox", { name: "Stroke" })).toHaveTextContent("Strong");
    expect(screen.getByRole("combobox", { name: "Shadow" })).toHaveTextContent("Defined");
    expect(screen.getByRole("combobox", { name: "Density" })).toHaveTextContent("Spacious");
    expect(onTransaction).not.toHaveBeenCalled();
  });

  it("contains exactly the fourteen approved non-colour controls and no arbitrary colour", async () => {
    const user = userEvent.setup();
    render(<PanelHarness editor={createEditor()} />);
    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    expect(screen.queryByRole("button", { name: /edit .*current value/i })).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Uppercase headings" })).not.toBeChecked();
    expect(screen.getAllByRole("combobox")).toHaveLength(13);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /apply|save/i })).toBeNull();
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

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
): Promise<void> {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
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
