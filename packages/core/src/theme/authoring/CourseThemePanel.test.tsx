// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import {
  SCAFFOLD_DEFAULT_PRESET,
  createScaffoldDefaultTheme,
} from "@/theme/model/built-in-presets";
import { createThemeCatalogue, resolveCourseTheme, type ScaffoldColorMode } from "@/theme/model";

import { CourseThemePanel } from "./CourseThemePanel";

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
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("CourseThemePanel", () => {
  it("renders the complete Theme form through one shared accordion path", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(<PanelHarness editor={editor} />);

    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    const panel = screen.getByRole("dialog", { name: "Course theme" });

    for (const section of [
      "Presets",
      "Foundation colours",
      "Creative palette",
      "Links",
      "Typography",
      "Design",
    ]) {
      expect(within(panel).getByRole("button", { name: section })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }

    expect(panel.querySelectorAll(".sc-accordion-trigger")).toHaveLength(6);
    expect(panel.querySelectorAll(".sc-sheet-section")).toHaveLength(0);
    expect(panel.querySelectorAll(".sc-course-theme-colour-accordion")).toHaveLength(0);
    expect(panel.querySelectorAll(".sc-course-theme-preset")).toHaveLength(0);
    expect(panel.querySelectorAll(".sc-course-theme-reset")).toHaveLength(0);
    expect(within(panel).getByRole("radiogroup", { name: "Course theme preset" })).toHaveClass(
      "sc-settings-card-select",
    );
    expect(panel.querySelectorAll(".sc-settings-color-field__trigger")).toHaveLength(11);
    expect(panel.querySelectorAll(".sc-color-picker-control-stack")).toHaveLength(0);
    const backgroundTrigger = within(panel).getByRole("button", {
      name: (name) => name.startsWith("Edit Background, current value "),
    });
    await user.click(backgroundTrigger);
    expect(panel.querySelectorAll(".sc-color-picker-control-stack")).toHaveLength(1);
    await user.click(backgroundTrigger);
    expect(panel.querySelectorAll(".sc-color-picker-control-stack")).toHaveLength(0);
    expect(within(panel).getByRole("combobox", { name: "Heading font" })).toBeInTheDocument();
    expect(within(panel).getByRole("spinbutton", { name: "Roundness" })).toBeInTheDocument();

    expect(screen.queryByRole("heading", { name: "Preview colours" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Course preview colours" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Palette to edit" })).toBeNull();
  });

  it("selects and resets presets through generic cards and actions", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const catalogue = createThemeCatalogue();
    const onThemeChange = vi.fn();
    render(<PanelHarness editor={editor} onThemeChange={onThemeChange} />);

    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    expect(screen.getByRole("dialog", { name: "Course theme" })).toBeInTheDocument();

    for (const preset of catalogue.presets) {
      const option = screen.getByRole("radio", { name: `Use ${preset.label} theme` });
      await user.click(option);
      expect(readTheme(editor).preset.id).toBe(preset.id);
      expect(option).toHaveAttribute("aria-checked", "true");
    }

    const selected = catalogue.presets.at(-1)!;
    const customised = readTheme(editor);
    customised.values!.design.roundness = 0.95;
    act(() => {
      updateCourseTheme(editor, customised);
    });
    const reset = screen.getByRole("button", { name: "Reset complete theme" });
    expect(reset).toHaveClass("sc-button");
    expect(reset.closest(".sc-sheet-footer")).not.toBeNull();
    expect(reset.closest(".sc-sheet-body")).toBeNull();
    await user.click(reset);
    expect(readTheme(editor).values).toEqual(selected.values);
    expect(onThemeChange).toHaveBeenCalled();
  });

  it("keeps preset selection in document history", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const catalogue = createThemeCatalogue();
    const initialPresetId = readTheme(editor).preset.id;
    const nextPreset = catalogue.presets.find((preset) => preset.id !== initialPresetId)!;
    render(<PanelHarness editor={editor} />);

    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    await user.click(screen.getByRole("radio", { name: `Use ${nextPreset.label} theme` }));
    expect(readTheme(editor).preset.id).toBe(nextPreset.id);

    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).preset.id).toBe(initialPresetId);
  });

  it("edits and derives dark colours through generic field metadata and reset behavior", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(<PanelHarness editor={editor} mode="dark" />);

    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    expect(
      screen.getByText("Editing dark colours for the current application mode."),
    ).toBeVisible();
    expect(screen.getAllByText("Automatic", { selector: ".sc-pill" })).toHaveLength(11);

    chooseThemeColour("Primary", "Secondary course primary");
    expect(readTheme(editor).values!.colors.author.dark.sourceBySlot.primary).toBe("custom");
    expect(readTheme(editor).values!.colors.resolved.dark.primary).toBe(
      createThemeCatalogue().defaultPreset.values.colors.author.dark.values.secondary,
    );
    expect(readTheme(editor).values!.colors.resolved.light.primary).not.toBe(
      createThemeCatalogue().defaultPreset.values.colors.author.dark.values.secondary,
    );
    expect(screen.getByText("Custom", { selector: ".sc-pill" })).toBeInTheDocument();

    chooseThemeColour("Secondary", "Accent 1 course secondary");
    expect(readTheme(editor).values!.colors.author.dark.sourceBySlot.secondary).toBe("custom");

    openThemeColourPicker("Primary");
    const useDerived = requiredThemePopoverButton("Use automatic primary colour");
    expect(useDerived).toHaveClass("sc-color-picker-inline-action");
    fireEvent.click(useDerived);

    expect(readTheme(editor).values!.colors.author.dark.sourceBySlot.primary).toBe("derived");
    expect(readTheme(editor).values!.colors.author.dark.sourceBySlot.secondary).toBe("custom");

    const deriveAll = screen.getByRole("button", {
      name: "Use automatic dark colours",
    });
    expect(deriveAll).toHaveClass("sc-button");
    await user.click(deriveAll);

    expect(Object.values(readTheme(editor).values!.colors.author.dark.sourceBySlot)).toEqual(
      Array(11).fill("derived"),
    );
    expect(screen.queryByText("Custom", { selector: ".sc-pill" })).toBeNull();
  });

  it("resets palette sections through generic section actions as one undo step", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(<PanelHarness editor={editor} />);

    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    chooseThemeColour("Primary", "Secondary course primary");
    expect(readTheme(editor).values!.colors.author.light.primary).toBe(
      SCAFFOLD_DEFAULT_PRESET.values.colors.author.light.secondary,
    );

    const resetCreative = screen.getByRole("button", {
      name: "Reset creative palette colours",
    });
    expect(resetCreative).toHaveClass("sc-button");
    await user.click(resetCreative);

    expect(readTheme(editor).values!.colors.author.light.primary).toBe(
      SCAFFOLD_DEFAULT_PRESET.values.colors.author.light.primary,
    );
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).values!.colors.author.light.primary).toBe(
      SCAFFOLD_DEFAULT_PRESET.values.colors.author.light.secondary,
    );
  });

  it("edits typography and design values and resets each section undoably", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(<PanelHarness editor={editor} />);

    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Heading font" }),
      "scaffold-inter",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Body font" }),
      "scaffold-source-serif-4",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Code font" }),
      "scaffold-poppins",
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Heading weight" }), "800");
    await user.selectOptions(screen.getByRole("combobox", { name: "Body weight" }), "700");
    await replaceNumber(user, "Type scale", "1.3");
    await replaceNumber(user, "Body line height", "1.8");
    await replaceNumber(user, "Heading line height", "1.1");
    await replaceNumber(user, "Heading letter spacing", "0.1");
    await user.click(screen.getByRole("checkbox", { name: "Uppercase headings" }));
    await replaceNumber(user, "Roundness", "0.9");
    await replaceNumber(user, "Stroke", "2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Shadow" }), "defined");
    await user.selectOptions(screen.getByRole("combobox", { name: "Density" }), "spacious");

    expect(readTheme(editor).values!.typography).toMatchObject({
      headingFontId: "scaffold-inter",
      bodyFontId: "scaffold-source-serif-4",
      codeFontId: "scaffold-poppins",
      headingWeight: 800,
      bodyWeight: 700,
      typeScale: 1.3,
      bodyLineHeight: 1.8,
      headingLineHeight: 1.1,
      headingLetterSpacing: 0.1,
      uppercaseHeadings: true,
    });
    expect(readTheme(editor).values!.design).toMatchObject({
      roundness: 0.9,
      stroke: 2,
      shadow: "defined",
      density: "spacious",
    });

    const resetTypography = screen.getByRole("button", { name: "Reset course typography" });
    const resetDesign = screen.getByRole("button", { name: "Reset course design" });
    expect(resetTypography).toHaveClass("sc-button");
    expect(resetDesign).toHaveClass("sc-button");

    await user.click(resetTypography);
    expect(readTheme(editor).values!.typography).toEqual(SCAFFOLD_DEFAULT_PRESET.values.typography);
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).values!.typography.uppercaseHeadings).toBe(true);

    await user.click(resetDesign);
    expect(readTheme(editor).values!.design).toEqual(SCAFFOLD_DEFAULT_PRESET.values.design);
    expect(editor.commands.undo()).toBe(true);
    expect(readTheme(editor).values!.design.density).toBe("spacious");
  });

  it("reverts an invalid numeric draft on blur", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(<PanelHarness editor={editor} />);

    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    const roundness = screen.getByRole("spinbutton", { name: "Roundness" });
    const persisted = readTheme(editor).values!.design.roundness;

    await user.clear(roundness);
    await user.type(roundness, "3");
    roundness.blur();

    expect(roundness).toHaveValue(persisted);
    expect(readTheme(editor).values!.design.roundness).toBe(persisted);
  });

  it("preserves an unavailable saved font and exposes generic status metadata", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const theme = readTheme(editor);
    theme.values!.typography.headingFontId = "host-font-missing";
    updateCourseTheme(editor, theme);
    render(<PanelHarness editor={editor} />);

    await user.click(screen.getByRole("button", { name: "Open course theme" }));
    const headingFont = screen.getByRole("combobox", { name: "Heading font" });
    const describedBy = headingFont.getAttribute("aria-describedby")?.split(" ") ?? [];
    const unavailable = screen.getByText("Unavailable", { selector: ".sc-pill" });

    expect(headingFont).toHaveValue("host-font-missing");
    expect(
      within(headingFont).getByRole("option", { name: "Unavailable (host-font-missing)" }),
    ).toBeInTheDocument();
    expect(document.getElementById(describedBy[0] ?? "")).toBe(unavailable);
  });

  it("shows an unavailable saved preset only to the author", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const catalogue = createThemeCatalogue();
    const theme = readTheme(editor);
    theme.preset.id = "host-missing";
    theme.preset.revision = null;
    theme.values = null;
    render(
      <CourseThemePanel
        editor={editor}
        catalogue={catalogue}
        theme={theme}
        resolvedTheme={resolveCourseTheme({ catalogue, mode: "light", theme })}
        onThemeChange={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "The saved theme is unavailable. Scaffold Default is shown instead.",
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

function updateCourseTheme(editor: Editor, theme: ReturnType<typeof readTheme>) {
  const courseDocument = editor.state.doc.firstChild!;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(0, undefined, {
      ...courseDocument.attrs,
      theme,
    }),
  );
}

function openThemeColourPicker(fieldLabel: string): HTMLButtonElement {
  const trigger = screen.getByRole("button", {
    name: (name) => name.startsWith(`Edit ${fieldLabel}, current value `),
  });
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`Expected Theme colour trigger ${fieldLabel}`);
  }
  fireEvent.click(trigger);
  return trigger;
}

