import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as authoring from "@scaffold/core/authoring";
import type {
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
  it("publishes only the authoring entry value", () => {
    expect(Object.keys(authoring).sort()).toEqual(["ScaffoldAuthoringEntry"]);
    expect(Object.values(authoring).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes the authoring entry, host, preview, save, artifact, and learner types", () => {
    expectTypeOf<AuthoringTypeSurface>().toBeObject();
  });
});
