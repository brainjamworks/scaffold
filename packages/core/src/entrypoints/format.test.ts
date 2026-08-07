import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as format from "@scaffold/core/format";
// @ts-expect-error Authoring mutation commands are not part of the trusted format read seam.
import type { CourseStructureCommand } from "@scaffold/core/format";
import type {
  CourseSectionId,
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
  ProjectedCourseSection,
  ProjectedCourseStructure,
  ProjectedCourseSurface,
  ProjectedPageCourseStructure,
  ProjectedSectionedSlideshowCourseStructure,
  ProjectedSlideshowCourseStructure,
  ProjectedUnsectionedSlideshowCourseStructure,
  SurfaceAttrs,
  SurfaceBackground,
  SurfaceId,
  SurfaceSize,
} from "@scaffold/core/format";

type FormatTypeSurface = {
  artifact: ScaffoldArtifact;
  artifactInput: CreateScaffoldArtifactInput;
  content: ScaffoldDocumentContent;
  contentInput: CreateScaffoldDocumentContentInput;
  courseSectionId: CourseSectionId;
  documentAttrs: CourseDocumentAttrs;
  mode: CourseMode;
  overflowMode: OverflowMode;
  preparedArtifact: PreparedScaffoldArtifact;
  preparedArtifactValue: PreparedScaffoldArtifactValue;
  projectedCourseSection: ProjectedCourseSection;
  projectedCourseStructure: ProjectedCourseStructure;
  projectedCourseSurface: ProjectedCourseSurface;
  projectedPageCourseStructure: ProjectedPageCourseStructure;
  projectedSectionedSlideshowCourseStructure: ProjectedSectionedSlideshowCourseStructure;
  projectedSlideshowCourseStructure: ProjectedSlideshowCourseStructure;
  projectedUnsectionedSlideshowCourseStructure: ProjectedUnsectionedSlideshowCourseStructure;
  surfaceAttrs: SurfaceAttrs;
  surfaceBackground: SurfaceBackground;
  surfaceId: SurfaceId;
  surfaceSize: SurfaceSize;
  uninitializedBootstrap: ScaffoldUninitializedAuthoringBootstrap;
  mutationViolation: CourseStructureCommand;
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
      "projectCourseStructure",
      "readCourseDocumentAttrs",
      "readCourseDocumentMode",
    ]);
    expect(Object.values(format).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes every format input, result, document, and schema-derived type", () => {
    expectTypeOf<FormatTypeSurface>().toBeObject();
  });

  it("projects canonical content through the public format read seam", () => {
    const content = format.createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "surface-page",
    });

    expect(format.projectCourseStructure(content)).toMatchObject({
      kind: "page",
      mode: "page",
      surfaceIds: ["surface-page"],
    });
    expect(format).not.toHaveProperty("applyCourseStructureCommand");
  });
});
