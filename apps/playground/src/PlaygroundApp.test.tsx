// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createScaffoldDocumentContent } from "@scaffold/core/format";
import type { ArtifactSaveBundle } from "@scaffold/core/ports";
import type { StoredArtifact } from "./ports/browserStorageDb";

interface BrowserPreviewProjection {
  learnerContent: JSONContent;
  assessmentGroups: unknown[];
  assessmentTargets: unknown[];
}

const mocks = vi.hoisted(() => {
  return {
    authoringAppProps: [] as Array<Record<string, unknown>>,
    assessmentModuleReads: 0,
    learnerPreviewContent: {} as BrowserPreviewProjection,
    loadArtifact: vi.fn(async (): Promise<StoredArtifact | null> => null),
    previewProjectionReaders: [] as Array<() => unknown>,
    previewAssessmentPorts: [] as Array<{ type: string; projectionIndex: number }>,
    requestPersistentStorage: vi.fn(async () => false),
    saveArtifact: vi.fn(async (_bundle: ArtifactSaveBundle) => ({})),
  };
});

vi.mock("@scaffold/core/authoring", async () => {
  const React = await import("react");
  const { createElement, useState } = React;

  return {
    ScaffoldAuthoringEntry: (props: Record<string, unknown>) => {
      const [preview, setPreview] = useState(false);
      const [createdArtifact, setCreatedArtifact] = useState<unknown>(null);
      const artifact = (createdArtifact ?? props["artifact"]) as {
        id?: string;
        title?: string;
      } | null;
      mocks.authoringAppProps.push({ ...props, artifact });

      async function createPage() {
        const services = props["services"] as {
          artifactCreation?: {
            createArtifactMetadata?: (input: { mode: "page" }) => Promise<unknown>;
          };
        };
        const metadata = await services.artifactCreation?.createArtifactMetadata?.({
          mode: "page",
        });
        setCreatedArtifact(metadata ?? null);
      }

      if (!artifact) {
        return createElement(
          "section",
          { "data-testid": "document-creation-gate" },
          createElement(
            "button",
            {
              type: "button",
              "aria-label": "Create page",
              onClick: createPage,
            },
            "Create page",
          ),
        );
      }

      async function togglePreview() {
        const nextPreview = !preview;
        if (nextPreview && typeof props["createPreviewServices"] === "function") {
          await props["createPreviewServices"](mocks.learnerPreviewContent);
        }
        setPreview(nextPreview);
      }

      const title = artifact.title ?? "";
      const headerActions =
        typeof props["headerActions"] === "function"
          ? props["headerActions"]({
              preview,
              saveNow: async () => true,
              saveState: "idle",
              title,
            })
          : null;

      return createElement(
        "div",
        { "data-testid": "scaffold-authoring-app" },
        createElement(
          "header",
          null,
          createElement("h1", null, title),
          headerActions as ReactNode,
          !preview
            ? createElement(
                "button",
                {
                  type: "button",
                  "aria-label": props["agentOpen"] ? "Hide Scaffold Agent" : "Show Scaffold Agent",
                  onClick: () => {
                    if (typeof props["onAgentOpenChange"] === "function") {
                      props["onAgentOpenChange"](!props["agentOpen"]);
                    }
                  },
                },
                "Agent",
              )
            : null,
          createElement(
            "button",
            {
              type: "button",
              "aria-label": preview ? "Switch to editing" : "Switch to preview",
              onClick: togglePreview,
            },
            preview ? "Edit" : "Preview",
          ),
        ),
        preview
          ? createElement("section", {
              "data-testid": "scaffold-runtime-host",
            })
          : createElement(
              "section",
              { "data-testid": "content-author-workspace" },
              createElement("div", { "data-testid": "toolbar" }),
              createElement("div", { "data-testid": "course-document-editor" }),
              createElement("div", { "data-testid": "block-strip" }),
              props["agentOpen"]
                ? createElement("div", {
                    "data-testid": "authoring-agent-dock",
                  })
                : null,
            ),
      );
    },
  };
});

