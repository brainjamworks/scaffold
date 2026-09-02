import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as runtime from "@scaffold/core/runtime";
// @ts-expect-error The runtime entrypoint does not expose authoring composition.
import type { ScaffoldAuthoringComposition } from "@scaffold/core/runtime";
// @ts-expect-error Runtime never exposes authoring compatibility presentation.
import type { UnavailableContentNodeView } from "@scaffold/core/runtime";
// @ts-expect-error Runtime does not expose its internal prepared document token.
import type { PreparedRuntimeDocument } from "@scaffold/core/runtime";
// @ts-expect-error Runtime does not expose its internal prepared renderer.
import { PreparedCourseDocumentRuntimeRenderer } from "@scaffold/core/runtime";
import type {
  ContentRuntimeHostProps,
  ScaffoldLearnerAppProps,
  ScaffoldRuntimeComposition,
  ScaffoldRuntimePorts,
  ScaffoldProductAccess,
  ScaffoldServicesProviderProps,
  LearningEventRuntimeProviderProps,
  SlideshowPlayerSizing,
} from "@scaffold/core/runtime";

type RuntimeTypeSurface = {
  runtimeLaneViolation: ScaffoldAuthoringComposition;
  compatibilityPresentationViolation: UnavailableContentNodeView;
  preparedDocumentViolation: PreparedRuntimeDocument;
  preparedRendererViolation: typeof PreparedCourseDocumentRuntimeRenderer;
  composition: ScaffoldRuntimeComposition;
  contentRuntimeHostProps: ContentRuntimeHostProps;
  learnerAppProps: ScaffoldLearnerAppProps;
  runtimePorts: ScaffoldRuntimePorts;
  productAccess: ScaffoldProductAccess;
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
      "useAssessmentPort",
      "useCourseTheme",
      "useLearnerActivityPort",
      "useLearningEventPort",
      "useMediaPort",
    ]);
    expect(Object.values(runtime).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes the runtime host, port, and sizing types", () => {
    expectTypeOf<RuntimeTypeSurface>().toBeObject();
    expectTypeOf<
      {} extends Pick<ScaffoldLearnerAppProps, "composition"> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      {} extends Pick<ContentRuntimeHostProps, "composition"> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      {} extends Pick<ScaffoldLearnerAppProps, "productAccess"> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      {} extends Pick<ContentRuntimeHostProps, "productAccess"> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "surfaceExitPolicy" extends keyof ScaffoldLearnerAppProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "surfaceExitPolicy" extends keyof ContentRuntimeHostProps ? true : false
    >().toEqualTypeOf<false>();
  });
});
