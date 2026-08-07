import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { CourseSectionId } from "./types";

export interface CourseSectionOrdinalContext {
  readonly number: number;
  readonly count: number;
}

export function readCourseSectionOrdinalContext(
  document: ProseMirrorNode,
  courseSectionId: CourseSectionId,
): CourseSectionOrdinalContext | null {
  const courseDocument =
    document.type.name === "courseDocument"
      ? document
      : document.firstChild?.type.name === "courseDocument"
        ? document.firstChild
        : null;
  if (!courseDocument || courseDocument.attrs["mode"] !== "slideshow") return null;

  let count = 0;
  let number: number | null = null;
  courseDocument.forEach((child) => {
    if (child.type.name !== "courseSection") return;
    count += 1;
    if (number === null && child.attrs["id"] === courseSectionId) number = count;
  });

  return number === null ? null : { number, count };
}
