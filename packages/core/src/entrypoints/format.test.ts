import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as format from "@scaffold/core/format";
// @ts-expect-error Authoring mutation commands are not part of the trusted format read seam.
import type { CourseStructureCommand } from "@scaffold/core/format";
// @ts-expect-error Authoring compatibility node implementations are private to Core authoring.
import type { UnavailableContentNodeView } from "@scaffold/core/format";
// @ts-expect-error Authoring establishment results remain inside Core authoring preparation.
import type { AuthoringDocumentEstablishmentResult } from "@scaffold/core/format";
import type {
  CourseSectionId,
  CourseDocumentAttrs,
  ScaffoldArtifact,
  ScaffoldDocumentContent,
  CourseMode,
  CreateScaffoldArtifactInput,
  CreateScaffoldDocumentContentInput,
  OverflowMode,
  ProjectedCourseSection,
  ProjectedCourseStructure,
  ProjectedCourseSurface,
  ProjectedPageCourseSurface,
  ProjectedPageCourseStructure,
  ProjectedSlideshowCourseSurface,
  ProjectedSlideshowCourseStructure,
  SurfaceAttrs,
  SurfaceBackground,
  SurfaceId,
  SurfaceSize,
} from "@scaffold/core/format";

type FormatTypeSurface = {
  authoringEstablishment: AuthoringDocumentEstablishmentResult;
  artifact: ScaffoldArtifact;
  artifactInput: CreateScaffoldArtifactInput;
  content: ScaffoldDocumentContent;
  contentInput: CreateScaffoldDocumentContentInput;
  courseSectionId: CourseSectionId;
  documentAttrs: CourseDocumentAttrs;
  mode: CourseMode;
  overflowMode: OverflowMode;
  projectedCourseSection: ProjectedCourseSection;
  projectedCourseStructure: ProjectedCourseStructure;
  projectedCourseSurface: ProjectedCourseSurface;
  projectedPageCourseSurface: ProjectedPageCourseSurface;
  projectedPageCourseStructure: ProjectedPageCourseStructure;
  projectedSlideshowCourseSurface: ProjectedSlideshowCourseSurface;
  projectedSlideshowCourseStructure: ProjectedSlideshowCourseStructure;
  surfaceAttrs: SurfaceAttrs;
  surfaceBackground: SurfaceBackground;
  surfaceId: SurfaceId;
  surfaceSize: SurfaceSize;
  mutationViolation: CourseStructureCommand;
  compatibilityPresentationViolation: UnavailableContentNodeView;
};

describe("@scaffold/core/format", () => {
  it("publishes the exact format value surface", () => {
    expect(Object.keys(format).sort()).toEqual([
      "CourseDocumentAttrsSchema",
      "CourseModeSchema",
      "INTERACTIONS_FIXTURE_ARTIFACT_ID",
      "INTERACTIONS_FIXTURE_IDS",
      "OverflowModeSchema",
      "ScaffoldArtifactSchema",
      "ScaffoldDocumentContentSchema",
      "SurfaceAttrsSchema",
      "SurfaceBackgroundSchema",
      "SurfaceSizeSchema",
      "createInteractionsFixtureArtifact",
      "createInteractionsFixtureContent",
      "createScaffoldArtifact",
      "createScaffoldDocumentContent",
      "projectCourseStructure",
      "projectInteractionsFixture",
      "readCourseDocumentAttrs",
      "readCourseDocumentFormatVersion",
      "readCourseDocumentMode",
    ]);
    expect(Object.values(format).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes every format input, result, document, and schema-derived type", () => {
    expectTypeOf<FormatTypeSurface>().toBeObject();
    expectTypeOf<ProjectedPageCourseSurface["courseSectionId"]>().toEqualTypeOf<null>();
    expectTypeOf<
      ProjectedSlideshowCourseSurface["courseSectionId"]
    >().toEqualTypeOf<CourseSectionId>();
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

  it("keeps authoring preparation and compatibility working state off the format seam", () => {
    expect(format).not.toHaveProperty("prepareScaffoldArtifactForAuthoring");
    expect(format).not.toHaveProperty("prepareCourseDocumentAuthoringMount");
  });
});