function chooseThemeColour(fieldLabel: string, optionLabel: string): void {
  const trigger = openThemeColourPicker(fieldLabel);
  fireEvent.click(requiredThemePopoverButton(optionLabel));
  fireEvent.click(trigger);
}

function requiredThemePopoverButton(name: string): HTMLButtonElement {
  const popover = document.querySelector(".sc-settings-color-field__popover");
  const button = [...(popover?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (candidate) => candidate.getAttribute("aria-label") === name,
  );
  if (!button) throw new Error(`Expected Theme colour popover button ${name}`);
  return button;
}

async function replaceNumber(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  value: string,
) {
  const input = screen.getByRole("spinbutton", { name });
  await user.clear(input);
  await user.type(input, value);
  input.blur();
}

function PanelHarness({
  editor,
  mode = "light",
  onThemeChange = () => undefined,
}: {
  editor: Editor;
  mode?: ScaffoldColorMode;
  onThemeChange?: () => void;
}) {
  const catalogue = createThemeCatalogue();
  const [theme, setTheme] = useState(() => readTheme(editor));
  return (
    <CourseThemePanel
      editor={editor}
      catalogue={catalogue}
      theme={theme}
      resolvedTheme={resolveCourseTheme({ catalogue, mode, theme })}
      onThemeChange={(nextTheme) => {
        setTheme(nextTheme);
        onThemeChange();
      }}
    />
  );
}
