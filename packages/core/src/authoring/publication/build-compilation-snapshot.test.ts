import { EmbeddedNodeIdSchema, ScaffoldDocumentContentSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { buildCompilationSnapshot } from "./build-compilation-snapshot";

const application = createScaffoldApplication();
const authoring = getCourseDocumentAuthoringEnvironmentState(
  createCourseDocumentAuthoringEnvironment({ composition: application.authoring }),
);

describe("buildCompilationSnapshot", () => {
  it("derives structure, tree, and controls from one captured document revision", () => {
    const capturedSurfaceId = EmbeddedNodeIdSchema.parse("capturesurf1");
    const laterLiveSurfaceId = EmbeddedNodeIdSchema.parse("liveedit0001");
    const captured = ScaffoldDocumentContentSchema.parse(
      createScaffoldDocumentContent({ mode: "page", surfaceId: capturedSurfaceId }),
    );
    const laterLiveDocument = ScaffoldDocumentContentSchema.parse(
      createScaffoldDocumentContent({ mode: "page", surfaceId: laterLiveSurfaceId }),
    );

    const snapshot = buildCompilationSnapshot(
      captured,
      17,
      authoring.schema,
      application.authoring.documentTree,
    );

    expect(snapshot.revision).toBe(17);
    expect(snapshot.documentTree.revision).toBe(17);
    expect(snapshot.courseStructure.surfaceIds).toEqual([capturedSurfaceId]);
    expect(snapshot.documentTree.itemById.has(capturedSurfaceId)).toBe(true);
    expect(snapshot.documentTree.itemById.has(laterLiveSurfaceId)).toBe(false);
    expect(snapshot.controlCapabilities.resolve(laterLiveSurfaceId)).toMatchObject({
      error: { reason: "target-not-public", targetId: laterLiveSurfaceId },
    });
    expect(laterLiveDocument).not.toEqual(captured);
  });

  it("keeps invalid structure observable as a programming defect", () => {
    const malformed = ScaffoldDocumentContentSchema.parse({ type: "doc", content: [] });

    expect(() =>
      buildCompilationSnapshot(malformed, 1, authoring.schema, application.authoring.documentTree),
    ).toThrow();
  });
});
