// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
} from "@/composition/application/create-scaffold-application";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { defineBlock } from "@/editor/blocks/block-definition";
import { McqAuthoringExtension } from "@/editor/blocks/assessment/mcq/mcq-authoring-extension";
import { McqRuntimeExtension } from "@/editor/blocks/assessment/mcq/mcq-runtime-extension";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldUnavailableAgentIntegration } from "@/editor/shell/agent/ScaffoldUnavailableAgentIntegration";
import type { ScaffoldAgentIntegration } from "@/editor/shell/agent/agent-integration";
import type { ArtifactSaveBundle } from "@/host/ports";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

const mocks = vi.hoisted(() => {
  return {
    authorJSON: {} as JSONContent,
    blockStripProps: [] as Array<Record<string, unknown>>,
    fakeEditor: {
      getJSON: vi.fn(),
      storage: {} as Record<string, unknown>,
      state: {
        doc: {
          firstChild: {
            attrs: {} as Record<string, unknown>,
          },
        },
      },
    },
    learnerModuleReads: 0,
    learnerAppProps: [] as Array<Record<string, unknown>>,
    contentAuthorHostProps: [] as Array<Record<string, unknown>>,
    contentAuthorHostRenderCount: 0,
    savedBundles: [] as Array<ArtifactSaveBundle>,
  };
});

vi.mock("@/editor/shell/chrome/BlockStrip", async () => {
  const React = await import("react");
  const { createElement } = React;

  return {
    BlockStrip: (props: Record<string, unknown>) => {
      mocks.blockStripProps.push(props);
      return createElement("aside", { "data-testid": "block-strip" });
    },
  };
});

vi.mock("@/editor/shell/chrome/Header", async () => {
  const { createElement } = await import("react");

  return {
    Header: ({ actions, title }: { actions?: ReactNode; title: string }) =>
      createElement("header", null, createElement("h1", null, title), actions),
  };
});

vi.mock("@/editor/shell/chrome/Toolbar", async () => {
  const { createElement } = await import("react");

  return {
    Toolbar: () => createElement("aside", { "data-testid": "toolbar" }),
  };
});

vi.mock("./ContentAuthorHost", async () => {
  const React = await import("react");
  const { createElement, useEffect } = React;

  return {
    ContentAuthorHost: ({
      agentIntegration,
      agentOpen,
      content,
      composition,
      onAgentClose,
      onChange,
      onEditorReady,
      leftRail,
      onUpdate,
      rightRail,
      courseAppearance,
    }: {
      agentIntegration?: unknown;
      agentOpen?: boolean;
      content?: unknown;
      composition?: unknown;
      onAgentClose?: () => void;
      onChange?: (editor: unknown) => void;
      onEditorReady?: (editor: unknown) => void;
      leftRail?: (editor: unknown) => ReactNode;
      onUpdate?: (content: unknown) => void;
      rightRail?: (editor: unknown) => ReactNode;
      courseAppearance?: unknown;
    }) => {
      mocks.contentAuthorHostRenderCount += 1;
      mocks.contentAuthorHostProps.push({
        agentIntegration,
        agentOpen,
        content,
        composition,
        leftRail,
        onAgentClose,
        onChange,
        onUpdate,
        courseAppearance,
        rightRail,
      });
      useEffect(() => {
        onEditorReady?.(mocks.fakeEditor);
      }, [onEditorReady]);

      return createElement(
        "section",
        { "data-testid": "content-author-host" },
        rightRail?.(mocks.fakeEditor),
        agentOpen
          ? createElement(
              "aside",
              { "data-testid": "authoring-agent-dock" },
              createElement(
                "button",
                { type: "button", onClick: onAgentClose },
                "Close Scaffold Agent",
              ),
            )
          : null,
      );
    },
  };
});

vi.mock("@/runtime/app/ScaffoldLearnerApp", async () => {
  const React = await import("react");
  const { createElement } = React;

  const ScaffoldLearnerApp = (props: Record<string, unknown>) => {
    mocks.learnerAppProps.push(props);
    return createElement("section", {
      "data-testid": "scaffold-learner-app",
    });
  };

  return {
    get ScaffoldLearnerApp() {
      mocks.learnerModuleReads += 1;
      return ScaffoldLearnerApp;
    },
  };
});

