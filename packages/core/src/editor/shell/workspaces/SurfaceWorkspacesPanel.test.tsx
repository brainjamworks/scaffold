// @vitest-environment happy-dom

import type { Editor as TiptapEditor } from "@tiptap/core";
import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import type { JSONContent } from "@tiptap/core";
import type {
  AuthorPreviewReports,
  AuthorPreviewTransport,
} from "@/editor/shell/authoring/author-preview-session-controller";
import type { LearnerInteractionWorkspaceController } from "@/editor/learner-interaction/workspace";
import type { PresentationTimelineController } from "@/editor/presentation/timeline";
import { documentAuthoringPluginKey } from "@/document/authoring/document-authoring-storage";

import { SurfaceWorkspacesPanel } from "./SurfaceWorkspacesPanel";
import type { SurfaceWorkspaceRequest } from "./surface-workspace-request";
import { createFakeWorkspaceDocumentOwners } from "./testing/fake-workspace-document-owners";

const mockState = vi.hoisted(() => ({
  interactionControllers: [] as LearnerInteractionWorkspaceController[],
  timelineControllers: [] as PresentationTimelineController[],
  timelineThrows: false,
}));

vi.mock("@/editor/learner-interaction/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/editor/learner-interaction/workspace")>();
  const { createElement, useContext } = await import("react");
  const { createPortal } = await import("react-dom");
  const { BottomPanelSlotsContext } = await import("@/editor/shell/chrome/EditorBottomPanel");
  return {
    ...actual,
    LearnerInteractionWorkspace: (props: { controller: LearnerInteractionWorkspaceController }) => {
      mockState.interactionControllers.push(props.controller);
      const slots = useContext(BottomPanelSlotsContext);
      const marker = createElement("span", null, "Interactions header marker");
      return createElement(
        "div",
        { "data-testid": "interactions-workspace-stub" },
        slots?.headerActions ? createPortal(marker, slots.headerActions) : marker,
      );
    },
  };
});

vi.mock("@/editor/presentation/timeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/editor/presentation/timeline")>();
  const { createElement, useContext } = await import("react");
  const { createPortal } = await import("react-dom");
  const { BottomPanelSlotsContext } = await import("@/editor/shell/chrome/EditorBottomPanel");
  return {
    ...actual,
    PresentationTimeline: (props: { controller: PresentationTimelineController }) => {
      mockState.timelineControllers.push(props.controller);
      if (mockState.timelineThrows) throw new Error("Timeline test crash");
      const slots = useContext(BottomPanelSlotsContext);
      const marker = createElement("span", null, "Timeline header marker");
      return createElement(
        "section",
        { "data-testid": "presentation-timeline" },
        slots?.headerActions ? createPortal(marker, slots.headerActions) : marker,
        createElement("h2", null, "Timeline"),
      );
    },
  };
});

const SURFACE = EmbeddedNodeIdSchema.parse("workspace001");
const SECOND_SURFACE = EmbeddedNodeIdSchema.parse("workspace002");
const MISSING_SURFACE = EmbeddedNodeIdSchema.parse("workspace999");
const ACTION = EmbeddedDataIdSchema.parse("waitaction01");

function slideshowContent(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "workspace001",
    initialCourseSectionTitle: "Section 1",
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("expected a Course Document");
  courseDocument.attrs = {
    ...courseDocument.attrs,
    presentation: {
      schemaVersion: 1,
      autoAdvance: false,
      allowPrevious: true,
      surfaces: [
        {
          surfaceId: SURFACE,
          durationMs: 5_000,
          layerTracks: [],
          actions: [
            {
              kind: "manual-wait",
              id: ACTION,
              isEnabled: true,
              atMs: 1_000,
              boundary: "before-actions",
            },
          ],
        },
      ],
    },
  };
  return content;
}

function twoSlideContent(): JSONContent {
  const content = slideshowContent();
  const documentTree = content.content?.[0];
  const firstSurface = documentTree?.content?.find((node) => node.type === "surface");
  if (!documentTree?.content || !firstSurface) throw new Error("expected a Slideshow Surface");
  documentTree.content = [
    ...documentTree.content,
    {
      ...structuredClone(firstSurface),
      attrs: { ...firstSurface.attrs, id: SECOND_SURFACE },
    },
  ];
  return content;
}

