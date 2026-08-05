import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { validateCourseSurfaceLifecycle } from "@/document/model/validation";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { selectRuntimePlayer } from "./player-selection";

describe("selectRuntimePlayer", () => {
  it("selects a page only from its validated surface instance", () => {
    const projection = validatedProjection(
      createScaffoldDocumentContent({ mode: "page", surfaceId: "surface-page" }),
    );

    expect(selectRuntimePlayer(projection)).toEqual({
      status: "available",
      player: "page",
      mode: "page",
      surfaceIds: ["surface-page"],
    });
  });

  it("preserves validated slideshow instance order", () => {
    const content = createScaffoldDocumentContent({
      mode: "slideshow",
      surfaceId: "slide_000002",
    });
    const courseDocument = content.content?.[0];
    const firstSurface = courseDocument?.content?.[0];
    if (!courseDocument || !firstSurface) throw new Error("missing slideshow fixture");
    const slideCover = builtInSurfaceVariantRegistry.get("slide-cover");
    if (!slideCover) throw new Error("missing slide-cover definition");
    courseDocument.content = [
      firstSurface,
      slideCover.createSurface({ surfaceId: "slide_000001" }),
    ];
    const before = structuredClone(content);

    const selection = selectRuntimePlayer(validatedProjection(content));

    expect(selection).toEqual({
      status: "available",
      player: "slideshow",
      mode: "slideshow",
      surfaceIds: ["slide_000002", "slide_000001"],
    });
    expect(content).toEqual(before);
  });
});

function validatedProjection(content: JSONContent) {
  const result = validateCourseSurfaceLifecycle({
    content,
    registry: builtInSurfaceVariantRegistry,
  });
  if (!result.ok) throw new Error(`invalid test fixture: ${JSON.stringify(result.issues)}`);
  return result.value;
}