const testApplication = createScaffoldApplication();
const PRIVATE_ASSESSMENT_NODE_TYPE = "private_assessment_fixture";
const coreMcqDefinition = builtInBlockRegistry.getByNodeType("mcq");
if (!coreMcqDefinition?.capabilities?.assessment || !coreMcqDefinition.insert) {
  throw new Error("expected installed Core MCQ definition");
}
const privateAssessmentDefinition = defineBlock({
  ...coreMcqDefinition,
  nodeType: PRIVATE_ASSESSMENT_NODE_TYPE,
  capabilities: {
    ...coreMcqDefinition.capabilities,
    assessment: {
      ...coreMcqDefinition.capabilities.assessment,
      projection: {
        projectInteraction: () => ({
          kind: "single-select" as const,
          options: [{ id: "option000001", label: "Private option" }],
        }),
        projectAssessment: () => ({
          kind: "single-select" as const,
          correctOptionId: "option000001",
          feedbackByOptionId: {},
        }),
        projectLearnerNode: (node) => ({
          ...node,
          attrs: { id: node.attrs?.["id"], settings: node.attrs?.["settings"] },
        }),
      },
    },
  },
  insert: {
    ...coreMcqDefinition.insert,
    id: "private-assessment-fixture",
    content: () => ({ type: PRIVATE_ASSESSMENT_NODE_TYPE }),
  },
});
const privateAssessmentApplication = createScaffoldApplication({
  packs: [
    defineScaffoldExtensionPack({
      id: "private-assessment-fixture",
      blocks: [
        {
          definition: privateAssessmentDefinition,
          authoringExtension: McqAuthoringExtension.extend({ name: PRIVATE_ASSESSMENT_NODE_TYPE }),
          runtimeExtension: McqRuntimeExtension.extend({ name: PRIVATE_ASSESSMENT_NODE_TYPE }),
        },
      ],
    }),
  ],
});
Object.assign(mocks.fakeEditor.storage, {
  scaffoldAuthoringCatalogues: Object.freeze({
    catalogues: testApplication.authoring.catalogues,
  }),
  scaffoldCapabilities: Object.freeze({
    capabilities: testApplication.capabilities,
  }),
});

import { ScaffoldAuthoringApp } from "./ScaffoldAuthoringApp";
import { ScaffoldAuthoringEntry } from "./ScaffoldAuthoringEntry";

beforeEach(() => {
  localStorage.clear();
  mocks.authorJSON = pageDocumentWithParagraph("authorsurf01", "Author");
  mocks.fakeEditor.getJSON.mockImplementation(() => mocks.authorJSON);
  mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content?.[0]?.attrs ?? {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  mocks.learnerAppProps.length = 0;
  mocks.blockStripProps.length = 0;
  mocks.contentAuthorHostProps.length = 0;
  mocks.contentAuthorHostRenderCount = 0;
  mocks.savedBundles.length = 0;
  vi.clearAllMocks();
});

function firstSurfaceAttrs(content: unknown): Record<string, unknown> | null {
  const doc = content as {
    content?: Array<{
      content?: Array<{
        attrs?: Record<string, unknown>;
      }>;
    }>;
  };
  return doc.content?.[0]?.content?.[0]?.attrs ?? null;
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
      attrs: { id: "paragraph001" },
      content: [{ type: "text", text }],
    },
  ];
  return document;
}

function slideshowDocument(surfaceId: string): JSONContent {
  return createScaffoldDocumentContent({ mode: "slideshow", surfaceId });
}

function privateAssessmentDocument(): JSONContent {
  const document = createScaffoldDocumentContent({ mode: "page", surfaceId: "privatesurf1" });
  const surface = document.content?.[0]?.content?.[0];
  if (!surface) throw new Error("expected default page Surface");
  surface.content = [
    {
      type: PRIVATE_ASSESSMENT_NODE_TYPE,
      attrs: {
        id: "privassess01",
        settings: {},
        assessment: { privateAnswer: "must-not-reach-preview" },
      },
    },
  ];
  return document;
}

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

