// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import type { ArtifactSavePayload, ArtifactSaveResult, LearnerPublicationPort } from "@/host/ports";
import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";

const mocks = vi.hoisted(() => ({
  creationFormatModuleReads: 0,
  creationPublicationModuleReads: 0,
  creationArtifactInputs: [] as Array<Record<string, unknown>>,
  preparedProductAccess: [] as unknown[],
  readyModuleReads: 0,
  readyApplications: [] as unknown[],
  readyInitialSavedRevisions: [] as Array<string | null>,
}));

vi.mock("./ScaffoldAuthoringApp", async () => {
  const { createElement } = await import("react");
  mocks.readyModuleReads += 1;
  return {
    createScaffoldAuthoringAppEnvironment: () => ({}),
    ScaffoldAuthoringAppForEntry: ({
      application,
      artifact,
      initialSavedArtifactRevision,
    }: {
      application: unknown;
      artifact: { title: string };
      initialSavedArtifactRevision: string | null;
    }) => {
      mocks.readyApplications.push(application);
      mocks.readyInitialSavedRevisions.push(initialSavedArtifactRevision);
      return createElement("section", { "data-testid": "ready-authoring-app" }, artifact.title);
    },
  };
});

vi.mock("@/format/artifact", () => {
  mocks.creationFormatModuleReads += 1;
  return {
    createScaffoldArtifact: ({
      id,
      mode,
      requiresScaffoldPlus,
      title,
    }: {
      id: string;
      mode: "page" | "slideshow";
      requiresScaffoldPlus: boolean;
      title: string;
    }) => {
      mocks.creationArtifactInputs.push({ id, mode, requiresScaffoldPlus, title });
      return {
        id,
        mode,
        title,
        content: { type: "doc", content: [] },
      };
    },
  };
});

vi.mock("@/document/authoring/prepare-scaffold-artifact-for-authoring", () => ({
  prepareScaffoldArtifactForAuthoring: (
    artifact: unknown,
    _environment: unknown,
    productAccess: unknown,
  ) => {
    mocks.preparedProductAccess.push(productAccess);
    return {
      status: "supported",
      artifact,
      unavailableContent: [],
      source: "stored",
    };
  },
}));

vi.mock("@/authoring/publication/artifact-save-bundle", () => {
  mocks.creationPublicationModuleReads += 1;
  return {
    createArtifactSavePayload: ({ artifact }: { artifact: unknown }) => ({ artifact }),
  };
});

import { ScaffoldAuthoringEntry } from "./ScaffoldAuthoringEntry";

type EntryProps = Parameters<typeof ScaffoldAuthoringEntry>[0];
const testApplication = createScaffoldApplication();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.readyApplications.length = 0;
  mocks.readyInitialSavedRevisions.length = 0;
  mocks.creationArtifactInputs.length = 0;
  mocks.preparedProductAccess.length = 0;
});

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) throw new Error("deferred promise was not initialized");
      resolvePromise(value);
    },
    reject(reason?: unknown) {
      if (!rejectPromise) throw new Error("deferred promise was not initialized");
      rejectPromise(reason);
    },
  };
}

function renderEntry({
  artifact = null,
  createArtifactMetadata = vi.fn(),
  saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({
    artifactRevision: "revision-created",
  })),
  learnerPublication = createLearnerPublicationPort(),
  application = testApplication,
  productAccess = coreProductAccess,
}: {
  artifact?: EntryProps["artifact"];
  createArtifactMetadata?: EntryProps["services"]["artifactCreation"]["createArtifactMetadata"];
  saveArtifact?: EntryProps["services"]["artifactPersistence"]["saveArtifact"];
  learnerPublication?: EntryProps["services"]["learnerPublication"];
  application?: EntryProps["application"];
  productAccess?: EntryProps["productAccess"];
} = {}) {
  return render(
    <ScaffoldAuthoringEntry
      artifact={artifact}
      application={application}
      productAccess={productAccess}
      services={{
        artifactCreation: { createArtifactMetadata },
        artifactPersistence: { saveArtifact },
        learnerPublication,
        media: null,
      }}
    />,
  );
}