function sectionOnlyContent(): JSONContent {
  const content = slideshowContent();
  const courseDocument = content.content?.[0];
  const courseSection = courseDocument?.content?.find((node) => node.type === "courseSection");
  if (!courseDocument?.content || !courseSection) {
    throw new Error("expected a sectioned Slideshow fixture");
  }
  courseDocument.content = [courseSection];
  return content;
}

function stubPreviewTransport() {
  return {
    getSnapshot: () => ({ status: "idle" as const }),
    subscribe: () => () => undefined,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  } as unknown as AuthorPreviewTransport;
}

function stubPreviewReports() {
  return {
    getSnapshot: () => ({ status: "idle" as const }),
    subscribe: () => () => undefined,
    subscribeReports: () => () => undefined,
  } as unknown as AuthorPreviewReports;
}

function setup(options?: {
  readonly strictMode?: boolean;
  readonly request?: SurfaceWorkspaceRequest;
  readonly content?: JSONContent;
  readonly surfaces?: readonly ReturnType<typeof EmbeddedNodeIdSchema.parse>[];
  readonly courseSectionId?: ReturnType<typeof EmbeddedNodeIdSchema.parse>;
  readonly selectedId?: ReturnType<typeof EmbeddedNodeIdSchema.parse> | null;
  readonly heightStorageKey?: string;
  readonly previewActive?: boolean;
  readonly onSurfaceChanged?: (surfaceId: typeof SURFACE) => void;
}) {
  const content = options?.content ?? slideshowContent();
  const owners = createFakeWorkspaceDocumentOwners(options?.surfaces ?? [SURFACE], {
    ...(options?.courseSectionId !== undefined ? { courseSectionId: options.courseSectionId } : {}),
    ...(options?.selectedId !== undefined ? { selectedId: options.selectedId } : {}),
  });
  const getEditorSelection = vi.spyOn(owners.editorNavigation, "getSelectionSnapshot");
  vi.spyOn(documentAuthoringPluginKey, "getState").mockReturnValue(
    owners as unknown as NonNullable<ReturnType<typeof documentAuthoringPluginKey.getState>>,
  );
  const editor = { state: {}, getJSON: () => content } as unknown as TiptapEditor;
  const previewTransport = stubPreviewTransport();
  const previewReports = stubPreviewReports();
  const onClose = vi.fn();
  const request = options?.request ?? { workspace: "timeline", surfaceId: SURFACE, nonce: 1 };
  const renderPanel = (previewActive: boolean, nextRequest = request) => (
    <SurfaceWorkspacesPanel
      editor={editor}
      previewTransport={previewTransport}
      previewReports={previewReports}
      request={nextRequest}
      onClose={onClose}
      previewActive={previewActive}
      {...(options?.onSurfaceChanged ? { onSurfaceChanged: options.onSurfaceChanged } : {})}
      {...(options?.heightStorageKey ? { heightStorageKey: options.heightStorageKey } : {})}
    />
  );
  const utils = render(renderPanel(options?.previewActive ?? false), {
    reactStrictMode: options?.strictMode ?? false,
  });
  return {
    ...utils,
    owners,
    getEditorSelection,
    onClose,
    rerenderPanel: (previewActive: boolean, nextRequest = request) =>
      utils.rerender(renderPanel(previewActive, nextRequest)),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockState.interactionControllers.length = 0;
  mockState.timelineControllers.length = 0;
  mockState.timelineThrows = false;
});