describe("ScaffoldAuthoringApp preview", () => {
  it("synchronizes the live persisted theme from every editor document update", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-live-theme",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );
    const onChange = mocks.contentAuthorHostProps.at(-1)?.["onChange"] as
      | ((editor: typeof mocks.fakeEditor) => void)
      | undefined;
    expect(onChange).toBeTypeOf("function");

    const unavailableTheme = {
      schemaVersion: 1,
      design: { id: "unavailable-design", revision: "7" },
      colourSystem: { id: "unavailable-colours", revision: "3" },
      overrides: {},
    };
    mocks.authorJSON.content![0]!.attrs!["theme"] = unavailableTheme;
    mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content![0]!.attrs!;
    act(() => onChange?.(mocks.fakeEditor));
    await userEvent.setup().click(screen.getByRole("button", { name: "Open course theme" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved design unavailable-design@7 is unavailable.",
    );
  });

  it("opens the course Theme panel without a separate preview colour mode", async () => {
    const user = userEvent.setup();
    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-theme-panel",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    expect(screen.getByRole("dialog", { name: "Course theme" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Course preview colours" })).toBeNull();
  });

  it("toggles and remembers the authoring application colour mode", async () => {
    const user = userEvent.setup();
    const props = {
      application: testApplication,
      artifact: {
        id: "artifact-colour-mode",
        title: "Draft",
        mode: "page" as const,
        content: mocks.authorJSON,
      },
      services: {
        artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
        media: null,
      },
    };
    const first = render(<ScaffoldAuthoringApp {...props} />);
    const application = document.querySelector<HTMLElement>(".sc-scaffold-authoring-app");

    expect(application).toHaveAttribute("data-scaffold-color-mode", "light");
    await waitFor(() =>
      expect(application?.querySelector("[data-scaffold-overlay-host]")).toBeInTheDocument(),
    );
    expect(application?.style.colorScheme).toBe("light");
    const initialCourseTheme = mocks.authorJSON.content?.[0]?.attrs?.["theme"];
    expect(initialCourseTheme).toBeDefined();

    const colorModeToggle = screen.getByRole("button", {
      name: "Switch authoring application to dark mode",
    });
    expect(colorModeToggle).toHaveClass("sc-icon-button");
    expect(colorModeToggle).toHaveTextContent("");
    expect(colorModeToggle).toHaveAttribute("aria-pressed", "false");

    await user.hover(colorModeToggle);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Use dark mode");
    await user.unhover(colorModeToggle);
    await user.click(colorModeToggle);

    expect(application).toHaveAttribute("data-scaffold-color-mode", "dark");
    expect(application?.style.colorScheme).toBe("dark");
    expect(latestCourseAppearance()).toBe("dark");
    expect(localStorage.getItem("scaffold.authoring.color-mode.v1")).toBe("dark");
    expect(mocks.authorJSON.content?.[0]?.attrs?.["theme"]).toEqual(initialCourseTheme);

    first.unmount();
    render(<ScaffoldAuthoringApp {...props} />);
    expect(document.querySelector(".sc-scaffold-authoring-app")).toHaveAttribute(
      "data-scaffold-color-mode",
      "dark",
    );
  });

  it("serializes and saves once only after ordinary typing settles", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => callback());
    const saveArtifact = vi.fn(() => new Promise<Record<string, never>>(() => {}));

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-autosave",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
      />,
    );

    const initialProps = mocks.contentAuthorHostProps.at(-1);
    const onChange = initialProps?.["onChange"] as ((editor: unknown) => void) | undefined;
    expect(onChange).toBeTypeOf("function");
    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    mocks.fakeEditor.getJSON.mockClear();

    act(() => {
      onChange?.(mocks.fakeEditor);
    });
    const rendersAfterDirtyState = mocks.contentAuthorHostRenderCount;
    act(() => {
      onChange?.(mocks.fakeEditor);
      onChange?.(mocks.fakeEditor);
    });

    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    expect(saveArtifact).not.toHaveBeenCalled();
    expect(mocks.contentAuthorHostRenderCount).toBe(rendersAfterDirtyState);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.fakeEditor.getJSON).toHaveBeenCalledTimes(1);
    expect(saveArtifact).toHaveBeenCalledTimes(1);
  });

  it("serializes current editor content for an explicit save", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async (bundle: ArtifactSaveBundle) => {
      mocks.savedBundles.push(bundle);
      return {};
    });

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-explicit-save",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
        headerActions={({ saveNow }) => (
          <button type="button" onClick={() => void saveNow()}>
            Save now
          </button>
        )}
      />,
    );

    mocks.authorJSON = pageDocumentWithParagraph("authorsurf01", "Fresh editor content");
    mocks.fakeEditor.getJSON.mockClear();
    await user.click(screen.getByRole("button", { name: "Save now" }));

    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    expect(mocks.fakeEditor.getJSON).toHaveBeenCalledTimes(1);
    expect(mocks.savedBundles.at(-1)?.artifact.content).toEqual(mocks.authorJSON);
  });

  it("cancels a pending autosave when authoring unmounts", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const saveArtifact = vi.fn(() => new Promise<Record<string, never>>(() => {}));

    const rendered = render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-unmount",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
      />,
    );
    const onChange = mocks.contentAuthorHostProps.at(-1)?.["onChange"] as
      | ((editor: unknown) => void)
      | undefined;
    mocks.fakeEditor.getJSON.mockClear();

    act(() => {
      onChange?.(mocks.fakeEditor);
    });
    rendered.unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it("loads learner preview on demand while projected content is being persisted", async () => {
    const user = userEvent.setup();
    const saveResult = createDeferred<Record<string, never>>();
    const saveArtifact = vi.fn((_bundle: ArtifactSaveBundle) => saveResult.promise);
    mocks.authorJSON = privateAssessmentDocument();

    expect(mocks.learnerModuleReads).toBe(0);

    render(
      <ScaffoldAuthoringApp
        application={privateAssessmentApplication}
        artifact={{
          id: "artifact-lazy-preview",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    expect(mocks.contentAuthorHostProps.at(-1)?.["composition"]).toBe(
      privateAssessmentApplication.authoring,
    );
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    await waitFor(() => expect(mocks.learnerModuleReads).toBe(1));
    expect(saveArtifact).toHaveBeenCalledTimes(1);
    const savedBundle = saveArtifact.mock.calls[0]?.[0];
    expect(savedBundle?.assessmentTargets[0]?.blockType).toBe(PRIVATE_ASSESSMENT_NODE_TYPE);
    expect(JSON.stringify(savedBundle?.learnerContent)).not.toContain("must-not-reach-preview");
    expect(previewButton.textContent).toBe("Preparing...");
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();

    saveResult.resolve({});

    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.learnerAppProps.at(-1)?.["composition"]).toBe(
      privateAssessmentApplication.runtime,
    );

    await user.click(screen.getByRole("button", { name: "Switch to editing" }));
    await screen.findByTestId("content-author-host");
    const nextPreviewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(nextPreviewButton).toHaveProperty("disabled", false));
    await user.click(nextPreviewButton);

    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.learnerModuleReads).toBe(1);
    expect(saveArtifact).toHaveBeenCalledTimes(2);
  });

  it("restores the current session document when returning from learner preview", async () => {
    const user = userEvent.setup();
    const initialContent = structuredClone(mocks.authorJSON);
    const workingContent = structuredClone(initialContent);
    workingContent.content![0]!.attrs!["theme"] = {
      ...createDefaultPersistedCourseTheme(),
      overrides: { design: { roundness: "square" } },
    };
    mocks.authorJSON = workingContent;
    mocks.fakeEditor.state.doc.firstChild.attrs = workingContent.content![0]!.attrs!;

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview-session",
          title: "Draft",
          mode: "page",
          content: initialContent,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);
    await screen.findByTestId("scaffold-learner-app");
    await user.click(screen.getByRole("button", { name: "Switch to editing" }));
    await screen.findByTestId("content-author-host");

    expect(mocks.contentAuthorHostProps.at(-1)?.["content"]).toEqual(workingContent);
  });

  it("shares application mode with the canvas and learner Preview without changing JSON", async () => {
    const user = userEvent.setup();
    localStorage.setItem("scaffold.authoring.color-mode.v1", "dark");
    const initialJSON = JSON.stringify(mocks.authorJSON);
    const props = {
      application: testApplication,
      artifact: {
        id: "artifact-contextual-colour-mode",
        title: "Preview modes",
        mode: "page" as const,
        content: mocks.authorJSON,
      },
      services: {
        artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
        media: null,
      },
      createPreviewServices: vi.fn(() => ({ media: null })),
    };
    const first = render(<ScaffoldAuthoringApp {...props} />);

    expect(document.querySelector(".sc-scaffold-authoring-app")).toHaveAttribute(
      "data-scaffold-color-mode",
      "dark",
    );
    expect(latestCourseAppearance()).toBe("dark");

    await user.click(
      screen.getByRole("button", { name: "Switch authoring application to light mode" }),
    );

    await waitFor(() => {
      expect(latestCourseAppearance()).toBe("light");
    });
    expect(JSON.stringify(mocks.authorJSON)).toBe(initialJSON);
    expect(mocks.authorJSON.content?.[0]?.attrs).not.toHaveProperty("colorMode");

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await waitFor(() => expect(mocks.learnerAppProps.length).toBeGreaterThan(0));
    expect(mocks.learnerAppProps.at(-1)?.["hostColorMode"]).toBe("light");
    expect(JSON.stringify(mocks.authorJSON)).toBe(initialJSON);

    first.unmount();
    mocks.contentAuthorHostProps.length = 0;
    render(<ScaffoldAuthoringApp {...props} />);
    expect(latestCourseAppearance()).toBe("light");
  });

  it("awaits asynchronous preview services before entering preview", async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => undefined);
    const servicesResult = createDeferred<{
      media: null;
      learningEvents: {
        rootActivityId: string;
        accept: typeof accept;
      };
    }>();
    const createPreviewServices = vi.fn(() => servicesResult.promise);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-async-preview-services",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
        createPreviewServices={createPreviewServices}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    await waitFor(() => expect(createPreviewServices).toHaveBeenCalledTimes(1));
    expect(previewButton.textContent).toBe("Preparing...");
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();

    servicesResult.resolve({
      media: null,
      learningEvents: {
        rootActivityId: "https://learning.example.test/artifacts/authoring-preview",
        accept,
      },
    });

    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.learnerAppProps.at(-1)?.["services"]).toEqual({ media: null });
    expect(accept).not.toHaveBeenCalled();
  });

  it("announces an asynchronous preview-service failure and allows retry", async () => {
    const user = userEvent.setup();
    const firstServices = createDeferred<{ media: null }>();
    const createPreviewServices = vi
      .fn<() => Promise<{ media: null }>>()
      .mockReturnValueOnce(firstServices.promise)
      .mockResolvedValueOnce({ media: null });

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview-service-retry",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
        createPreviewServices={createPreviewServices}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);
    firstServices.reject(new Error("preview service unavailable"));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Preview could not be prepared. Try again.",
    );
    expect(screen.getByTestId("content-author-host")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));

    await screen.findByTestId("scaffold-learner-app");
    expect(createPreviewServices).toHaveBeenCalledTimes(2);
  });

  it("keeps keyboard focus on the Preview and Edit action across the transition", async () => {
    const user = userEvent.setup();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview-focus",
          title: "Focused draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    const editButton = await screen.findByRole("button", { name: "Switch to editing" });
    expect(document.activeElement).toBe(editButton);

    await user.click(editButton);

    await screen.findByTestId("content-author-host");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Switch to preview" }));
  });

  it("shows the document creation gate before mounting authoring without an artifact", () => {
    const onEditorReady = vi.fn();

    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          artifactCreation: { createArtifactMetadata: vi.fn() },
          media: null,
        }}
        onEditorReady={onEditorReady}
      />,
    );

    expect(screen.getByTestId("document-creation-gate")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Create document" })).toBeInTheDocument();
    expect(
      screen.getByText("Choose how learners will move through your content."),
    ).toBeInTheDocument();
    expect(screen.getByText("Slideshow (Beta)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Slideshow is currently in beta. You can use it now, but features and layouts may change.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("content-author-host")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("creates an artifact before mounting the editor", async () => {
    const user = userEvent.setup();
    const createArtifactMetadata = vi.fn(async (_input: { mode: "page" | "slideshow" }) => ({
      id: "artifact-new-slideshow",
      title: "Untitled",
    }));
    const saveArtifact = vi.fn(async (_bundle: ArtifactSaveBundle) => ({}));
    const onEditorReady = vi.fn();

    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        services={{
          artifactPersistence: { saveArtifact },
          artifactCreation: { createArtifactMetadata },
          media: null,
        }}
        onEditorReady={onEditorReady}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create slideshow (beta)" }));

    await screen.findByTestId("content-author-host");

    expect(createArtifactMetadata).toHaveBeenCalledWith({ mode: "slideshow" });
    const savedBundle = saveArtifact.mock.calls[0]?.[0];
    if (!savedBundle) {
      throw new Error("artifact creation did not save a bundle");
    }
    expect(savedBundle).toMatchObject({
      artifact: {
        id: "artifact-new-slideshow",
        title: "Untitled",
        mode: "slideshow",
      },
    });
    expect(firstSurfaceAttrs(savedBundle?.artifact.content)).toMatchObject({
      variant: "slide-cover",
    });
    expect(firstSurfaceAttrs(savedBundle?.learnerContent)).toMatchObject({
      variant: "slide-cover",
    });
    expect(onEditorReady).toHaveBeenCalledTimes(1);
  });

  it("keeps the creation gate open when artifact creation fails", async () => {
    const user = userEvent.setup();
    const createArtifactMetadata = vi.fn(async () => {
      throw new Error("save failed");
    });
    const onEditorReady = vi.fn();

    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          artifactCreation: { createArtifactMetadata },
          media: null,
        }}
        onEditorReady={onEditorReady}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create page" }));

    await waitFor(() => {
      expect(screen.getByText("Document could not be created. Try again.")).toBeInTheDocument();
    });

    expect(screen.getByTestId("document-creation-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("content-author-host")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("keeps the Agent button available when no AI port is configured", async () => {
    const user = userEvent.setup();
    const onAgentClose = vi.fn();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-agent",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
        onAgentClose={onAgentClose}
      />,
    );

    await screen.findByTestId("content-author-host");
    const agentButton = screen.getByRole("button", {
      name: "Show Scaffold Agent",
    });

    expect(agentButton).toHaveProperty("disabled", false);
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();

    await user.click(agentButton);

    expect(screen.getByRole("button", { name: "Hide Scaffold Agent" })).toBeInTheDocument();
    expect(screen.getByTestId("authoring-agent-dock")).toBeInTheDocument();
    expect(mocks.contentAuthorHostProps.at(-1)?.["agentIntegration"]).toBe(
      ScaffoldUnavailableAgentIntegration,
    );
    expect(mocks.blockStripProps.at(-1)?.["items"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "callout" })]),
    );

    await user.click(screen.getByRole("button", { name: "Close Scaffold Agent" }));

    expect(screen.getByRole("button", { name: "Show Scaffold Agent" })).toBeInTheDocument();
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();
    expect(onAgentClose).toHaveBeenCalledTimes(1);
  });

  it("passes a supplied Agent integration to the authoring host", async () => {
    const FakeAgentIntegration: ScaffoldAgentIntegration = () => null;

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        agentIntegration={FakeAgentIntegration}
        artifact={{
          id: "artifact-agent",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");

    expect(mocks.contentAuthorHostProps.at(-1)?.["agentIntegration"]).toBe(FakeAgentIntegration);
  });

  it("renders preview from projected learner content", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async (bundle: ArtifactSaveBundle) => {
      mocks.savedBundles.push(bundle);
      return {};
    });
    const onPreviewContentChange = vi.fn();
    const createPreviewServices = vi.fn(() => ({ media: null }));

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
        onPreviewContentChange={onPreviewContentChange}
        createPreviewServices={createPreviewServices}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onPreviewContentChange).toHaveBeenCalledTimes(1));
    await screen.findByTestId("scaffold-learner-app");

    expect(saveArtifact).toHaveBeenCalledTimes(1);
    expect(mocks.savedBundles.at(-1)?.["artifact"]).toMatchObject({
      id: "artifact-preview",
      title: "Draft",
      mode: "page",
    });
    expect(onPreviewContentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        learnerContent: mocks.savedBundles.at(-1)?.["learnerContent"],
      }),
    );
    expect(mocks.learnerAppProps.at(-1)?.["bootstrap"]).toMatchObject({
      artifactId: "artifact-preview",
      title: "Draft",
      mode: "page",
      learnerContent: mocks.savedBundles.at(-1)?.["learnerContent"],
    });
    expect(createPreviewServices).toHaveBeenCalledWith(
      expect.objectContaining({
        learnerContent: mocks.savedBundles.at(-1)?.["learnerContent"],
      }),
    );
  });

  it("gives slideshow preview the remaining two-axis workspace", async () => {
    const user = userEvent.setup();
    const content = slideshowDocument("slideprev001");
    mocks.authorJSON = content;
    mocks.fakeEditor.getJSON.mockReturnValue(content);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-slideshow-preview",
          title: "Slides",
          mode: "slideshow",
          content,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    const learnerApp = await screen.findByTestId("scaffold-learner-app");
    expect(mocks.learnerAppProps.at(-1)?.["slideshowSizing"]).toBe("contained");
    expect(
      learnerApp.closest(".sc-scaffold-authoring-workspace")?.getAttribute("data-preview-mode"),
    ).toBe("slideshow");
  });
});

function latestCourseAppearance(): unknown {
  const props = mocks.contentAuthorHostProps.at(-1);
  if (!props) throw new Error("ContentAuthorHost props were not recorded");
  return props["courseAppearance"];
}
