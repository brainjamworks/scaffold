import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { SurfaceBackgroundSchema, SurfaceSettingsSchema } from "@/schemas/course-document";

interface SurfaceRecord {
  node: ProseMirrorNode;
  pos: number;
}

interface CourseDocumentRecord {
  mode: string | null;
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

export function canDuplicateSurface(editor: Editor, surfaceId: string): boolean {
  const parsedSurfaceId = EmbeddedNodeIdSchema.safeParse(surfaceId);
  if (!parsedSurfaceId.success) return false;

  return editor.can().applyCourseStructureCommand({
    type: "surface.duplicate",
    surfaceId: parsedSurfaceId.data,
  });
}

export function duplicateSurface(editor: Editor, surfaceId: string): boolean {
  const parsedSurfaceId = EmbeddedNodeIdSchema.safeParse(surfaceId);
  if (!parsedSurfaceId.success) return false;

  return editor
    .chain()
    .focus()
    .applyCourseStructureCommand({
      type: "surface.duplicate",
      surfaceId: parsedSurfaceId.data,
    })
    .scrollIntoView()
    .run();
}

export function canDeleteSurface(editor: Editor, surfaceId: string): boolean {
  const parsedSurfaceId = EmbeddedNodeIdSchema.safeParse(surfaceId);
  if (!parsedSurfaceId.success) return false;

  return editor.can().applyCourseStructureCommand({
    type: "surface.delete",
    surfaceId: parsedSurfaceId.data,
  });
}

export function deleteSurface(editor: Editor, surfaceId: string): boolean {
  const parsedSurfaceId = EmbeddedNodeIdSchema.safeParse(surfaceId);
  if (!parsedSurfaceId.success) return false;

  return editor
    .chain()
    .focus()
    .applyCourseStructureCommand({
      type: "surface.delete",
      surfaceId: parsedSurfaceId.data,
    })
    .scrollIntoView()
    .run();
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
