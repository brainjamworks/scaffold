import {
  EmbeddedNodeIdSchema,
  ScaffoldDocumentContentSchema,
  type ScaffoldDocumentContent,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildCompilationSnapshot } from "@/authoring/publication/build-compilation-snapshot";
import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { prepareAuthorPreview } from "./author-preview-preparation";

const application = createScaffoldApplication();
const authoring = getCourseDocumentAuthoringEnvironmentState(
  createCourseDocumentAuthoringEnvironment({ composition: application.authoring }),
);

describe("prepareAuthorPreview", () => {
  it("builds Preview from the shared checked capture and never reads a publication capability", async () => {
    const surfaceId = EmbeddedNodeIdSchema.parse("previewsurf1");
    const capturedInput = document("oldcapture01");
    const checkedCanonical = document(surfaceId);
    const build = vi.fn((input: ScaffoldDocumentContent, revision: number) =>
      buildCompilationSnapshot(
        input,
        revision,
        authoring.schema,
        application.authoring.documentTree,
      ),
    );
    const loadRuntimeModule = vi.fn(async () => ({
      createSlideshowRuntimeProgramSource: vi.fn(),
    }));
    const services = {} as never;
    const createServices = vi.fn(() => services);
    const dependencies = Object.defineProperty(
      {
        prepareLearnerContent: vi.fn(() =>
          Result.ok({
            canonicalDocument: checkedCanonical,
            learnerContent: checkedCanonical,
            assessmentTargets: [],
            assessmentGroups: [],
          }),
        ),
        buildCompilationSnapshot: build,
        createServices,
        fallbackServices: {} as never,
        loadRuntimeModule,
      },
      "publication",
      {
        get: () => {
          throw new Error("Preview must not publish");
        },
      },
    );

    const result = await prepareAuthorPreview(
      { document: capturedInput, revision: 23, surfaceId },
      dependencies,
      null,
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error("expected Preview preparation to succeed");
    expect(dependencies.prepareLearnerContent).toHaveBeenCalledWith(capturedInput);
    expect(build).toHaveBeenCalledWith(checkedCanonical, 23);
    expect(result.value.content.learnerContent).toBe(checkedCanonical);
    expect(result.value.services).toStrictEqual(services);
    expect(createServices).toHaveBeenCalledOnce();
    expect(loadRuntimeModule).toHaveBeenCalledOnce();
  });

  it("short-circuits shared preparation diagnostics without compiling or creating services", async () => {
    const build = vi.fn();
    const createServices = vi.fn();
    const loadRuntimeModule = vi.fn();
    const surfaceId = EmbeddedNodeIdSchema.parse("previewsurf1");

    const result = await prepareAuthorPreview(
      { document: document(surfaceId), revision: 4, surfaceId },
      {
        prepareLearnerContent: () =>
          Result.err({
            reason: "projection-warning",
            warnings: [
              {
                code: "missing-block-id",
                blockType: "mcq",
                blockId: null,
                surfaceId,
                message: "Missing id",
              },
            ],
          }),
        buildCompilationSnapshot: build,
        createServices,
        fallbackServices: {} as never,
        loadRuntimeModule,
      },
      null,
    );

    expect(result).toMatchObject({
      error: { reason: "preview-projection-warning", warnings: [{ code: "missing-block-id" }] },
    });
    expect(build).not.toHaveBeenCalled();
    expect(createServices).not.toHaveBeenCalled();
    expect(loadRuntimeModule).not.toHaveBeenCalled();
  });

  it("returns a typed failure for slideshow configuration in a Page document", async () => {
    const surfaceId = EmbeddedNodeIdSchema.parse("previewsurf1");
    const checked = document(surfaceId);
    const courseDocument = (checked as JSONContent).content?.[0];
    if (!courseDocument) throw new Error("expected a checked Course Document");
    courseDocument.attrs = {
      ...courseDocument.attrs,
      presentation: {
        schemaVersion: 1,
        autoAdvance: false,
        allowPrevious: true,
        surfaces: [{ surfaceId, durationMs: 1_000, actions: [] }],
      },
    };
    const loadRuntimeModule = vi.fn();
    const createServices = vi.fn();

    const result = await prepareAuthorPreview(
      { document: checked, revision: 5, surfaceId },
      {
        prepareLearnerContent: () =>
          Result.ok({
            canonicalDocument: checked,
            learnerContent: checked,
            assessmentTargets: [],
            assessmentGroups: [],
          }),
        buildCompilationSnapshot: (input, revision) =>
          buildCompilationSnapshot(
            input,
            revision,
            authoring.schema,
            application.authoring.documentTree,
          ),
        createServices,
        fallbackServices: {} as never,
        loadRuntimeModule,
      },
      null,
    );

    expect(result).toMatchObject({ error: { reason: "preview-not-slideshow", mode: "page" } });
    expect(loadRuntimeModule).not.toHaveBeenCalled();
    expect(createServices).not.toHaveBeenCalled();
  });

  it("retains the exact entry services while rebuilding prepared content", async () => {
    const surfaceId = EmbeddedNodeIdSchema.parse("previewsurf1");
    const checked = document(surfaceId);
    const retainedServices = { media: null };
    const createServices = vi.fn();

    const result = await prepareAuthorPreview(
      { document: checked, revision: 6, surfaceId },
      {
        prepareLearnerContent: () =>
          Result.ok({
            canonicalDocument: checked,
            learnerContent: checked,
            assessmentTargets: [],
            assessmentGroups: [],
          }),
        buildCompilationSnapshot: (input, revision) =>
          buildCompilationSnapshot(
            input,
            revision,
            authoring.schema,
            application.authoring.documentTree,
          ),
        createServices,
        fallbackServices: {} as never,
        loadRuntimeModule: async () => ({ createSlideshowRuntimeProgramSource: vi.fn() }),
      },
      retainedServices,
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error("expected retained Preview services");
    expect(result.value.services).toBe(retainedServices);
    expect(createServices).not.toHaveBeenCalled();
  });
});

function document(surfaceId: string): ScaffoldDocumentContent {
  return ScaffoldDocumentContentSchema.parse(
    createScaffoldDocumentContent({ mode: "page", surfaceId }),
  );
}
