import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "@/document/model/course-structure";

export function projectAuthoringCourseStructure(
  doc: ProseMirrorNode,
): ProjectedCourseStructure | null {
  if (doc.type.name !== "doc" || doc.childCount !== 1) return null;
  const courseDocument = doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") return null;

  const children: JSONContent[] = [];
  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const child = courseDocument.child(index);
    const projectedChild = projectCourseChild(child);
    if (!projectedChild) return null;
    children.push(projectedChild);
  }

  return projectCourseStructure({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: courseDocument.attrs["mode"] },
        content: children,
      },
    ],
  });
}

function projectCourseChild(node: ProseMirrorNode): JSONContent | null {
  if (node.type.name === "surface" || node.type.name === "unavailable_surface") {
    return { type: "surface", attrs: { id: node.attrs["id"] } };
  }
  if (node.type.name !== "courseSection" || node.childCount !== 0) return null;
  return {
    type: "courseSection",
    attrs: {
      id: node.attrs["id"],
      title: node.attrs["title"],
    },
  };
}
