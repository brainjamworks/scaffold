import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { SurfaceBackgroundSchema, SurfaceSettingsSchema } from "@/schemas/course-document";
import { setTextSelectionNearInTransaction } from "@/editor/selection/selection-transactions";

import {
  deleteNodeChecked,
  duplicateNodeChecked,
} from "@/document/model/commands/checked-transactions";

interface SurfaceRecord {
  node: ProseMirrorNode;
  pos: number;
}

interface CourseDocumentRecord {
  mode: string | null;
  surfaces: SurfaceRecord[];
}

interface SurfaceActionTarget {
  index: number;
  mode: string | null;
  node: ProseMirrorNode;
  pos: number;
  surfaces: SurfaceRecord[];
}

function getCourseDocument(editor: Editor): CourseDocumentRecord | null {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") return null;

  const surfaces: SurfaceRecord[] = [];
  let childPos = 1;

  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const child = courseDocument.child(index);
    if (child.type.name === "surface") {
      surfaces.push({ node: child, pos: childPos });
    }
    childPos += child.nodeSize;
  }

  return {
    mode: typeof courseDocument.attrs["mode"] === "string" ? courseDocument.attrs["mode"] : null,
    surfaces,
  };
}

function getPageDocument(editor: Editor): CourseDocumentRecord | null {
  const courseDocument = getCourseDocument(editor);
  return courseDocument?.mode === "page" ? courseDocument : null;
}

function dispatchChecked(editor: Editor, tr: Editor["state"]["tr"]): boolean {
  if (!tr.docChanged) return false;

  try {
    tr.doc.check();
  } catch {
    return false;
  }

  editor.view.dispatch(tr);
  return true;
}

function dispatchSurfaceAction(editor: Editor, tr: Editor["state"]["tr"]): boolean {
  if (!tr.docChanged) return false;

  try {
    tr.doc.check();
  } catch {
    return false;
  }

  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

function resolveSurfaceActionTarget(
  editor: Editor,
  surfacePos: number,
): SurfaceActionTarget | null {
  const courseDocument = getCourseDocument(editor);
  if (!courseDocument) return null;

  const index = courseDocument.surfaces.findIndex((surface) => surface.pos === surfacePos);
  if (index < 0) return null;

  const surface = courseDocument.surfaces[index];
  if (!surface || surface.node.type.name !== "surface") return null;

  return {
    index,
    mode: courseDocument.mode,
    node: surface.node,
    pos: surface.pos,
    surfaces: courseDocument.surfaces,
  };
}

function setTextSelectionNearSurface(tr: Editor["state"]["tr"], surfacePos: number): void {
  const selectionPos = Math.min(surfacePos + 2, tr.doc.content.size);
  setTextSelectionNearInTransaction(tr, selectionPos, 1);
}

export function canDuplicateSurfaceAt(editor: Editor, surfacePos: number): boolean {
  const target = resolveSurfaceActionTarget(editor, surfacePos);
  return Boolean(target && target.mode !== "page");
}

export function duplicateSurfaceAt(editor: Editor, surfacePos: number): boolean {
  const target = resolveSurfaceActionTarget(editor, surfacePos);
  if (!target || target.mode === "page") return false;

  const result = duplicateNodeChecked({
    tr: editor.state.tr,
    pos: surfacePos,
    regenerateStableIds: true,
  });
  if (!result.ok) return false;

  setTextSelectionNearSurface(result.tr, surfacePos + target.node.nodeSize);
  return dispatchSurfaceAction(editor, result.tr);
}

export function canDeleteSurfaceAt(editor: Editor, surfacePos: number): boolean {
  const target = resolveSurfaceActionTarget(editor, surfacePos);
  return Boolean(target && target.mode !== "page" && target.surfaces.length > 1);
}

export function deleteSurfaceAt(editor: Editor, surfacePos: number): boolean {
  const target = resolveSurfaceActionTarget(editor, surfacePos);
  if (!target || target.mode === "page" || target.surfaces.length <= 1) {
    return false;
  }

  const nextSurface = target.surfaces[target.index + 1];
  const previousSurface = target.surfaces[target.index - 1];
  const selectionSurfacePos = nextSurface ? surfacePos : (previousSurface?.pos ?? null);

  const result = deleteNodeChecked({
    tr: editor.state.tr,
    pos: surfacePos,
  });
  if (!result.ok) return false;

  if (selectionSurfacePos !== null) {
    setTextSelectionNearSurface(result.tr, selectionSurfacePos);
  }
  return dispatchSurfaceAction(editor, result.tr);
}

function updatePageSurfaceAttrs(editor: Editor, attrs: Record<string, unknown>): boolean {
  const courseDocument = getPageDocument(editor);
  const surface = courseDocument?.surfaces[0] ?? null;
  if (!courseDocument || !surface || courseDocument.surfaces.length !== 1) {
    return false;
  }

  const nextAttrs = {
    ...surface.node.attrs,
    ...attrs,
  };

  return dispatchChecked(editor, editor.state.tr.setNodeMarkup(surface.pos, undefined, nextAttrs));
}

function createTitleHeading(editor: Editor, title: string): ProseMirrorNode | null {
  const headingType = editor.schema.nodes.heading;
  if (!headingType) return null;

  return headingType.create({ level: 1 }, editor.schema.text(title));
}

export function setPageSurfaceTitle(editor: Editor, title: string | null): boolean {
  const normalizedTitle = title?.trim() ? title : null;
  const courseDocument = getPageDocument(editor);
  const surface = courseDocument?.surfaces[0] ?? null;
  if (!courseDocument || !surface || courseDocument.surfaces.length !== 1) {
    return false;
  }

  const tr = editor.state.tr.setNodeMarkup(surface.pos, undefined, {
    ...surface.node.attrs,
    title: normalizedTitle,
  });

  if (normalizedTitle) {
    const heading = createTitleHeading(editor, normalizedTitle);
    if (!heading) return false;

    const firstChild = surface.node.firstChild;
    const contentStart = surface.pos + 1;
    if (firstChild?.type.name === "heading" && firstChild.attrs["level"] === 1) {
      tr.replaceWith(contentStart, contentStart + firstChild.nodeSize, heading);
    } else {
      tr.insert(contentStart, heading);
    }
  }

  return dispatchChecked(editor, tr);
}

export function setPageSurfaceBackground(editor: Editor, background: unknown): boolean {
  const courseDocument = getPageDocument(editor);
  const surface = courseDocument?.surfaces[0] ?? null;
  if (!courseDocument || !surface || courseDocument.surfaces.length !== 1) {
    return false;
  }

  const parsedSettings = SurfaceSettingsSchema.safeParse(surface.node.attrs["settings"]);
  const nextSettings = parsedSettings.success ? { ...parsedSettings.data } : {};

  if (background === null) {
    delete nextSettings.background;
    return updatePageSurfaceAttrs(editor, { settings: nextSettings });
  }

  const parsed = SurfaceBackgroundSchema.safeParse(background);
  if (!parsed.success) {
    return false;
  }

  nextSettings.background = parsed.data;
  return updatePageSurfaceAttrs(editor, { settings: nextSettings });
}

export function setPageSurfaceNotes(editor: Editor, notes: string | null): boolean {
  return updatePageSurfaceAttrs(editor, {
    notes: notes && notes.trim() ? notes : null,
  });
}