describe("SurfaceWorkspacesPanel", () => {
  it("keeps draft and tab commands live after StrictMode effect replay", () => {
    const { onClose, unmount } = setup({
      strictMode: true,
      request: { workspace: "interactions", surfaceId: SURFACE, nonce: 1 },
    });
    const controller = mockState.interactionControllers.at(-1)!;
    act(() => controller.startNewRule());
    expect(controller.getSnapshot().status).toBe("focused-clean");
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    controller.startNewRule();
    expect(controller.getSnapshot().status).toBe("idle");
  });
  it("mounts both tabs with the Timeline workspace active", () => {
    setup();

    expect(screen.getByRole("tablist", { name: "Surface workspace" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Interactions" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByTestId("presentation-timeline")).toBeInTheDocument();
  });

  it("seeds explicit request before editor selection and never follows later editor selection", () => {
    const { getEditorSelection, owners, rerenderPanel } = setup({
      content: twoSlideContent(),
      surfaces: [SURFACE, SECOND_SURFACE],
      selectedId: SECOND_SURFACE,
      request: { workspace: "timeline", surfaceId: SURFACE, nonce: 1 },
    });
    expect(screen.getByRole("combobox", { name: "Workspace slide" })).toHaveValue(SURFACE);
    expect(getEditorSelection).toHaveBeenCalledOnce();

    owners.editorNavigation.publish(SECOND_SURFACE);
    rerenderPanel(false);

    expect(screen.getByRole("combobox", { name: "Workspace slide" })).toHaveValue(SURFACE);
    expect(getEditorSelection).toHaveBeenCalledOnce();
  });

  it("falls back from an invalid initial request to the editor-selected Surface", () => {
    setup({
      content: twoSlideContent(),
      surfaces: [SURFACE, SECOND_SURFACE],
      selectedId: SECOND_SURFACE,
      request: { workspace: "timeline", surfaceId: MISSING_SURFACE, nonce: 1 },
    });

    expect(screen.getByRole("combobox", { name: "Workspace slide" })).toHaveValue(SECOND_SURFACE);
  });

  it("applies each later explicit open-request nonce once through the local operations", () => {
    const onSurfaceChanged = vi.fn();
    const { owners, rerenderPanel } = setup({
      content: twoSlideContent(),
      surfaces: [SURFACE, SECOND_SURFACE],
      request: { workspace: "timeline", surfaceId: SURFACE, nonce: 1 },
      onSurfaceChanged,
    });

    rerenderPanel(false, {
      workspace: "interactions",
      surfaceId: SECOND_SURFACE,
      nonce: 2,
    });
    expect(screen.getByRole("combobox", { name: "Workspace slide" })).toHaveValue(SECOND_SURFACE);
    expect(screen.getByRole("tab", { name: "Interactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(onSurfaceChanged).toHaveBeenCalledOnce();

    rerenderPanel(false, { workspace: "timeline", surfaceId: SURFACE, nonce: 2 });
    expect(screen.getByRole("combobox", { name: "Workspace slide" })).toHaveValue(SECOND_SURFACE);
    expect(screen.getByRole("tab", { name: "Interactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    rerenderPanel(false, { workspace: "timeline", surfaceId: SURFACE, nonce: 3 });
    expect(screen.getByRole("combobox", { name: "Workspace slide" })).toHaveValue(SURFACE);
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
    expect(onSurfaceChanged).toHaveBeenCalledTimes(2);
    expect(owners.editorNavigation.showTargetCalls).toEqual([]);
  });

  it("treats a tab click as a request the controller confirms", () => {
    setup();

    fireEvent.click(screen.getByRole("tab", { name: "Interactions" }));
    expect(screen.getByRole("tab", { name: "Interactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const controller = mockState.interactionControllers.at(-1);
    if (!controller) throw new Error("expected a captured interaction controller");
    act(() => {
      controller.startNewRule();
      controller.updateDraft({
        ruleId: null,
        isEnabled: false,
        when: null,
        conditions: [],
        commands: [],
      });
    });

    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByRole("tab", { name: "Interactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "false");

    act(() => {
      controller.resolveContextChange("discard");
    });
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the active workspace's header actions in the panel header", () => {
    setup();

    const actions = document.querySelector(".sc-editor-bottom-panel-header-actions");
    if (!actions) throw new Error("expected panel header actions slot");
    expect(actions).toHaveTextContent("Timeline header marker");
    expect(actions).not.toHaveTextContent("Interactions header marker");

    fireEvent.click(screen.getByRole("tab", { name: "Interactions" }));
    const interactionActions = document.querySelector(".sc-editor-bottom-panel-header-actions");
    expect(interactionActions).toHaveTextContent("Interactions header marker");
    expect(interactionActions).not.toHaveTextContent("Timeline header marker");
  });

  it("marks the Interactions content root with the projected surface id", () => {
    setup();

    fireEvent.click(screen.getByRole("tab", { name: "Interactions" }));
    const workspace = screen.getByTestId("interactions-workspace-stub");
    expect(
      workspace
        .closest("[data-interaction-surface-id]")
        ?.getAttribute("data-interaction-surface-id"),
    ).toBe(SURFACE);
  });

  it.each([false, true])(
    "selects a slide locally without canvas navigation when previewActive=%s",
    (previewActive) => {
      const onSurfaceChanged = vi.fn();
      const { owners } = setup({
        content: twoSlideContent(),
        surfaces: [SURFACE, SECOND_SURFACE],
        previewActive,
        onSurfaceChanged,
      });
      owners.editorNavigation.queueSelectionResult({ kind: "missing", id: SECOND_SURFACE });

      fireEvent.change(screen.getByRole("combobox", { name: "Workspace slide" }), {
        target: { value: SECOND_SURFACE },
      });

      expect(onSurfaceChanged).toHaveBeenCalledOnce();
      expect(owners.editorNavigation.showTargetCalls).toEqual([]);
      expect(screen.getByRole("combobox", { name: "Workspace slide" })).toHaveValue(SECOND_SURFACE);
    },
  );

  it("preserves all workspace owners and their local state across Preview and hidden tabs", () => {
    const { rerenderPanel } = setup();
    const timeline = mockState.timelineControllers.at(-1)!;
    timeline.selectAction(ACTION, SURFACE);
    timeline.setEditDraft({ kind: "move-action", actionId: ACTION, atMs: 1_500 });
    timeline.setPlayheadDraft(1_250, 5_000);
    timeline.zoomAtPointer({
      requestedPixelsPerSecond: 100,
      pointerX: 100,
      durationMs: 5_000,
      viewportWidthPx: 300,
    });
    const timelineSnapshot = timeline.getSnapshot();

    fireEvent.click(screen.getByRole("tab", { name: "Interactions" }));
    const interaction = mockState.interactionControllers.at(-1)!;
    act(() => {
      interaction.startNewRule();
      interaction.updateDraft({
        ruleId: null,
        isEnabled: false,
        when: null,
        conditions: [],
        commands: [],
      });
    });
    const draftSnapshot = interaction.getSnapshot();

    rerenderPanel(true);
    rerenderPanel(false);

    expect(mockState.interactionControllers.at(-1)).toBe(interaction);
    expect(interaction.getSnapshot()).toBe(draftSnapshot);
    expect(timeline.getSnapshot()).toBe(timelineSnapshot);

    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    act(() => {
      void interaction.resolveContextChange("discard");
    });
    expect(mockState.timelineControllers.at(-1)).toBe(timeline);
  });

  it("returns null when the Slideshow has no Surfaces", () => {
    const content = sectionOnlyContent();
    const sectionId = EmbeddedNodeIdSchema.parse(content.content?.[0]?.content?.[0]?.attrs?.["id"]);
    const { container } = setup({
      content,
      surfaces: [],
      courseSectionId: sectionId,
      selectedId: sectionId,
    });

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("tablist", { name: "Surface workspace" })).toBeNull();
  });

  it("contains a crashing tab behind a retry fallback without losing tabs or Close", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockState.timelineThrows = true;
    try {
      const { onClose } = setup();
      expect(screen.getByRole("alert")).toHaveTextContent("Timeline ran into a problem.");

      fireEvent.click(screen.getByRole("tab", { name: "Interactions" }));
      expect(screen.getByTestId("interactions-workspace-stub")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Close workspace" }));
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
      mockState.timelineThrows = false;
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(screen.getByTestId("presentation-timeline")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      mockState.timelineThrows = false;
      errorSpy.mockRestore();
    }
  });

  it("seeds the panel height from the caller's storage key", () => {
    window.sessionStorage.setItem("test-workspaces-height:timeline", "300");
    try {
      const { container } = setup({ heightStorageKey: "test-workspaces-height" });
      expect(
        container
          .querySelector<HTMLElement>(".sc-editor-bottom-panel")
          ?.style.getPropertyValue("--sc-editor-bottom-workspace-height"),
      ).toBe("300px");
      fireEvent.click(screen.getByRole("tab", { name: "Interactions" }));
      expect(
        container
          .querySelector<HTMLElement>(".sc-editor-bottom-panel")
          ?.style.getPropertyValue("--sc-editor-bottom-workspace-height"),
      ).toBe("280px");
      fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
      expect(
        container
          .querySelector<HTMLElement>(".sc-editor-bottom-panel")
          ?.style.getPropertyValue("--sc-editor-bottom-workspace-height"),
      ).toBe("300px");
    } finally {
      window.sessionStorage.removeItem("test-workspaces-height:timeline");
    }
  });
});
