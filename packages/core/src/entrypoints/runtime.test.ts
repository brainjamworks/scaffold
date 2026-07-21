import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as runtime from "@scaffold/core/runtime";
import type {
  ContentRuntimeHostProps,
  CourseDocumentMigrationErrorCode,
  CourseDocumentMigrationResult,
  ScaffoldLearnerAppProps,
  ScaffoldRuntimePorts,
  ScaffoldServicesProviderProps,
  SlideshowPlayerSizing,
} from "@scaffold/core/runtime";

type RuntimeTypeSurface = {
  contentRuntimeHostProps: ContentRuntimeHostProps;
  documentMigrationErrorCode: CourseDocumentMigrationErrorCode;
  documentMigrationResult: CourseDocumentMigrationResult;
  learnerAppProps: ScaffoldLearnerAppProps;
  runtimePorts: ScaffoldRuntimePorts;
  servicesProviderProps: ScaffoldServicesProviderProps;
  slideshowPlayerSizing: SlideshowPlayerSizing;
};

describe("@scaffold/core/runtime", () => {
  it("publishes the exact runtime value surface", () => {
    expect(Object.keys(runtime).sort()).toEqual([
      "ContentRuntimeHost",
      "ScaffoldLearnerApp",
      "ScaffoldServicesProvider",
      "migrateCourseDocumentJSON",
      "readCourseDocumentFormatVersion",
      "useAssessmentPort",
      "useLearnerActivityPort",
      "useMediaPort",
    ]);
    expect(Object.values(runtime).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes the runtime host, port, migration, and sizing types", () => {
    expectTypeOf<RuntimeTypeSurface>().toBeObject();
  });
});
