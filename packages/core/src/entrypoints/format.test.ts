import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as format from "@scaffold/core/format";
import type {
  CourseDocumentAttrs,
  ScaffoldArtifact,
  ScaffoldDocumentContent,
  ScaffoldUninitializedAuthoringBootstrap,
  CourseMode,
  CreateScaffoldArtifactInput,
  CreateScaffoldDocumentContentInput,
  OverflowMode,
  PreparedScaffoldArtifact,
  PreparedScaffoldArtifactValue,
  SurfaceAttrs,
  SurfaceBackground,
  SurfaceSize,
} from "@scaffold/core/format";

type FormatTypeSurface = {
  artifact: ScaffoldArtifact;
  artifactInput: CreateScaffoldArtifactInput;
  content: ScaffoldDocumentContent;
  contentInput: CreateScaffoldDocumentContentInput;
  documentAttrs: CourseDocumentAttrs;
  mode: CourseMode;
  overflowMode: OverflowMode;
  preparedArtifact: PreparedScaffoldArtifact;
  preparedArtifactValue: PreparedScaffoldArtifactValue;
  surfaceAttrs: SurfaceAttrs;
  surfaceBackground: SurfaceBackground;
  surfaceSize: SurfaceSize;
  uninitializedBootstrap: ScaffoldUninitializedAuthoringBootstrap;
};

describe("@scaffold/core/format", () => {
  it("publishes the exact format value surface", () => {
    expect(Object.keys(format).sort()).toEqual([
      "CourseDocumentAttrsSchema",
      "CourseModeSchema",
      "OverflowModeSchema",
      "ScaffoldArtifactSchema",
      "ScaffoldDocumentContentSchema",
      "SurfaceAttrsSchema",
      "SurfaceBackgroundSchema",
      "SurfaceSizeSchema",
      "createScaffoldArtifact",
      "createScaffoldDocumentContent",
      "prepareScaffoldArtifactForAuthoring",
      "readCourseDocumentAttrs",
      "readCourseDocumentMode",
    ]);
    expect(Object.values(format).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes every format input, result, document, and schema-derived type", () => {
    expectTypeOf<FormatTypeSurface>().toBeObject();
  });
});
