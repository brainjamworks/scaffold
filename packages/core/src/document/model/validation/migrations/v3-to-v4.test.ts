import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DEFAULT_PRESET } from "@/theme/model";

import { v3ToV4CourseDocumentMigration } from "./v3-to-v4";

describe("v3-to-v4 Scaffold document migration", () => {
  it.each([undefined, null])(
    "materialises Scaffold Default for a legacy %s theme",
    (legacyTheme) => {
      const source = v3Document("page", legacyTheme);
      const migrated = v3ToV4CourseDocumentMigration.migrate(structuredClone(source));
      const attrs = migrated.content?.[0]?.attrs;

      expect(attrs).toMatchObject({
        schemaVersion: 4,
        mode: "page",
        theme: {
          schemaVersion: 1,
          preset: {
            id: SCAFFOLD_DEFAULT_PRESET.id,
            revision: SCAFFOLD_DEFAULT_PRESET.revision,
          },
          values: SCAFFOLD_DEFAULT_PRESET.values,
        },
      });
      expect((attrs?.["theme"] as { values?: unknown } | undefined)?.values).not.toBe(
        SCAFFOLD_DEFAULT_PRESET.values,
      );
      expect(attrs?.["theme"]?.values.colors).toMatchObject({
        author: {
          light: {
            background: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.background,
            primary: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.primary,
            link: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.primary,
          },
        },
        recipe: SCAFFOLD_DEFAULT_PRESET.values.colors.recipe,
        resolved: {
          light: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light,
          dark: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.dark,
        },
      });
      expect(attrs?.["theme"]?.values.colors).not.toHaveProperty("light");
      expect(attrs?.["theme"]?.values.colors).not.toHaveProperty("dark");
    },
  );

  it("preserves a named legacy theme as a recoverable reference", () => {
    const migrated = v3ToV4CourseDocumentMigration.migrate(
      v3Document("slideshow", "uk.ac.example.editorial"),
    );

    expect(migrated.content?.[0]?.attrs).toMatchObject({
      schemaVersion: 4,
      mode: "slideshow",
      surfaceSize: "16x9",
      overflowMode: "clip",
      theme: {
        schemaVersion: 1,
        preset: { id: "uk.ac.example.editorial", revision: null },
        values: null,
      },
    });
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