describe("ScaffoldAuthoringEntry loading boundary", () => {
  it("shows Scaffold identity and the App colour-mode control at document creation", () => {
    const { container } = renderEntry();

    expect(container.querySelector("[data-scaffold-wordmark]")).not.toBeNull();
    expect(
      screen.getByRole("button", {
        name: /Switch authoring application to (dark|light) mode/,
      }),
    ).toBeInTheDocument();
  });

  it("leaves ready editor and artifact creation unevaluated for a null artifact", () => {
    renderEntry();

    expect(screen.getByTestId("document-creation-gate")).toBeInTheDocument();
    expect(mocks.readyModuleReads).toBe(0);
    expect(mocks.creationFormatModuleReads).toBe(0);
    expect(mocks.creationPublicationModuleReads).toBe(0);
  });

  it("renders the editor loading state inside the App theme", () => {
    renderEntry({
      artifact: {
        id: "existing-page",
        mode: "page",
        title: "Existing page",
        content: { type: "doc", content: [] },
      },
    });

    const loading = screen.getByRole("status", { name: "Opening editor" });
    expect(loading.closest(".sc-app")).not.toBeNull();
  });

  it("starts both capabilities together and waits for persistence before mounting", async () => {
    const user = userEvent.setup();
    const metadata = createDeferred<{
      id: string;
      requiresScaffoldPlus: boolean;
      title?: string;
    }>();
    const persistence = createDeferred<ArtifactSaveResult>();
    const createArtifactMetadata = vi.fn(() => metadata.promise);
    const saveArtifact = vi.fn((_: ArtifactSavePayload) => persistence.promise);

    const application = createScaffoldApplication();
    renderEntry({ application, createArtifactMetadata, saveArtifact });
    await user.click(screen.getByRole("button", { name: "Create page" }));

    await waitFor(() => {
      expect(mocks.readyModuleReads).toBe(1);
      expect(mocks.creationFormatModuleReads).toBe(1);
      expect(mocks.creationPublicationModuleReads).toBe(1);
    });
    expect(createArtifactMetadata).toHaveBeenCalledWith({ mode: "page" });
    expect(screen.queryByTestId("ready-authoring-app")).toBeNull();

    act(() =>
      metadata.resolve({
        id: "created-page",
        requiresScaffoldPlus: false,
        title: "Local title",
      }),
    );
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    expect(saveArtifact.mock.calls[0]?.[0]).not.toHaveProperty("learnerContent");
    expect(mocks.creationArtifactInputs).toEqual([
      {
        id: "created-page",
        mode: "page",
        requiresScaffoldPlus: false,
        title: "Local title",
      },
    ]);
    expect(mocks.preparedProductAccess).toEqual([coreProductAccess]);
    expect(screen.queryByTestId("ready-authoring-app")).toBeNull();

    act(() =>
      persistence.resolve({
        artifactRevision: "revision-created",
        artifact: { title: "Host title" },
      }),
    );

    expect(await screen.findByTestId("ready-authoring-app")).toHaveProperty(
      "textContent",
      "Host title",
    );
    expect(mocks.readyApplications).toEqual([application]);
    expect(mocks.readyInitialSavedRevisions).toEqual(["revision-created"]);
  });

  it("accepts only one complete application configuration at the top prop surface", () => {
    expectTypeOf<"composition" extends keyof EntryProps ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<"runtime" extends keyof EntryProps ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<"capabilities" extends keyof EntryProps ? true : false>().toEqualTypeOf<false>();
  });

  it("loads the ready capability for an existing artifact", async () => {
    renderEntry({
      artifact: {
        id: "existing-page",
        title: "Existing page",
        mode: "page",
        content: { type: "doc", content: [] },
      },
    });

    expect(await screen.findByTestId("ready-authoring-app")).toHaveProperty(
      "textContent",
      "Existing page",
    );
    expect(mocks.readyInitialSavedRevisions).toEqual([null]);
  });
});

function createLearnerPublicationPort(): LearnerPublicationPort {
  return {
    getStatus: vi.fn(async () => ({
      currentArtifactRevision: "revision-created",
      publishedArtifactRevision: null,
      publishedAt: null,
    })),
    publish: vi.fn(),
  };
}
