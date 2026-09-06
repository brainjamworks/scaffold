import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as authoring from "@scaffold/core/authoring";
// @ts-expect-error The authoring entrypoint does not expose runtime composition.
import type { ScaffoldRuntimeComposition } from "@scaffold/core/authoring";
// @ts-expect-error Compatibility presentation remains a Core authoring implementation detail.
import type { UnavailableContentNodeView } from "@scaffold/core/authoring";
// @ts-expect-error The raw editor component is a Core-internal trust boundary.
import type { CourseDocumentEditorProps } from "@scaffold/core/authoring";
import type {
  AuthoringSaveFailure,
  AuthoringSaveResult,
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringComposition,
  ScaffoldAuthoringEntryHostServices,
  ScaffoldAuthoringEntryProps,
  ScaffoldAuthoringHostActionSlots,
  ScaffoldAuthoringHostActionsContext,
  ScaffoldAuthoringHostServices,
  ScaffoldAuthoringSaveState,
  SavedAuthoringRevision,
  ScaffoldLearnerHostServices,
  ScaffoldLearnerPreviewContent,
  ScaffoldPreviewServicesFactory,
  ScaffoldProductAccess,
  UnavailableContentRef,
} from "@scaffold/core/authoring";

type AuthoringTypeSurface = {
  authoringSaveFailure: AuthoringSaveFailure;
  authoringSaveResult: AuthoringSaveResult;
  authoringLaneViolation: ScaffoldRuntimeComposition;
  compatibilityPresentationViolation: UnavailableContentNodeView;
  composition: ScaffoldAuthoringComposition;
  editorSurfaceViolation: CourseDocumentEditorProps;
  unavailableContent: UnavailableContentRef;
  artifact: ScaffoldAuthoringArtifact;
  entryHostServices: ScaffoldAuthoringEntryHostServices;
  entryProps: ScaffoldAuthoringEntryProps;
  hostActionSlots: ScaffoldAuthoringHostActionSlots;
  hostActionsContext: ScaffoldAuthoringHostActionsContext;
  hostServices: ScaffoldAuthoringHostServices;
  learnerHostServices: ScaffoldLearnerHostServices;
  learnerPreviewContent: ScaffoldLearnerPreviewContent;
  previewServicesFactory: ScaffoldPreviewServicesFactory;
  productAccess: ScaffoldProductAccess;
  saveState: ScaffoldAuthoringSaveState;
  savedAuthoringRevision: SavedAuthoringRevision;
};

describe("@scaffold/core/authoring", () => {
  it("publishes the authoring entry without the private raw-editor boundary", () => {
    expect(Object.keys(authoring).sort()).toEqual([
      "AuthoringHeaderIconButton",
      "CourseThemePortalBoundary",
      "CourseThemeProvider",
      "ScaffoldAuthoringEntry",
      "createCoreScaffoldAuthoringComposition",
      "useCourseTheme",
    ]);
    expect(Object.values(authoring).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes safe authoring host, preview, save, artifact, and learner types", () => {
    expectTypeOf<AuthoringTypeSurface>().toBeObject();
    expectTypeOf<
      {} extends Pick<ScaffoldAuthoringEntryProps, "application"> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      {} extends Pick<ScaffoldAuthoringEntryProps, "productAccess"> ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "onEditorReady" extends keyof ScaffoldAuthoringEntryProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "onAuthoringEditorChange" extends keyof ScaffoldAuthoringEntryProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "agentIntegration" extends keyof ScaffoldAuthoringEntryProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "initialSavedArtifactRevision" extends keyof ScaffoldAuthoringEntryProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "hostHeaderActions" extends keyof ScaffoldAuthoringEntryProps ? true : false
    >().toEqualTypeOf<true>();
    expectTypeOf<
      "headerActions" extends keyof ScaffoldAuthoringEntryProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "publishNow" extends keyof ScaffoldAuthoringHostActionsContext ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "publishState" extends keyof ScaffoldAuthoringHostActionsContext ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "learningEvents" extends keyof Awaited<ReturnType<ScaffoldPreviewServicesFactory>>
        ? true
        : false
    >().toEqualTypeOf<false>();
  });
});
