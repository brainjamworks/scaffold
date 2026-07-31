// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import * as Y from "yjs";
import { describe, expect, it } from "vite-plus/test";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";

import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import { initializeCourseDocumentFragment } from "@/document/model/initialize-document";
import { createScaffoldDocumentContent } from "@/format/artifact";
import {
  resetCourseTheme,
  resetCourseThemeSection,
  selectCoursePreset,
  updateCourseTheme,
} from "@/theme/authoring";
import { updateCourseThemePaletteSlot } from "@/theme/authoring/course-theme-commands";
import { SCAFFOLD_DEFAULT_PRESET, SCAFFOLD_EDITORIAL_PRESET } from "@/theme/model";

import { createAuthoringEditorCollaborationSetup } from "./authoring-collaboration";

describe("authoring collaboration setup", () => {
  it("creates collaboration mapping only for valid authoritative content", () => {
    const document = new Y.Doc();
    initializeCourseDocumentFragment(document, { mode: "page" });

    const result = createAuthoringEditorCollaborationSetup({ document, editable: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected valid authoring setup");
    expect(result.content).toMatchObject({ type: "doc" });
    expect(result.extensions.length).toBeGreaterThan(0);
  });

  it("returns invalid without mutating or partially setting up an invalid Y.Doc", () => {
    const document = new Y.Doc();
    const invalid = createScaffoldDocumentContent({ mode: "page" });
    const surface = invalid.content?.[0]?.content?.[0];
    if (!surface) throw new Error("missing invalid fixture surface");
    surface.attrs = { ...surface.attrs, variant: "unknown-surface" };
    initializeCourseDocumentFragment(document, { content: invalid });
    const fragment = document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT);
    const beforeJson = yXmlFragmentToProsemirrorJSON(fragment);
    const beforeUpdate = Y.encodeStateAsUpdate(document);

    const result = createAuthoringEditorCollaborationSetup({ document, editable: true });

    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "unknown_surface_variant" })],
    });
    expect("content" in result).toBe(false);
    expect("extensions" in result).toBe(false);
    expect(yXmlFragmentToProsemirrorJSON(fragment)).toEqual(beforeJson);
    expect(Y.encodeStateAsUpdate(document)).toEqual(beforeUpdate);
  });

  it("writes course theme commands through the collaborative document", () => {
    const document = new Y.Doc();
    initializeCourseDocumentFragment(document, { mode: "page" });
    const setup = createAuthoringEditorCollaborationSetup({ document, editable: true });
    expect(setup.ok).toBe(true);
    if (!setup.ok) throw new Error("expected valid authoring setup");
    const editor = new Editor({ content: setup.content, extensions: setup.extensions });

    expect(selectCoursePreset(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);

    const collaborativeJson = yXmlFragmentToProsemirrorJSON(
      document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT),
    );
    expect(collaborativeJson.content?.[0]?.attrs?.["theme"]).toEqual({
      schemaVersion: 1,
      preset: {
        id: SCAFFOLD_EDITORIAL_PRESET.id,
        revision: SCAFFOLD_EDITORIAL_PRESET.revision,
      },
      values: SCAFFOLD_EDITORIAL_PRESET.values,
    });

    expect(editor.chain().focus().undo().run()).toBe(true);
    expect(editor.getJSON().content?.[0]?.attrs?.["theme"]?.preset.id).toBe(
      SCAFFOLD_DEFAULT_PRESET.id,
    );
    expect(editor.can().redo()).toBe(true);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON().content?.[0]?.attrs?.["theme"]?.preset.id).toBe(
      SCAFFOLD_EDITORIAL_PRESET.id,
    );
    editor.destroy();
  });

  it("keeps an immediate course theme section reset as one collaborative undo step", () => {
    const document = new Y.Doc();
    initializeCourseDocumentFragment(document, { mode: "page" });
    const setup = createAuthoringEditorCollaborationSetup({ document, editable: true });
    expect(setup.ok).toBe(true);
    if (!setup.ok) throw new Error("expected valid authoring setup");
    const editor = new Editor({ content: setup.content, extensions: setup.extensions });
    expect(selectCoursePreset(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);
    const customised = structuredClone(editor.getJSON().content?.[0]?.attrs?.["theme"]);
    customised.values.design.roundness = 0.9;
    expect(updateCourseTheme(editor, customised)).toBe(true);

    expect(resetCourseThemeSection(editor, SCAFFOLD_EDITORIAL_PRESET, "design")).toBe(true);
    expect(editor.chain().focus().undo().run()).toBe(true);

    expect(editor.getJSON().content?.[0]?.attrs?.["theme"]?.values.design.roundness).toBe(0.9);
    editor.destroy();
    document.destroy();
  });

  it("keeps an immediate complete course theme reset as one collaborative undo step", () => {
    const document = new Y.Doc();
    initializeCourseDocumentFragment(document, { mode: "page" });
    const setup = createAuthoringEditorCollaborationSetup({ document, editable: true });
    expect(setup.ok).toBe(true);
    if (!setup.ok) throw new Error("expected valid authoring setup");
    const editor = new Editor({ content: setup.content, extensions: setup.extensions });
    expect(selectCoursePreset(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);
    const customised = structuredClone(editor.getJSON().content?.[0]?.attrs?.["theme"]);
    customised.values.colors.resolved.dark.primary = "#16a34a";
    expect(updateCourseTheme(editor, customised)).toBe(true);

    expect(resetCourseTheme(editor, SCAFFOLD_EDITORIAL_PRESET)).toBe(true);
    expect(editor.chain().focus().undo().run()).toBe(true);

    expect(
      editor.getJSON().content?.[0]?.attrs?.["theme"]?.values.colors.resolved.dark.primary,
    ).toBe("#16a34a");
    editor.destroy();
    document.destroy();
  });

  it("writes one materialised author palette edit through collaboration and undo", () => {
    const document = new Y.Doc();
    initializeCourseDocumentFragment(document, { mode: "page" });
    const setup = createAuthoringEditorCollaborationSetup({ document, editable: true });
    expect(setup.ok).toBe(true);
    if (!setup.ok) throw new Error("expected valid authoring setup");
    const editor = new Editor({ content: setup.content, extensions: setup.extensions });

    expect(
      updateCourseThemePaletteSlot(editor, SCAFFOLD_DEFAULT_PRESET, "light", "primary", "#123456"),
    ).toBe(true);
    const collaborativeTheme = yXmlFragmentToProsemirrorJSON(
      document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT),
    ).content?.[0]?.attrs?.["theme"];
    expect(collaborativeTheme.values.colors.author.light.primary).toBe("#123456");
    expect(collaborativeTheme.values.colors.resolved.light.primary).toBe("#123456");

    expect(editor.chain().focus().undo().run()).toBe(true);
    expect(
      editor.getJSON().content?.[0]?.attrs?.["theme"]?.values.colors.author.light.primary,
    ).toBe(SCAFFOLD_DEFAULT_PRESET.values.colors.author.light.primary);
    editor.destroy();
    document.destroy();
  });
});
