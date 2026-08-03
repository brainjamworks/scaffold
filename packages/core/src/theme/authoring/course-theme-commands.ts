import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { CourseThemeRef } from "@scaffold/contracts";

import { PersistedCourseThemeSchema, type PersistedCourseTheme } from "@/schemas/course-document";
import type { CourseColourSystemRegistry } from "@/theme/course/colour-systems/registry";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import type { CourseDesignThemeRegistry } from "@/theme/course/designs/registry";

export function selectCourseDesign(
  editor: Editor,
  reference: CourseThemeRef,
  designs: CourseDesignThemeRegistry,
  colourSystems: CourseColourSystemRegistry,
): boolean {
  const design = designs.get(reference);
  if (!design || !colourSystems.get(design.defaultColourSystem)) return false;
  const theme = readCourseTheme(editor);
  if (!theme) return false;

  return writeCourseTheme(editor, {
    schemaVersion: 1,
    design: { id: design.id, revision: design.revision },
    colourSystem: {
      id: design.defaultColourSystem.id,
      revision: design.defaultColourSystem.revision,
    },
    overrides: {},
  });
}

export function selectCourseColourSystem(
  editor: Editor,
  reference: CourseThemeRef,
  registry: CourseColourSystemRegistry,
): boolean {
  const colourSystem = registry.get(reference);
  if (!colourSystem) return false;
  const theme = readCourseTheme(editor);
  if (!theme) return false;

  return writeCourseTheme(editor, {
    schemaVersion: 1,
    design: theme.design,
    colourSystem: { id: colourSystem.id, revision: colourSystem.revision },
    overrides: {},
  });
}

export function resetCourseTheme(editor: Editor): boolean {
  if (!readCourseTheme(editor)) return false;
  stopCollaborativeHistoryCapture(editor);
  return writeCourseTheme(editor, createDefaultPersistedCourseTheme(), true);
}

function stopCollaborativeHistoryCapture(editor: Editor): void {
  for (const plugin of editor.state.plugins) {
    const pluginKey = plugin.spec.key as { key: string } | undefined;
    if (!pluginKey?.key.startsWith("y-undo$")) continue;
    const pluginState = plugin.getState(editor.state) as
      | { undoManager?: { stopCapturing: () => void } }
      | undefined;
    pluginState?.undoManager?.stopCapturing();
    return;
  }
}

function readCourseTheme(editor: Editor): PersistedCourseTheme | null {
  const courseDocument = editor.state.doc.firstChild;
  if (courseDocument?.type.name !== "courseDocument") return null;
  const parsed = PersistedCourseThemeSchema.safeParse(courseDocument.attrs["theme"]);
  return parsed.success ? parsed.data : null;
}

function writeCourseTheme(
  editor: Editor,
  theme: PersistedCourseTheme,
  startsNewHistoryGroup = false,
): boolean {
  const parsed = PersistedCourseThemeSchema.safeParse(theme);
  const courseDocument = editor.state.doc.firstChild;
  if (!parsed.success || courseDocument?.type.name !== "courseDocument") return false;

  let transaction = editor.state.tr.setNodeMarkup(0, undefined, {
    ...courseDocument.attrs,
    theme: parsed.data,
  });
  if (startsNewHistoryGroup) transaction = closeHistory(transaction);
  editor.view.dispatch(transaction);
  return true;
}
