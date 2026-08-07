import type { JSONContent } from "@tiptap/core";

import { projectCourseStructure } from "@/document/model/course-structure";

import type { RuntimePlayerSelection } from "./player-types";

export function selectRuntimePlayer(content: JSONContent): RuntimePlayerSelection | null {
  const structure = projectCourseStructure(content);
  if (!structure) return null;

  if (structure.kind === "page") {
    return {
      player: "page",
      mode: "page",
      structure,
    };
  }

  return {
    player: "slideshow",
    mode: "slideshow",
    structure,
  };
}
