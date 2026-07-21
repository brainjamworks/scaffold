// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ArtifactSaveBundle } from "@/host/ports";

const mocks = vi.hoisted(() => ({
  creationFormatModuleReads: 0,
  creationPublicationModuleReads: 0,
  readyModuleReads: 0,
}));

vi.mock("./ScaffoldAuthoringApp", async () => {
  const { createElement } = await import("react");
  mocks.readyModuleReads += 1;
  return {
    ScaffoldAuthoringApp: ({ artifact }: { artifact: { title: string } }) =>
      createElement("section", { "data-testid": "ready-authoring-app" }, artifact.title),
  };
});

vi.mock("@/format/artifact", () => {
  mocks.creationFormatModuleReads += 1;
  return {
    createScaffoldArtifact: ({
      id,
      mode,
      title,
    }: {
      id: string;
      mode: "page" | "slideshow";
      title: string;
    }) => ({
      id,
      mode,
      title,
      content: { type: "doc", content: [] },
    }),
  };
});

vi.mock("@/authoring/publication/artifact-save-bundle", () => {
  mocks.creationPublicationModuleReads += 1;
  return {
    projectArtifactSaveBundle: ({ artifact }: { artifact: unknown }) => ({
      artifact,
      assessmentGroups: [],
      assessmentTargets: [],
      learnerContent: { type: "doc", content: [] },
    }),
    validateArtifactSaveBundleSize: vi.fn(),
  };
});

import { ScaffoldAuthoringEntry } from "./ScaffoldAuthoringEntry";

type EntryProps = Parameters<typeof ScaffoldAuthoringEntry>[0];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
  saveArtifact = vi.fn(async (_bundle: ArtifactSaveBundle) => undefined),
  headerActions,
}: {
  artifact?: EntryProps["artifact"];
  createArtifactMetadata?: EntryProps["services"]["artifactCreation"]["createArtifactMetadata"];
  saveArtifact?: EntryProps["services"]["artifactPersistence"]["saveArtifact"];
  headerActions?: EntryProps["headerActions"];
} = {}) {
  return render(
    <ScaffoldAuthoringEntry
      artifact={artifact}
      services={{
        artifactCreation: { createArtifactMetadata },
        artifactPersistence: { saveArtifact },
        media: null,
      }}
      {...(headerActions ? { headerActions } : {})}
    />,
  );
}

describe("ScaffoldAuthoringEntry loading boundary", () => {
  it("leaves ready editor and artifact creation unevaluated for a null artifact", () => {
    renderEntry();

    expect(screen.getByTestId("document-creation-gate")).toBeInTheDocument();
    expect(mocks.readyModuleReads).toBe(0);
    expect(mocks.creationFormatModuleReads).toBe(0);
    expect(mocks.creationPublicationModuleReads).toBe(0);
  });

  it("starts both capabilities together and waits for persistence before mounting", async () => {
    const user = userEvent.setup();
    const metadata = createDeferred<{ id: string; title?: string }>();
    const persistence = createDeferred<{ artifact?: { title?: string } }>();
    const createArtifactMetadata = vi.fn(() => metadata.promise);
    const saveArtifact = vi.fn((_: ArtifactSaveBundle) => persistence.promise);

    renderEntry({ createArtifactMetadata, saveArtifact });
    await user.click(screen.getByRole("button", { name: "Create page" }));

    await waitFor(() => {
      expect(mocks.readyModuleReads).toBe(1);
      expect(mocks.creationFormatModuleReads).toBe(1);
      expect(mocks.creationPublicationModuleReads).toBe(1);
    });
    expect(createArtifactMetadata).toHaveBeenCalledWith({ mode: "page" });
    expect(screen.queryByTestId("ready-authoring-app")).toBeNull();

    act(() => metadata.resolve({ id: "created-page", title: "Local title" }));
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("ready-authoring-app")).toBeNull();

    act(() => persistence.resolve({ artifact: { title: "Host title" } }));

    expect(await screen.findByTestId("ready-authoring-app")).toHaveProperty(
      "textContent",
      "Host title",
    );
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
  });
});