vi.mock("./ports/browserPersistencePort", () => ({
  browserPersistencePort: {
    loadArtifact: mocks.loadArtifact,
    saveArtifact: mocks.saveArtifact,
  },
}));

vi.mock("./ports/browserMediaPort", () => ({
  browserMediaPort: { resolve: vi.fn() },
}));

vi.mock("./ports/createLocalAssessmentPort", () => {
  mocks.assessmentModuleReads += 1;
  return {
    createLocalAssessmentPortFromProjection: vi.fn((readProjection) => {
      mocks.previewProjectionReaders.push(readProjection);
      const port = {
        type: "preview",
        projectionIndex: mocks.previewAssessmentPorts.length,
      };
      mocks.previewAssessmentPorts.push(port);
      return port;
    }),
  };
});

vi.mock("./ports/local-artifact-id", () => ({
  LOCAL_ARTIFACT_ID: "local-artifact",
}));

vi.mock("./ports/browserStorageDb", () => ({
  requestPersistentStorage: mocks.requestPersistentStorage,
}));

import { PlaygroundApp } from "./PlaygroundApp";

beforeEach(() => {
  mocks.learnerPreviewContent = createLearnerPreviewContent();
});

afterEach(() => {
  cleanup();
  mocks.authoringAppProps.length = 0;
  mocks.previewAssessmentPorts.length = 0;
  mocks.previewProjectionReaders.length = 0;
  vi.clearAllMocks();
});

function storedArtifact(id = "shell-doc", title = "Stored draft"): StoredArtifact {
  return {
    artifact: {
      id,
      title,
      mode: "page",
      content: mocks.learnerPreviewContent.learnerContent,
    },
    savedAt: "2026-06-27T12:00:00.000Z",
  };
}

function createLearnerPreviewContent(): BrowserPreviewProjection {
  return {
    learnerContent: pageDocumentWithParagraph("surface-1", "Learner draft"),
    assessmentGroups: [],
    assessmentTargets: [],
  };
}

function pageDocumentWithParagraph(surfaceId: string, text: string): JSONContent {
  const document = createScaffoldDocumentContent({
    mode: "page",
    surfaceId,
  });
  const surface = document.content?.[0]?.content?.[0];
  if (!surface) {
    throw new Error("expected default page surface");
  }
  surface.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ];
  return document;
}

