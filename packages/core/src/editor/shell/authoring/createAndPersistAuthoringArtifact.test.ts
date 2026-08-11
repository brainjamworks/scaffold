import { describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import type { ArtifactSavePayload } from "@/host/ports";

import { createScaffoldAuthoringAppEnvironment } from "./ScaffoldAuthoringApp";
import { createAndPersistAuthoringArtifact } from "./createAndPersistAuthoringArtifact";

describe("createAndPersistAuthoringArtifact", () => {
  it("returns the creation Save revision with the host-normalized artifact", async () => {
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({
      artifactRevision: "revision-created",
      artifact: { title: "Host-normalized title" },
    }));
    const application = createScaffoldApplication();

    const result = await createAndPersistAuthoringArtifact({
      mode: "page",
      productAccess: { scaffoldPlusAuthorized: false },
      services: {
        artifactCreation: {
          createArtifactMetadata: async () => ({
            id: "artifact-created",
            requiresScaffoldPlus: false,
            title: "Local title",
          }),
        },
        artifactPersistence: { saveArtifact },
        learnerPublication: {
          getStatus: vi.fn(),
          publish: vi.fn(),
        },
        media: null,
      },
      authoringEnvironment: createScaffoldAuthoringAppEnvironment(application),
    });

    expect(result).toMatchObject({
      artifact: {
        id: "artifact-created",
        mode: "page",
        title: "Host-normalized title",
      },
      artifactRevision: "revision-created",
    });
    expect(saveArtifact.mock.calls[0]?.[0].artifact.title).toBe("Local title");
  });

  it("persists a slideshow with the default initial Course Section title", async () => {
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({
      artifactRevision: "revision-created",
      artifact: null,
    }));
    const application = createScaffoldApplication();

    await createAndPersistAuthoringArtifact({
      mode: "slideshow",
      productAccess: { scaffoldPlusAuthorized: false },
      services: {
        artifactCreation: {
          createArtifactMetadata: async () => ({
            id: "artifact-created",
            requiresScaffoldPlus: false,
            title: "Different artifact title",
          }),
        },
        artifactPersistence: { saveArtifact },
        learnerPublication: { getStatus: vi.fn(), publish: vi.fn() },
        media: null,
      },
      authoringEnvironment: createScaffoldAuthoringAppEnvironment(application),
    });

    expect(saveArtifact.mock.calls[0]?.[0].artifact.content.content?.[0]?.content?.[0]).toMatchObject({
      type: "courseSection",
      attrs: { title: "Section 1" },
    });
  });
});
