import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { v3ToV4CourseDocumentMigration } from "./v3-to-v4";

describe("v3-to-v4 Scaffold document migration", () => {
  it.each([undefined, null, "uk.ac.example.editorial"])(
    "installs the exact application default for a discarded %s theme",
    (legacyTheme) => {
      const source = v3Document("page", legacyTheme);
      const migrated = v3ToV4CourseDocumentMigration.migrate(structuredClone(source));
      const attrs = migrated.content?.[0]?.attrs;

      expect(attrs).toMatchObject({
        schemaVersion: 4,
        mode: "page",
        theme: createDefaultPersistedCourseTheme(),
      });
    },
  );

  it("preserves slideshow attrs and document structure while installing the theme", () => {
    const source = v3Document("slideshow", "discarded-theme");
    const sourceContent = structuredClone(source.content?.[0]?.content);
    const migrated = v3ToV4CourseDocumentMigration.migrate(source);

    expect(migrated.content?.[0]?.attrs).toMatchObject({
      schemaVersion: 4,
      mode: "slideshow",
      surfaceSize: "16x9",
      overflowMode: "clip",
      theme: createDefaultPersistedCourseTheme(),
    });
    expect(migrated.content?.[0]?.content).toEqual(sourceContent);
  });

  it("rejects malformed legacy theme values without mutating the source", () => {
    const source = v3Document("page", { css: "body {}" });
    const snapshot = structuredClone(source);

    expect(() => v3ToV4CourseDocumentMigration.migrate(source)).toThrow(
      "courseDocument.attrs.theme does not match the v3 courseDocument format",
    );
    expect(source).toEqual(snapshot);
  });
});

function v3Document(mode: "page" | "slideshow", theme: unknown): JSONContent {
  const attrs: Record<string, unknown> = {
    schemaVersion: 3,
    mode,
    surfaceSize: mode === "slideshow" ? "16x9" : "fluid",
    overflowMode: mode === "slideshow" ? "clip" : "grow",
  };
  if (theme !== undefined) attrs["theme"] = theme;

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs,
        content: [
          {
            type: "surface",
            attrs: {
              id: "surface-1",
              variant: mode === "slideshow" ? "slide-cover" : "page-default",
            },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}