describe("PlaygroundApp preview boundary", () => {
  it("does not evaluate local assessment grading during an ordinary mount", async () => {
    mocks.loadArtifact.mockResolvedValueOnce(storedArtifact());

    render(<PlaygroundApp artifactId="shell-doc" />);

    await screen.findByTestId("content-author-workspace");

    expect(mocks.assessmentModuleReads).toBe(0);
  });

  it("shows the Agent button without an active Agent service", async () => {
    mocks.loadArtifact.mockResolvedValueOnce(storedArtifact());

    render(<PlaygroundApp artifactId="shell-doc" />);

    await waitFor(() => expect(mocks.loadArtifact).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("button", { name: "Show Scaffold Agent" })).toBeInTheDocument();
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();
    expect(
      Object.keys(mocks.authoringAppProps.at(-1)?.["services"] as Record<string, unknown>).sort(),
    ).toEqual(["artifactCreation", "artifactPersistence", "media"]);
  });

  it("mounts the authoring host with rails and opens the unavailable Agent dock", async () => {
    const user = userEvent.setup();
    mocks.loadArtifact.mockResolvedValueOnce(storedArtifact());

    render(<PlaygroundApp artifactId="shell-doc" />);

    await waitFor(() => expect(mocks.loadArtifact).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("content-author-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("block-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show Scaffold Agent" }));

    expect(screen.getByTestId("authoring-agent-dock")).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-runtime-host")).toBeNull();
    expect(mocks.authoringAppProps.at(-1)?.["artifact"]).toMatchObject({
      id: "shell-doc",
      title: "Stored draft",
    });
  });

  it("passes stored artifacts through to the authoring entry", async () => {
    mocks.loadArtifact.mockResolvedValueOnce(storedArtifact());

    render(<PlaygroundApp artifactId="shell-doc" />);

    await waitFor(() => expect(mocks.loadArtifact).toHaveBeenCalledTimes(1));

    expect(mocks.authoringAppProps.at(-1)?.["artifact"]).toMatchObject({
      id: "shell-doc",
      title: "Stored draft",
      mode: "page",
      content: mocks.learnerPreviewContent.learnerContent,
    });
  });

  it("provides browser-local artifact metadata before mounting authoring when storage is empty", async () => {
    const user = userEvent.setup();

    render(<PlaygroundApp artifactId="shell-doc" />);

    await waitFor(() => expect(mocks.loadArtifact).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("document-creation-gate")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create page" }));

    expect(screen.getByTestId("content-author-workspace")).toBeInTheDocument();
    expect(mocks.authoringAppProps.at(-1)?.["artifact"]).toMatchObject({
      id: "shell-doc",
      title: "Untitled",
    });
    expect(mocks.saveArtifact).not.toHaveBeenCalled();
  });

  it("mounts the runtime host, not authoring chrome, in preview mode", async () => {
    const user = userEvent.setup();
    mocks.loadArtifact.mockResolvedValueOnce(storedArtifact());

    render(<PlaygroundApp artifactId="shell-doc" />);

    await waitFor(() => expect(mocks.authoringAppProps.length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));

    expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument();
    expect(screen.queryByTestId("content-author-workspace")).toBeNull();
    expect(screen.queryByTestId("toolbar")).toBeNull();
    expect(screen.queryByTestId("block-strip")).toBeNull();
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();
    expect(screen.queryByRole("button", { name: /Scaffold Agent/ })).toBeNull();

    expect(mocks.previewProjectionReaders.at(-1)?.()).toBe(mocks.learnerPreviewContent);
  });

  it("switches back to authoring against the same artifact", async () => {
    const user = userEvent.setup();
    mocks.loadArtifact.mockResolvedValueOnce(storedArtifact());

    render(<PlaygroundApp artifactId="shell-doc" />);

    await waitFor(() => expect(mocks.authoringAppProps.length).toBeGreaterThan(0));
    const firstArtifact = mocks.authoringAppProps.at(-1)?.["artifact"];

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to editing" }));

    expect(screen.getByTestId("content-author-workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-runtime-host")).toBeNull();
    expect(mocks.authoringAppProps.at(-1)?.["artifact"]).toBe(firstArtifact);
  });

  it("reuses the grading module while creating a fresh port from each preview", async () => {
    const user = userEvent.setup();
    mocks.loadArtifact.mockResolvedValueOnce(storedArtifact());
    const firstProjection = mocks.learnerPreviewContent;

    render(<PlaygroundApp artifactId="shell-doc" />);

    await screen.findByTestId("content-author-workspace");
    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await screen.findByTestId("scaffold-runtime-host");
    await user.click(screen.getByRole("button", { name: "Switch to editing" }));

    const secondProjection = createLearnerPreviewContent();
    secondProjection.learnerContent = pageDocumentWithParagraph(
      "surface-2",
      "Latest learner draft",
    );
    mocks.learnerPreviewContent = secondProjection;
    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await screen.findByTestId("scaffold-runtime-host");

    expect(mocks.assessmentModuleReads).toBe(1);
    expect(mocks.previewAssessmentPorts).toHaveLength(2);
    expect(mocks.previewAssessmentPorts[0]).not.toBe(mocks.previewAssessmentPorts[1]);
    expect(mocks.previewProjectionReaders[0]?.()).toBe(firstProjection);
    expect(mocks.previewProjectionReaders[1]?.()).toBe(secondProjection);
  });
});
