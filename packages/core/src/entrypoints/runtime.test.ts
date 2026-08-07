import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as runtime from "@scaffold/core/runtime";
// @ts-expect-error The runtime entrypoint does not expose authoring composition.
import type { ScaffoldAuthoringComposition } from "@scaffold/core/runtime";
import type {
  ContentRuntimeHostProps,
  CourseDocumentMigrationErrorCode,
  CourseDocumentMigrationResult,
  ScaffoldLearnerAppProps,
  ScaffoldRuntimeComposition,
  ScaffoldRuntimePorts,
  ScaffoldServicesProviderProps,
  LearningEventRuntimeProviderProps,
  SlideshowPlayerSizing,
} from "@scaffold/core/runtime";

type RuntimeTypeSurface = {
  runtimeLaneViolation: ScaffoldAuthoringComposition;
  composition: ScaffoldRuntimeComposition;
  contentRuntimeHostProps: ContentRuntimeHostProps;
  documentMigrationErrorCode: CourseDocumentMigrationErrorCode;
  documentMigrationResult: CourseDocumentMigrationResult;
  learnerAppProps: ScaffoldLearnerAppProps;
  runtimePorts: ScaffoldRuntimePorts;
  servicesProviderProps: ScaffoldServicesProviderProps;
  slideshowPlayerSizing: SlideshowPlayerSizing;
  learningEventRuntimeProviderProps: LearningEventRuntimeProviderProps;
};

describe("@scaffold/core/runtime", () => {
  it("publishes the exact runtime value surface", () => {
    expect(Object.keys(runtime).sort()).toEqual([
      "ContentRuntimeHost",
      "CourseThemePortalBoundary",
      "CourseThemeProvider",
      "LearningEventRuntimeProvider",
      "ScaffoldLearnerApp",
      "ScaffoldServicesProvider",
      "createCoreScaffoldRuntimeComposition",
      "migrateCourseDocumentJSON",
      "readCourseDocumentFormatVersion",
      "useAssessmentPort",
      "useCourseTheme",
      "useLearnerActivityPort",
      "useLearningEventPort",
      "useMediaPort",
    ]);
    expect(Object.values(runtime).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes the runtime host, port, migration, and sizing types", () => {
    expectTypeOf<RuntimeTypeSurface>().toBeObject();
    expectTypeOf<
      {} extends Pick<ScaffoldLearnerAppProps, "composition"> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      {} extends Pick<ContentRuntimeHostProps, "composition"> ? true : false
    >().toEqualTypeOf<false>();
  });
});
