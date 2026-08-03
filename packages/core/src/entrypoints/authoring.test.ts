import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as authoring from "@scaffold/core/authoring";
// @ts-expect-error The authoring entrypoint does not expose runtime composition.
import type { ScaffoldRuntimeComposition } from "@scaffold/core/authoring";
import type {
  CourseDocumentAuthoringSource,
  CourseDocumentEditorProps,
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringComposition,
  ScaffoldAuthoringEntryHostServices,
  ScaffoldAuthoringEntryProps,
  ScaffoldAuthoringHeaderActionsContext,
  ScaffoldAuthoringHostServices,
  ScaffoldAuthoringSaveState,
  ScaffoldLearnerHostServices,
  ScaffoldLearnerPreviewContent,
  ScaffoldPreviewServicesFactory,
  ScaffoldThemeExtension,
} from "@scaffold/core/authoring";

type AuthoringTypeSurface = {
  composition: ScaffoldAuthoringComposition;
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
  themeExtension: ScaffoldThemeExtension;
};

describe("@scaffold/core/authoring", () => {
  it("publishes the authoring entry and embeddable Course editor values", () => {
    expect(Object.keys(authoring).sort()).toEqual([
      "AuthoringHeaderIconButton",
      "CourseDocumentEditor",
      "ScaffoldAuthoringEntry",
      "createCoreScaffoldAuthoringComposition",
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
