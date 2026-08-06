import type { JSONContent } from "@tiptap/core";

import type { SurfaceId } from "@/document/model/course-structure";

import type { RuntimePlayerSelection } from "./player-types";

export function selectRuntimePlayer(
  content: JSONContent,
): RuntimePlayerSelection {
  const courseDocument = content.content?.[0];
  const surfaceIds = (courseDocument?.content ?? [])
    .filter((node) => node.type === "surface")
    .map((node) => node.attrs?.["id"] as SurfaceId);
  const [firstSurfaceId, ...remainingSurfaceIds] = surfaceIds as [SurfaceId, ...SurfaceId[]];

  if (courseDocument?.attrs?.["mode"] === "page") {
    return {
      player: "page",
      mode: "page",
      surfaceIds: [firstSurfaceId],
    };
  }

  return {
    player: "slideshow",
    mode: "slideshow",
    surfaceIds: [firstSurfaceId, ...remainingSurfaceIds],
  };
}
