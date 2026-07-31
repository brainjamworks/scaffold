import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as authoring from "@scaffold/core/authoring";
import type {
  CourseDocumentAuthoringSource,
  CourseDocumentEditorProps,
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
  ScaffoldAuthoringEntryProps,
  ScaffoldAuthoringHeaderActionsContext,
  ScaffoldAuthoringHostServices,
  ScaffoldAuthoringSaveState,
  ScaffoldLearnerHostServices,
  ScaffoldLearnerPreviewContent,
  ScaffoldPreviewServicesFactory,
} from "@scaffold/core/authoring";

type AuthoringTypeSurface = {
  courseDocumentEditorProps: CourseDocumentEditorProps;
  courseDocumentSource: CourseDocumentAuthoringSource;
  artifact: ScaffoldAuthoringArtifact;
  entryHostServices: ScaffoldAuthoringEntryHostServices;
  entryProps: ScaffoldAuthoringEntryProps;
  headerActionsContext: ScaffoldAuthoringHeaderActionsContext;
  hostServices: ScaffoldAuthoringHostServices;
  learnerHostServices: ScaffoldLearnerHostServices;
  learnerPreviewContent: ScaffoldLearnerPreviewContent;
  previewServicesFactory: ScaffoldPreviewServicesFactory;
  saveState: ScaffoldAuthoringSaveState;
};

describe("@scaffold/core/authoring", () => {
  it("publishes the authoring entry and embeddable Course editor values", () => {
    expect(Object.keys(authoring).sort()).toEqual([
      "CourseDocumentEditor",
      "ScaffoldAuthoringEntry",
    ]);
    expect(Object.values(authoring).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes the Course editor, authoring host, preview, save, artifact, and learner types", () => {
    expectTypeOf<AuthoringTypeSurface>().toBeObject();
    expectTypeOf<
      "xapi" extends keyof Awaited<ReturnType<ScaffoldPreviewServicesFactory>> ? true : false
    >().toEqualTypeOf<false>();
  });
});
