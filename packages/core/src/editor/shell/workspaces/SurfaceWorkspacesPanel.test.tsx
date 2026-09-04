// @vitest-environment happy-dom

import type { Editor as TiptapEditor } from "@tiptap/core";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import type { JSONContent } from "@tiptap/core";
import type { LearnerInteractionPreviewController } from "@/editor/learner-interaction/preview";
import type {
  LearnerInteractionWorkspaceController,
} from "@/editor/learner-interaction/workspace";
import type { PresentationPreviewController } from "@/editor/presentation/preview";
import type { SemanticDocumentController } from "@/document/authoring/semantic-document/semantic-document-controller";
import { semanticDocumentPluginKey } from "@/document/authoring/semantic-document/semantic-document-storage";

import { SurfaceWorkspacesPanel } from "./SurfaceWorkspacesPanel";
import type { SurfaceWorkspaceRequest } from "./surface-workspace-request";
import { FakeWorkspaceSemanticController } from "./testing/fake-workspace-semantic-controller";

const mockState = vi.hoisted(() => ({
  interactionControllers: [] as LearnerInteractionWorkspaceController[],
}));

vi.mock("@/editor/learner-interaction/workspace", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LearnerInteractionWorkspace: (props: {
      controller: LearnerInteractionWorkspaceController;
    }) => {
      mockState.interactionControllers.push(props.controller);
      return <div data-testid="interactions-workspace-stub" />;
    },
  };
});

vi.mock("@/editor/presentation/timeline", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/editor/presentation/timeline")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    PresentationTimeline: () =>
      createElement(
        "section",
        { "data-testid": "presentation-timeline" },
        createElement("h2", null, "Timeline"),
      ),
  };
});

const SURFACE = EmbeddedNodeIdSchema.parse("workspace001");

function slideshowContent(): JSONContent {
  return createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "workspace001",
    initialCourseSectionTitle: "Section 1",
  });
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

function stubPreviewController() {
  return {
    getSnapshot: () => ({ status: "idle" as const }),
    close: vi.fn(),
    subscribe: () => () => undefined,
  };
}

function setup(options?: {
  readonly request?: SurfaceWorkspaceRequest;
  readonly content?: JSONContent;
  readonly surfaces?: readonly ReturnType<typeof EmbeddedNodeIdSchema.parse>[];
  readonly courseSectionId?: ReturnType<typeof EmbeddedNodeIdSchema.parse>;
  readonly selectedId?: ReturnType<typeof EmbeddedNodeIdSchema.parse> | null;
}) {
  const content = options?.content ?? slideshowContent();
  const semantic = new FakeWorkspaceSemanticController(options?.surfaces ?? [SURFACE], {
    courseSectionId: options?.courseSectionId,
    selectedId: options?.selectedId,
  });
  vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue(
    semantic as unknown as SemanticDocumentController,
  );
  const editor = { state: {}, getJSON: () => content } as unknown as TiptapEditor;
  const previewController = stubPreviewController() as unknown as PresentationPreviewController;
  const learnerInteractionPreviewController =
    stubPreviewController() as unknown as LearnerInteractionPreviewController;
  const onClose = vi.fn();
  const request = options?.request ?? { workspace: "timeline", surfaceId: SURFACE, nonce: 1 };
  const utils = render(
    <SurfaceWorkspacesPanel
      editor={editor}
      previewController={previewController}
      learnerInteractionPreviewController={learnerInteractionPreviewController}
      request={request}
      onClose={onClose}
    />,
  );
  return { ...utils, semantic, onClose };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockState.interactionControllers.length = 0;
});

describe("SurfaceWorkspacesPanel", () => {
  it("mounts both tabs with the Timeline workspace active", () => {
    setup();

    expect(
      screen.getByRole("tablist", { name: "Surface workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Interactions" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByTestId("presentation-timeline")).toBeInTheDocument();
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
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    act(() => {
      controller.resolveContextChange("discard");
    });
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("marks the Interactions content root with the projected surface id", () => {
    setup();

    fireEvent.click(screen.getByRole("tab", { name: "Interactions" }));
    const workspace = screen.getByTestId("interactions-workspace-stub");
    expect(
      workspace.closest("[data-interaction-surface-id]")?.getAttribute(
        "data-interaction-surface-id",
      ),
    ).toBe(SURFACE);
  });

  it("returns null when the Slideshow has no Surfaces", () => {
    const content = sectionOnlyContent();
    const sectionId = EmbeddedNodeIdSchema.parse(
      content.content?.[0]?.content?.[0]?.attrs?.["id"],
    );
    const { container } = setup({
      content,
      surfaces: [],
      courseSectionId: sectionId,
      selectedId: sectionId,
    });

    expect(container.firstChild).toBeNull();
    expect(
      screen.queryByRole("tablist", { name: "Surface workspace" }),
    ).toBeNull();
  });
});
