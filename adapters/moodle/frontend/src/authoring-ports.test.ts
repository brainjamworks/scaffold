import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  media: {
    resolve: vi.fn(),
    list: vi.fn(),
    upload: vi.fn(),
  },
  moodleCall: vi.fn(async () => ({ success: true })),
  createMoodleRuntimePorts: vi.fn(),
}));

vi.mock("./api", () => ({
  moodleCall: mocks.moodleCall,
}));

vi.mock("./ports", () => ({
  createMoodleRuntimePorts: mocks.createMoodleRuntimePorts,
}));

import { createMoodleAuthoringHostServices } from "./authoring-ports";

describe("createMoodleAuthoringHostServices", () => {
  it("exposes stable creation metadata with persistence and media", async () => {
    mocks.createMoodleRuntimePorts.mockReturnValue({
      media: mocks.media,
      assessment: { type: "runtime" },
    });

    const services = createMoodleAuthoringHostServices(42, {
      id: "moodle-cm-42",
      title: "Moodle activity",
    });

    expect(mocks.createMoodleRuntimePorts).toHaveBeenCalledWith(42);
    await expect(
      services.artifactCreation.createArtifactMetadata({ mode: "page" }),
    ).resolves.toEqual({ id: "moodle-cm-42", title: "Moodle activity" });
    await expect(
      services.artifactCreation.createArtifactMetadata({ mode: "slideshow" }),
    ).resolves.toEqual({ id: "moodle-cm-42", title: "Moodle activity" });
    const bundle = {
      artifact: {
        id: "moodle-cm-42",
        title: "Moodle activity",
        mode: "page" as const,
        content: { type: "doc", content: [] },
      },
      learnerContent: { type: "doc", content: [] },
      assessmentTargets: [],
      assessmentGroups: [],
    };
    await services.artifactPersistence.saveArtifact(bundle);
    expect(mocks.moodleCall).toHaveBeenCalledWith("mod_scaffold_save_content", {
      cmid: 42,
      artifactjson: JSON.stringify(bundle.artifact),
      learnercontentjson: JSON.stringify(bundle.learnerContent),
      assessmenttargetsjson: "[]",
      assessmentgroupsjson: "[]",
    });
    expect(services.media).toBe(mocks.media);
    expect(services).not.toHaveProperty("assessment");
  });
});
