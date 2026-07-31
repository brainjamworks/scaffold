// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldUnavailableAgentIntegration } from "@/editor/shell/agent/ScaffoldUnavailableAgentIntegration";
import type { ScaffoldAgentIntegration } from "@/editor/shell/agent/agent-integration";
import type { ArtifactSaveBundle } from "@/host/ports";
import { SCAFFOLD_DEFAULT_PRESET, SCAFFOLD_EDITORIAL_PRESET } from "@/theme/model/built-in-presets";
import type { ScaffoldThemeExtension } from "@/theme/model";

const mocks = vi.hoisted(() => {
  return {
    authorJSON: {} as JSONContent,
    blockStripProps: [] as Array<Record<string, unknown>>,
    fakeEditor: {
      getJSON: vi.fn(),
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
      onAgentClose,
      onChange,
      onEditorReady,
      leftRail,
      onUpdate,
      rightRail,
      resolvedTheme,
    }: {
      agentIntegration?: unknown;
      agentOpen?: boolean;
      onAgentClose?: () => void;
      onChange?: (editor: unknown) => void;
      onEditorReady?: (editor: unknown) => void;
      leftRail?: (editor: unknown) => ReactNode;
      onUpdate?: (content: unknown) => void;
      rightRail?: (editor: unknown) => ReactNode;
      resolvedTheme?: unknown;
    }) => {
      mocks.contentAuthorHostRenderCount += 1;
      mocks.contentAuthorHostProps.push({
        agentIntegration,
        agentOpen,
        leftRail,
        onAgentClose,
        onChange,
        onUpdate,
        resolvedTheme,
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

import { ScaffoldAuthoringApp } from "./ScaffoldAuthoringApp";
import { ScaffoldAuthoringEntry } from "./ScaffoldAuthoringEntry";

beforeEach(() => {
  localStorage.clear();
  mocks.authorJSON = pageDocumentWithParagraph("surface-author", "Author");
  mocks.fakeEditor.getJSON.mockImplementation(() => mocks.authorJSON);
  mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content?.[0]?.attrs ?? {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
      content: [{ type: "text", text }],
    },
  ];
  return document;
}

function slideshowDocument(surfaceId: string): JSONContent {
  return createScaffoldDocumentContent({ mode: "slideshow", surfaceId });
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
  it("resolves the live course theme from every editor document update", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(
      <ScaffoldAuthoringApp
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

    mocks.authorJSON.content![0]!.attrs!["theme"] = {
      schemaVersion: 1,
      preset: {
        id: SCAFFOLD_EDITORIAL_PRESET.id,
        revision: SCAFFOLD_EDITORIAL_PRESET.revision,
      },
      values: structuredClone(SCAFFOLD_EDITORIAL_PRESET.values),
    };
    mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content![0]!.attrs!;
    act(() => onChange?.(mocks.fakeEditor));
    await waitFor(() => expect(latestResolvedThemePreset()).toBe(SCAFFOLD_EDITORIAL_PRESET.id));

    mocks.authorJSON.content![0]!.attrs!["theme"] = {
      schemaVersion: 1,
      preset: {
        id: SCAFFOLD_DEFAULT_PRESET.id,
        revision: SCAFFOLD_DEFAULT_PRESET.revision,
      },
      values: structuredClone(SCAFFOLD_DEFAULT_PRESET.values),
    };
    mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content![0]!.attrs!;
    act(() => onChange?.(mocks.fakeEditor));
    await waitFor(() => expect(latestResolvedThemePreset()).toBe(SCAFFOLD_DEFAULT_PRESET.id));
  });

  it("opens the course Theme panel without a separate preview colour mode", async () => {
    const user = userEvent.setup();
    render(
      <ScaffoldAuthoringApp
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

    await user.click(
      screen.getByRole("button", { name: "Switch authoring application to dark mode" }),
    );

    expect(application).toHaveAttribute("data-scaffold-color-mode", "dark");
    expect(application?.style.colorScheme).toBe("dark");
    expect(latestResolvedThemeMode()).toBe("dark");
    expect(localStorage.getItem("scaffold.authoring.color-mode.v1")).toBe("dark");
    expect(mocks.authorJSON.content?.[0]?.attrs?.["theme"]).toEqual(initialCourseTheme);

    first.unmount();
    render(<ScaffoldAuthoringApp {...props} />);
    expect(document.querySelector(".sc-scaffold-authoring-app")).toHaveAttribute(
      "data-scaffold-color-mode",
      "dark",
    );
  });

  it("serializes and saves once only after ordinary typing settles", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const saveArtifact = vi.fn(() => new Promise<Record<string, never>>(() => {}));

    render(
      <ScaffoldAuthoringApp
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
    await act(async () => {
      await Promise.resolve();
    });
    const rendersAfterDirtyState = mocks.contentAuthorHostRenderCount;
    act(() => {
      onChange?.(mocks.fakeEditor);
      onChange?.(mocks.fakeEditor);
    });
    await act(async () => {
      await Promise.resolve();
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

    mocks.authorJSON = pageDocumentWithParagraph("surface-author", "Fresh editor content");
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
    const saveArtifact = vi.fn(() => saveResult.promise);

    expect(mocks.learnerModuleReads).toBe(0);

    render(
      <ScaffoldAuthoringApp
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
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    await waitFor(() => expect(mocks.learnerModuleReads).toBe(1));
    expect(saveArtifact).toHaveBeenCalledTimes(1);
    expect(previewButton.textContent).toBe("Preparing...");
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();

    saveResult.resolve({});

    await screen.findByTestId("scaffold-learner-app");

    await user.click(screen.getByRole("button", { name: "Switch to editing" }));
    await screen.findByTestId("content-author-host");
    const nextPreviewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(nextPreviewButton).toHaveProperty("disabled", false));
    await user.click(nextPreviewButton);

    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.learnerModuleReads).toBe(1);
    expect(saveArtifact).toHaveBeenCalledTimes(2);
  });

  it("shares application mode with the canvas and learner Preview without changing JSON", async () => {
    const user = userEvent.setup();
    localStorage.setItem("scaffold.authoring.color-mode.v1", "dark");
    const initialJSON = JSON.stringify(mocks.authorJSON);
    const props = {
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
    expect(latestResolvedThemeMode()).toBe("dark");

    await user.click(
      screen.getByRole("button", { name: "Switch authoring application to light mode" }),
    );

    await waitFor(() => {
      expect(latestResolvedThemeMode()).toBe("light");
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
    expect(latestResolvedThemeMode()).toBe("light");
  });

  it("awaits asynchronous preview services before entering preview", async () => {
    const user = userEvent.setup();
    const send = vi.fn(async () => undefined);
    const servicesResult = createDeferred<{
      media: null;
      xapi: {
        activityId: string;
        send: typeof send;
      };
    }>();
    const createPreviewServices = vi.fn(() => servicesResult.promise);

    render(
      <ScaffoldAuthoringApp
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
      xapi: {
        activityId: "https://learning.example.test/courses/authoring-preview",
        send,
      },
    });

    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.learnerAppProps.at(-1)?.["services"]).toEqual({ media: null });
    expect(send).not.toHaveBeenCalled();
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

  it("uses the same host theme extension for editing and learner preview", async () => {
    const user = userEvent.setup();
    const themeExtension = hostThemeExtension();
    const hostPreset = themeExtension.presets![0]!;
    mocks.authorJSON.content![0]!.attrs = {
      ...mocks.authorJSON.content![0]!.attrs,
      theme: {
        schemaVersion: 1,
        preset: { id: hostPreset.id, revision: hostPreset.revision },
        values: structuredClone(hostPreset.values),
      },
    };
    mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content![0]!.attrs!;

    render(
      <ScaffoldAuthoringApp
        artifact={{
          id: "artifact-host-theme",
          title: "Host themed draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
        themeExtension={themeExtension}
      />,
    );

    await screen.findByTestId("content-author-host");
    expect(mocks.contentAuthorHostProps.at(-1)?.["resolvedTheme"]).toMatchObject({
      effectivePresetId: hostPreset.id,
      available: true,
    });

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.learnerAppProps.at(-1)?.["themeExtension"]).toBe(themeExtension);
  });

  it("keeps saved course values when the host publishes a newer preset revision", async () => {
    const savedExtension = hostThemeExtension();
    const savedPreset = savedExtension.presets![0]!;
    const changedExtension = structuredClone(savedExtension);
    const changedPreset = changedExtension.presets![0]!;
    changedPreset.revision = "host-course-v2";
    changedPreset.values.colors.resolved.light.primary = "#ea580c";
    mocks.authorJSON.content![0]!.attrs = {
      ...mocks.authorJSON.content![0]!.attrs,
      theme: {
        schemaVersion: 1,
        preset: { id: savedPreset.id, revision: savedPreset.revision },
        values: structuredClone(savedPreset.values),
      },
    };
    mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content![0]!.attrs!;
    const savedPrimary = savedPreset.values.colors.resolved.light.primary;

    const view = render(
      <ScaffoldAuthoringApp
        artifact={{
          id: "artifact-stable-host-theme",
          title: "Stable host theme",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
        themeExtension={savedExtension}
      />,
    );
    await screen.findByTestId("content-author-host");

    view.rerender(
      <ScaffoldAuthoringApp
        artifact={{
          id: "artifact-stable-host-theme",
          title: "Stable host theme",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
        themeExtension={changedExtension}
      />,
    );

    await waitFor(() => expect(latestResolvedThemePrimary()).toBe(savedPrimary));
    expect(mocks.authorJSON.content![0]!.attrs!["theme"].preset.revision).toBe(
      savedPreset.revision,
    );
  });

  it("shows the document creation gate before mounting authoring without an artifact", () => {
    const onEditorReady = vi.fn();

    render(
      <ScaffoldAuthoringEntry
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
    const content = slideshowDocument("slide-preview");
    mocks.authorJSON = content;
    mocks.fakeEditor.getJSON.mockReturnValue(content);

    render(
      <ScaffoldAuthoringApp
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

function hostThemeExtension(): ScaffoldThemeExtension {
  const preset = structuredClone(SCAFFOLD_DEFAULT_PRESET);
  preset.id = "host-course";
  preset.revision = "host-course-v1";
  preset.label = "Host course";
  return { presets: [preset] };
}

function latestResolvedThemeMode(): unknown {
  const props = mocks.contentAuthorHostProps.at(-1);
  if (!props) throw new Error("ContentAuthorHost props were not recorded");
  return (props["resolvedTheme"] as { mode?: unknown } | undefined)?.mode;
}

function latestResolvedThemePreset(): unknown {
  const props = mocks.contentAuthorHostProps.at(-1);
  if (!props) throw new Error("ContentAuthorHost props were not recorded");
  return (props["resolvedTheme"] as { requestedPresetId?: unknown } | undefined)?.requestedPresetId;
}

function latestResolvedThemePrimary(): unknown {
  const props = mocks.contentAuthorHostProps.at(-1);
  if (!props) throw new Error("ContentAuthorHost props were not recorded");
  return (props["resolvedTheme"] as { palette?: { primary?: unknown } } | undefined)?.palette
    ?.primary;
}
