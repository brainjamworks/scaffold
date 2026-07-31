import { z } from "zod";

import {
  CourseModeSchema,
  CourseDocumentAttrsSchema,
  OverflowModeSchema,
  SurfaceSizeSchema,
} from "@/schemas/course-document";
import { createScaffoldDefaultTheme } from "@/theme/model";

import { defineCourseDocumentMigration } from "../migration-registry";
import { asRecord, findCourseDocument } from "./helpers";

const V3CourseDocumentAttrsSchema = z
  .object({
    schemaVersion: z.literal(3),
    mode: CourseModeSchema,
    surfaceSize: SurfaceSizeSchema.default("fluid"),
    overflowMode: OverflowModeSchema.default("grow"),
    theme: z.string().trim().min(1).nullable().optional(),
    branching: z.unknown().optional(),
  })
  .refine(
    (attrs) =>
      attrs.mode === "slideshow" ? attrs.surfaceSize === "16x9" : attrs.surfaceSize === "fluid",
    {
      message: "surfaceSize must match the course mode",
      path: ["surfaceSize"],
    },
  );

export const v3ToV4CourseDocumentMigration = defineCourseDocumentMigration({
  from: 3,
  to: 4,
  description: "Materialise complete course theme snapshots.",
  migrate(document) {
    const courseDocument = findCourseDocument(document);
    if (!courseDocument) throw new Error("the courseDocument node is missing");

    const attrs = asRecord(courseDocument.node.attrs);
    if (!attrs) throw new Error("the courseDocument attrs are missing");

    const legacy = V3CourseDocumentAttrsSchema.safeParse(attrs);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      const path = issue?.path.length ? `.${issue.path.join(".")}` : "";
      throw new Error(`courseDocument.attrs${path} does not match the v3 courseDocument format`);
    }

    const theme =
      typeof legacy.data.theme === "string"
        ? {
            schemaVersion: 1 as const,
            preset: { id: legacy.data.theme, revision: null },
            values: null,
          }
        : createScaffoldDefaultTheme();
    const migrated = CourseDocumentAttrsSchema.safeParse({
      ...legacy.data,
      schemaVersion: 4,
      theme,
    });
    if (!migrated.success) {
      throw new Error("courseDocument.attrs do not match the v4 courseDocument format");
    }

    courseDocument.node.attrs = migrated.data;
    return document;
  },
});
