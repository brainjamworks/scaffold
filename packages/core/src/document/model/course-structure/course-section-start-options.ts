import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { SurfaceId } from "./types";

export interface CourseSectionStartOption {
  readonly atSurfaceId: SurfaceId;
  readonly leadingTitleRequired: boolean;
}

export function readCourseSectionStartOptions(
  document: ProseMirrorNode,
): readonly CourseSectionStartOption[] {
  const courseDocument =
    document.type.name === "courseDocument"
      ? document
      : document.firstChild?.type.name === "courseDocument"
        ? document.firstChild
        : null;
  if (!courseDocument || courseDocument.attrs["mode"] !== "slideshow") return [];

  const children = Array.from({ length: courseDocument.childCount }, (_, index) =>
    courseDocument.child(index),
  );
  if (
    children.length === 0 ||
    children.some((child) => child.type.name !== "courseSection" && child.type.name !== "surface")
  ) {
    return [];
  }

  const hasSections = children.some((child) => child.type.name === "courseSection");
  const firstSurfaceIndex = children.findIndex((child) => child.type.name === "surface");
  const options: CourseSectionStartOption[] = [];

  for (const [index, child] of children.entries()) {
    if (child.type.name !== "surface") continue;
    const parsedId = EmbeddedNodeIdSchema.safeParse(child.attrs["id"]);
    if (!parsedId.success) return [];
    if (hasSections && children[index - 1]?.type.name === "courseSection") continue;

    options.push({
      atSurfaceId: parsedId.data,
      leadingTitleRequired: !hasSections && index !== firstSurfaceIndex,
    });
  }

  return options;
}
