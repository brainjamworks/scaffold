import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  class MoodleServiceError extends Error {
    constructor(
      message: string,
      readonly service = {
        errorCode: null as string | null,
        debugInfo: null as string | null,
        exceptionName: null as string | null,
      },
    ) {
      super(message);
    }
  }
  return {
    MoodleServiceError,
    media: {
      resolve: vi.fn(),
      list: vi.fn(),
      upload: vi.fn(),
    },
    moodleCall: vi.fn(async () => ({ success: true, artifactRevision: "revision-2" })),
    createMoodleRuntimePorts: vi.fn(),
  };
});

vi.mock("./api", () => ({
  MoodleServiceError: mocks.MoodleServiceError,
  moodleCall: mocks.moodleCall,
}));

vi.mock("./ports", () => ({
  createMoodleRuntimePorts: mocks.createMoodleRuntimePorts,
}));

import { createMoodleAuthoringHostServices } from "./authoring-ports";
import { createMoodleArtifactPersistence } from "./artifact-persistence-port";

describe("createMoodleAuthoringHostServices", () => {
  it("exposes stable creation metadata with persistence and media", async () => {
    mocks.createMoodleRuntimePorts.mockReturnValue({
      media: mocks.media,
      assessment: { type: "runtime" },
    });

    const initialStatus = {
      currentArtifactRevision: "revision-1",
      publishedArtifactRevision: null,
      publishedAt: null,
    };
    const services = createMoodleAuthoringHostServices(
      42,
      {
        id: "moodle-cm-42",
        title: "Moodle activity",
      },
      initialStatus,
    );

    expect(mocks.createMoodleRuntimePorts).toHaveBeenCalledWith(42);
    await expect(
      services.artifactCreation.createArtifactMetadata({ mode: "page" }),
    ).resolves.toEqual({
      id: "moodle-cm-42",
      requiresScaffoldPlus: false,
      title: "Moodle activity",
    });
    await expect(
      services.artifactCreation.createArtifactMetadata({ mode: "slideshow" }),
    ).resolves.toEqual({
      id: "moodle-cm-42",
      requiresScaffoldPlus: false,
      title: "Moodle activity",
    });
    const bundle = {
      artifact: {
        id: "moodle-cm-42",
        title: "Moodle activity",
        mode: "page" as const,
        content: {
          type: "doc",
          content: [
            {
              type: "plus_private_block",
              attrs: { id: "plusblock001", privateAnswer: "canonical-only" },
            },
          ],
        },
      },
    };
    const saved = await services.artifactPersistence.saveArtifact(bundle);
    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) throw new Error("expected Moodle artifact save to succeed");
    expect(saved.value).toEqual({
      artifactRevision: "revision-2",
    });
    expect(mocks.moodleCall).toHaveBeenCalledWith("mod_scaffold_save_content", {
      cmid: 42,
      artifactjson: JSON.stringify(bundle.artifact),
    });
    expect(services.media).toBe(mocks.media);
    const publicationStatus = await services.learnerPublication.getStatus();
    expect(publicationStatus.isOk()).toBe(true);
    if (publicationStatus.isErr()) throw new Error("expected publication status to load");
    expect(publicationStatus.value).toBe(initialStatus);
    expect(services.learnerPublication.publish).toBeTypeOf("function");
    expect(services).not.toHaveProperty("assessment");
  });

  it.each([
    {
      errorCode: "invalidparameter",
      message: "Invalid parameter value detected",
      debugInfo: "artifactjson must be a JSON object",
      exceptionName: "invalid_parameter_exception",
    },
    {
      errorCode: "nopermissions",
      message: "Sorry, but you do not currently have permissions to do that",
      debugInfo: null,
      exceptionName: "required_capability_exception",
    },
  ])("returns an actionable write failure for Moodle save code $errorCode", async (service) => {
    const cause = new mocks.MoodleServiceError(service.message, service);
    mocks.moodleCall.mockRejectedValueOnce(cause);
    const result = await createMoodleArtifactPersistence(42).saveArtifact({
      artifact: {
        id: "moodle-cm-42",
        title: "Moodle activity",
        mode: "page",
        content: { type: "doc", content: [] },
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected Moodle artifact save to fail");
    expect(result.error).toEqual({
      reason: "write-aborted",
      artifactId: "moodle-cm-42",
      cause,
    });
  });

  it("keeps an unknown Moodle service failure observable", async () => {
    const defect = new mocks.MoodleServiceError("Database write failed", {
      errorCode: "dmlwriteexception",
      debugInfo: "Unexpected storage failure",
      exceptionName: "dml_write_exception",
    });
    mocks.moodleCall.mockRejectedValueOnce(defect);

    await expect(
      createMoodleArtifactPersistence(42).saveArtifact({
        artifact: {
          id: "moodle-cm-42",
          title: "Moodle activity",
          mode: "page",
          content: { type: "doc", content: [] },
        },
      }),
    ).rejects.toBe(defect);
  });

  it("keeps unexpected Moodle persistence defects observable", async () => {
    const defect = new Error("broken Moodle bridge invariant");
    mocks.moodleCall.mockRejectedValueOnce(defect);

    await expect(
      createMoodleArtifactPersistence(42).saveArtifact({
        artifact: {
          id: "moodle-cm-42",
          title: "Moodle activity",
          mode: "page",
          content: { type: "doc", content: [] },
        },
      }),
    ).rejects.toBe(defect);
  });
});
