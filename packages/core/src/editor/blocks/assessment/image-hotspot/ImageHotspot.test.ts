// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  AssessmentLearnerSnapshot,
  AssessmentProblemSnapshot,
  AssessmentResult,
  QuizAttemptSnapshot,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import {
  assessmentProblemIdentity,
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  localAssessmentResponse,
  setAssessmentResponseField,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentActionsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group-runtime";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import type { RichTextBubbleMenuProps } from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";
import {
  ImageHotspotPrivateAssessmentSchema,
  type ImageHotspotCanvasData,
} from "@scaffold/contracts";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import type { AssessmentPort } from "@/host/ports";
import type { MediaPort } from "@/host/ports/media";

import { imageHotspotBlockDefinition } from "./image-hotspot-definition";
import {
  describeImageHotspotMarkerAccessibilityState,
  describeImageHotspotRevealedHotspotAccessibilityState,
  describeImageHotspotSurfaceAccessibilityState,
} from "./image-hotspot-canvas-runtime";
import { patchHotspotInCanvasData } from "./image-hotspot-canvas-shared";
import { createImageHotspotAuthoringExtension } from "./image-hotspot-authoring-extension";
import { createImageHotspotRuntimeExtension } from "./image-hotspot-runtime-extension";

const canonicalAssessmentResult = { maxScore: 1 as const, feedback: null, items: {} };

const imageHotspotBlockRegistry = createBlockRegistry([imageHotspotBlockDefinition]);
const ImageHotspotAuthoringExtension =
  createImageHotspotAuthoringExtension(imageHotspotBlockRegistry);
const ImageHotspotRuntimeExtension = createImageHotspotRuntimeExtension(imageHotspotBlockRegistry);

const imageHotspotBubbleMenuMock = vi.hoisted(() => ({
  props: [] as RichTextBubbleMenuProps[],
}));
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const scrollIntoViewMock = vi.fn();

vi.mock("@/editor/shell/bubbles/rich-text/RichTextBubbleMenu", async () => {
  const React = await import("react");
  const { createPortal } = await import("react-dom");

  return {
    RichTextBubbleMenu(props: RichTextBubbleMenuProps) {
      imageHotspotBubbleMenuMock.props.push(props);
      const appendTarget = props.appendTo?.();
      return appendTarget
        ? createPortal(
            React.createElement("div", {
              "aria-label": "Text formatting",
              "data-testid": "image-hotspot-rich-text-bubble-menu",
              role: "toolbar",
            }),
            appendTarget,
          )
        : null;
    },
  };
});

function makeEditor({
  content,
  undoRedo = false,
}: { content?: JSONContent; undoRedo?: boolean } = {}) {
  return new Editor({
    ...(content ? { content } : {}),
    extensions: [
      StarterKit.configure({ undoRedo: undoRedo ? {} : false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([imageHotspotBlockDefinition.nodeType]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      ImageHotspotAuthoringExtension,
    ],
  });
}

function makeRuntimeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([imageHotspotBlockDefinition.nodeType]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupRuntimeNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      ImageHotspotRuntimeExtension,
    ],
  });
}

function makeBoundedAuthoringEditor() {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
      createRuntimeBlockFrameAttributesExtension([imageHotspotBlockDefinition.nodeType]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      ImageHotspotAuthoringExtension,
    ],
  });
}

function renderRuntimeEditor(
  editor: Editor,
  assessmentPort: AssessmentPort,
  initialSnapshot?: unknown,
) {
  render(
    createAssessmentRuntimeTestRoot({
      assessment: assessmentPort,
      children: createElement(EditorContent, { editor }),
      initialSnapshot,
      onStore: captureAssessmentStore,
    }),
  );
}

function renderAuthoringEditor(editor: Editor, mediaPort: MediaPort) {
  render(
    createAssessmentRuntimeTestRoot({
      children: createElement(EditorContent, { editor }),
      media: mediaPort,
      onStore: captureAssessmentStore,
    }),
  );
}

let assessmentStore: AssessmentStoreApi | null = null;
function captureAssessmentStore(store: AssessmentStoreApi | null) {
  assessmentStore = store;
}

function renderAssessmentEditor(editor: Editor) {
  return render(
    createAssessmentRuntimeTestRoot({
      children: createElement(EditorContent, { editor }),
      onStore: captureAssessmentStore,
    }),
  );
}

function selectFirstNode(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
}

function readCanvasData(editor: Editor): ImageHotspotCanvasData {
  let data: ImageHotspotCanvasData | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image_hotspot_canvas") {
      data = node.attrs["data"] as ImageHotspotCanvasData;
      return false;
    }
    return true;
  });
  if (!data) throw new Error("expected image hotspot canvas data");
  return data;
}

function directCanvasChild(
  owner: ProseMirrorNode,
  ownerPos: number,
): { node: ProseMirrorNode; pos: number } | null {
  let pos = ownerPos + 1;
  for (let index = 0; index < owner.childCount; index += 1) {
    const child = owner.child(index);
    if (child.type.name === "image_hotspot_canvas") return { node: child, pos };
    pos += child.nodeSize;
  }
  return null;
}

function describedText(selector: string): string | null {
  const element = document.body.querySelector<HTMLElement>(selector);
  const describedBy = element?.getAttribute("aria-describedby");
  if (!describedBy) return null;
  return describedBy
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function richFeedback(text: string) {
  return {
    kind: "rich-text" as const,
    document: {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

function assessmentSnapshot({
  problems,
  quizzes = {},
}: {
  problems: Record<string, AssessmentProblemSnapshot>;
  quizzes?: Record<string, QuizAttemptSnapshot>;
}): AssessmentLearnerSnapshot {
  return {
    snapshotVersion: 1,
    artifactId: "artifact-1",
    problems,
    quizzes,
  };
}

function hotspotProblemSnapshot({
  clicks,
  result,
}: {
  clicks: Array<{ hotspotId: string | null; x: number; y: number }>;
  result: AssessmentResult;
}): AssessmentProblemSnapshot {
  return {
    response: { kind: "spatial-hotspot", selections: clicks },
    submitted: true,
    attemptNumber: 1,
    hintsShown: 0,
    checkResult: null,
    submissionResult: result,
  };
}

function completedQuizSnapshot({
  attemptId,
  result,
  targetId,
}: {
  attemptId: string;
  result: AssessmentResult;
  targetId: string;
}): QuizAttemptSnapshot {
  return {
    attemptId,
    status: "completed",
    currentTargetId: null,
    submittedTargetIds: [targetId],
    startedAt: "2026-07-16T12:00:00.000Z",
    finishedAt: "2026-07-16T12:01:00.000Z",
    expiresAt: null,
    score: 0,
    maxScore: result.maxScore,
    resultsByTargetId: { [targetId]: result },
    answerReviewAuthorized: true,
  };
}

function assessmentActions(): JSONContent {
  return {
    type: "assessment_actions_group",
    content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
  };
}

function imageHotspotBlock(id: string): JSONContent {
  return {
    type: "image_hotspot",
    attrs: { id, assessment: sampleAssessment },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      {
        type: "assessment_instructions",
        content: [{ type: "paragraph" }],
      },
      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
      { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
      assessmentActions(),
    ],
  };
}

const sampleCanvasData: ImageHotspotCanvasData = {
  image: {
    mode: "external",
    src: "https://example.com/img.png",
    alt: "sample",
  },
  hotspots: [
    { id: "h1", centerX: 20, centerY: 20, radius: 8, label: "A" },
    { id: "h2", centerX: 60, centerY: 40, radius: 6, label: "B" },
    { id: "h3", centerX: 80, centerY: 80, radius: 7, label: "C" },
  ],
  maxClicks: null,
  debug: false,
};

const sampleAssessment = {
  gradingMode: "partial-credit",
  correctHotspotIds: ["h1", "h3"],
  feedbackByHotspotId: {},
  missFeedback: null,
  summaryFeedback: null,
};

beforeEach(() => {
  imageHotspotBubbleMenuMock.props.length = 0;
  scrollIntoViewMock.mockClear();
  assessmentStore = null;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoViewMock,
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() =>
    DOMRect.fromRect({
      height: 32,
      width: 96,
      x: 48,
      y: 48,
    }),
  );
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    function mockClientRects(this: Element) {
      return [this.getBoundingClientRect()] as unknown as DOMRectList;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function clientWidth(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 1024 : 96;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function clientHeight(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 768 : 32;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    function scrollWidth(this: HTMLElement) {
      return this.clientWidth;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.clientHeight;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  if (scrollIntoViewDescriptor) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
  cleanup();
  document.body.innerHTML = "";
});

describe("composite image_hotspot node", () => {
  it("describes image hotspot runtime accessibility states", () => {
    expect(
      describeImageHotspotSurfaceAccessibilityState({
        clickCount: 1,
        maxClicks: 2,
        capped: false,
        submitted: false,
        answerKeyVisible: false,
        disabled: false,
      }),
    ).toBe("1 of 2 clicks placed");
    expect(
      describeImageHotspotSurfaceAccessibilityState({
        clickCount: 2,
        maxClicks: 2,
        capped: true,
        submitted: false,
        answerKeyVisible: false,
        disabled: true,
      }),
    ).toBe("2 of 2 clicks placed. Click limit reached");
    expect(
      describeImageHotspotMarkerAccessibilityState({
        state: "incorrect",
        hasFeedback: true,
        submitted: true,
        answerKeyVisible: false,
      }),
    ).toBe("Submitted click, incorrect. Feedback available");
    expect(
      describeImageHotspotMarkerAccessibilityState({
        state: "submitted",
        hasFeedback: false,
        submitted: true,
        answerKeyVisible: false,
      }),
    ).toBe("Submitted click");
    expect(
      describeImageHotspotMarkerAccessibilityState({
        state: "correct",
        hasFeedback: false,
        submitted: true,
        answerKeyVisible: true,
      }),
    ).toBe("Revealed click, correct");
    expect(
      describeImageHotspotRevealedHotspotAccessibilityState(sampleCanvasData.hotspots[0]!, 0),
    ).toBe("Revealed correct hotspot 1: A");
  });

  it("keeps the atomic canvas out of the global block group", () => {
    const editor = makeEditor();

    expect(editor.schema.nodes["image_hotspot_canvas"]?.spec.group).toBeUndefined();
    expect(editor.schema.nodes["image_hotspot_canvas"]?.spec.selectable).toBe(false);
    expect(editor.schema.nodes["image_hotspot_canvas"]?.spec.draggable).toBe(false);
    expect(editor.schema.nodes["image_hotspot"]?.spec.group).toBe(
      `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    );

    editor.destroy();
  });

  it("registers only the outer hotspot block in the insert catalog", () => {
    const nodeTypes = builtInInsertCatalog.actions.map((item) => item.nodeType);

    expect(nodeTypes).toContain("image_hotspot");
    expect(nodeTypes).not.toContain("image_hotspot_canvas");
  });

  it("declares fill capability but fits a normal compact canvas by width", async () => {
    expect(imageHotspotBlockDefinition.boundedPlacement).toBe("fill");

    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "hs-bounded-fit", assessment: sampleAssessment },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const image = (await screen.findByAltText("sample")) as HTMLImageElement;
    const fitStage = image.closest<HTMLElement>(".sc-image-hotspot-fit-stage");
    if (!fitStage) throw new Error("expected hotspot fit stage");
    fitStage.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 482,
      bottom: 89,
      width: 482,
      height: 89,
      toJSON: () => ({}),
    });
    Object.defineProperty(fitStage, "clientWidth", {
      configurable: true,
      value: 482,
    });
    Object.defineProperty(fitStage, "clientHeight", {
      configurable: true,
      value: 89,
    });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 200,
    });
    fireEvent.load(image);

    const surface = image.closest<HTMLElement>("[data-image-hotspot-canvas-surface]");
    expect(surface?.getAttribute("data-image-hotspot-fit")).toBe("width");
    await waitFor(() => {
      expect(surface?.style.getPropertyValue("--sc-image-hotspot-aspect-ratio")).toBe("2");
      expect(surface?.style.width).toBe("482px");
      expect(surface?.style.height).toBe("241px");
    });

    editor.destroy();
  });

  it("renders bounded compact authoring as a preview and edits in the expanded workspace", async () => {
    const editor = makeBoundedAuthoringEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-a", variant: "slide-content" },
              content: [
                {
                  type: "region",
                  attrs: { id: "region-a" },
                  content: [
                    {
                      type: "image_hotspot",
                      attrs: {
                        id: "hs-bounded-preview",
                        assessment: sampleAssessment,
                      },
                      content: [
                        {
                          type: "assessment_title",
                          content: [{ type: "paragraph" }],
                        },
                        {
                          type: "assessment_instructions",
                          content: [{ type: "paragraph" }],
                        },
                        {
                          type: "assessment_prompt",
                          content: [{ type: "paragraph" }],
                        },
                        {
                          type: "image_hotspot_canvas",
                          attrs: { data: sampleCanvasData },
                        },
                        assessmentActions(),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const preview = await screen.findByRole("group", {
      name: "Image hotspot authoring preview",
    });
    expect(preview.classList.contains("sc-image-hotspot-canvas--authoring-preview")).toBe(true);
    expect(preview.getAttribute("data-image-hotspot-fit")).toBe("contain");
    expect(screen.queryByRole("button", { name: "Add hotspot region" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit hotspot 1: A" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit hotspots in expanded workspace",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Edit image hotspots",
    });
    expect(within(dialog).getByRole("button", { name: "Add hotspot region" })).toBeInTheDocument();
    const inspector = within(dialog).getByRole("region", {
      name: "Selected hotspot details",
    });
    expect(within(inspector).getByText("Hotspot 1")).toBeInTheDocument();
    expect(
      within(inspector).getByPlaceholderText("Short label for this region"),
    ).toBeInTheDocument();
    expect(within(inspector).getByLabelText("Hotspot 1 feedback")).toBeInTheDocument();
    expect(inspector.querySelector("[data-scaffold-nested-rich-text-editor-field]")).not.toBeNull();

    const marker = within(dialog).getByRole("button", { name: "Edit hotspot 1: A" });
    expect(marker).toBeInTheDocument();
    expect(marker.getAttribute("aria-haspopup")).toBeNull();
    expect(marker.getAttribute("aria-expanded")).toBeNull();

    fireEvent.click(marker);

    await waitFor(() => {
      expect(marker.getAttribute("data-hotspot-selected")).toBe("true");
    });
    expect(within(inspector).getByText("Hotspot 1")).toBeInTheDocument();

    editor.destroy();
  });

  it("renders a persistent hotspot management panel with ordered rows and label fallbacks", async () => {
    const user = userEvent.setup();
    const block = imageHotspotBlock("hs-workspace-management");
    const canvas = block.content?.find((child) => child.type === "image_hotspot_canvas");
    if (!canvas) throw new Error("Expected image-hotspot canvas");
    canvas.attrs = {
      data: {
        ...sampleCanvasData,
        hotspots: sampleCanvasData.hotspots.map((hotspot, index) =>
          index === 1 ? { ...hotspot, label: "" } : hotspot,
        ),
      },
    };
    const editor = makeEditor({ content: { type: "doc", content: [block] } });

    renderAssessmentEditor(editor);
    await user.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const canvasRegion = within(dialog).getByRole("region", {
      name: "Image hotspot workspace canvas",
    });
    const panel = within(dialog).getByRole("region", { name: "Selected hotspot details" });
    within(canvasRegion).getByRole("group", {
      name: "Image hotspot authoring area",
    });
    const workspaceBody = canvasRegion.closest<HTMLElement>(".sc-media-workspace");
    expect(workspaceBody?.parentElement).toBe(dialog);
    expect(workspaceBody?.contains(panel)).toBe(true);
    expect(canvasRegion.parentElement).toBe(panel.parentElement);
    expect(within(panel).getByRole("heading", { name: "Hotspots" })).toBeInTheDocument();
    expect(
      within(panel).getByText("Select a region or row to edit its details."),
    ).toBeInTheDocument();
    expect(within(panel).getByLabelText("3 total hotspots").textContent).toBe("3");

    const list = within(panel).getByRole("list", { name: "Hotspots" });
    const rowButtons = within(list).getAllByRole("button", { name: /^Select hotspot/ });
    expect(rowButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Select hotspot 1: A",
      "Select hotspot 2: Untitled hotspot",
      "Select hotspot 3: C",
    ]);
    expect(rowButtons[0]?.getAttribute("aria-pressed")).toBe("true");

    const selectedRow = rowButtons[0]?.closest("li");
    if (!selectedRow) throw new Error("Expected selected hotspot row");
    expect(
      within(selectedRow).getByPlaceholderText("Short label for this region"),
    ).toBeInTheDocument();
    expect(within(selectedRow).getByLabelText("Hotspot 1 feedback")).toBeInTheDocument();

    editor.destroy();
  });

  it("keeps hotspot row and canvas selection synchronized", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-workspace-selection")],
      },
    });

    renderAssessmentEditor(editor);
    await user.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const panel = within(dialog).getByRole("region", { name: "Selected hotspot details" });
    const list = within(panel).getByRole("list", { name: "Hotspots" });
    const secondRowButton = within(list).getByRole("button", { name: "Select hotspot 2: B" });

    scrollIntoViewMock.mockClear();
    await user.click(secondRowButton);

    const secondMarker = within(dialog).getByRole("button", { name: "Edit hotspot 2: B" });
    expect(secondRowButton.getAttribute("aria-pressed")).toBe("true");
    expect(secondMarker.getAttribute("data-hotspot-selected")).toBe("true");
    const secondRow = secondRowButton.closest("li");
    if (!secondRow) throw new Error("Expected second hotspot row");
    expect(within(secondRow).getByLabelText("Hotspot 2 feedback")).toBeInTheDocument();

    const thirdRowButton = within(list).getByRole("button", { name: "Select hotspot 3: C" });
    await user.click(within(dialog).getByRole("button", { name: "Edit hotspot 3: C" }));

    await waitFor(() => {
      expect(thirdRowButton.getAttribute("aria-pressed")).toBe("true");
      expect(scrollIntoViewMock).toHaveBeenLastCalledWith({
        block: "nearest",
        inline: "nearest",
      });
    });
    const thirdRow = thirdRowButton.closest("li");
    if (!thirdRow) throw new Error("Expected third hotspot row");
    expect(within(thirdRow).getByLabelText("Hotspot 3 feedback")).toBeInTheDocument();

    editor.destroy();
  });

  it("keeps the hotspot header above the empty workspace state", async () => {
    const user = userEvent.setup();
    const block = imageHotspotBlock("hs-workspace-empty");
    const canvas = block.content?.find((child) => child.type === "image_hotspot_canvas");
    if (!canvas) throw new Error("Expected image-hotspot canvas");
    canvas.attrs = { data: { ...sampleCanvasData, hotspots: [] } };
    const editor = makeEditor({ content: { type: "doc", content: [block] } });

    renderAssessmentEditor(editor);
    await user.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const panel = within(dialog).getByRole("region", { name: "Selected hotspot details" });
    expect(within(panel).getByRole("heading", { name: "Hotspots" })).toBeInTheDocument();
    expect(within(panel).getByLabelText("0 total hotspots").textContent).toBe("0");
    expect(within(panel).queryByRole("list", { name: "Hotspots" })).toBeNull();
    expect(within(panel).getByText("No hotspots yet")).toBeInTheDocument();
    expect(
      within(panel).getByText("Draw a region on the image or add one from the toolbar."),
    ).toBeInTheDocument();

    editor.destroy();
  });

  it("renders expanded actions as icon-only dialog toolbar chrome", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-workspace-toolbar")],
      },
    });

    renderAssessmentEditor(editor);
    await user.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const toolbar = within(dialog).getByRole("toolbar", { name: "Image hotspot tools" });
    const canvas = within(dialog).getByRole("group", { name: "Image hotspot authoring area" });
    const replaceImage = within(toolbar).getByRole("button", { name: "Replace hotspot image" });
    const addHotspot = within(toolbar).getByRole("button", { name: "Add hotspot region" });

    expect(toolbar.parentElement).toBe(dialog);
    expect(toolbar.previousElementSibling?.tagName).toBe("HEADER");
    expect(toolbar.nextElementSibling?.contains(canvas)).toBe(true);
    expect(within(toolbar).getByRole("group", { name: "Image actions" })).toContainElement(
      replaceImage,
    );
    expect(replaceImage.textContent).toBe("");
    expect(addHotspot.textContent).toBe("");
    expect(replaceImage.querySelector("svg")).not.toBeNull();
    expect(addHotspot.querySelector("svg")).not.toBeNull();
    expect(replaceImage.getAttribute("data-size")).toBe(addHotspot.getAttribute("data-size"));
    expect(replaceImage.getAttribute("data-variant")).toBe(addHotspot.getAttribute("data-variant"));
    expect(within(canvas).queryByRole("button", { name: "Replace hotspot image" })).toBeNull();
    expect(within(canvas).queryByRole("button", { name: "Add hotspot region" })).toBeNull();

    replaceImage.blur();
    replaceImage.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Replace hotspot image");
    editor.destroy();
  });

  it("opens image replacement from the expanded workspace toolbar", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-workspace-replace")],
      },
    });

    renderAssessmentEditor(editor);
    await user.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const workspace = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const toolbar = within(workspace).getByRole("toolbar", { name: "Image hotspot tools" });
    await user.click(within(toolbar).getByRole("button", { name: "Replace hotspot image" }));

    expect(
      await screen.findByRole("dialog", { name: "Replace hotspot image" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Replace hotspot image" })).toBeNull();
    });
    expect(screen.getByRole("dialog", { name: "Edit image hotspots" })).toBe(workspace);
    editor.destroy();
  });

  it("labels the authoring canvas and supports keyboard hotspot creation", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "hs-1" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "image_hotspot_canvas",
              attrs: {
                data: {
                  ...sampleCanvasData,
                  hotspots: [],
                },
              },
            },
            assessmentActions(),
          ],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const canvas = await screen.findByRole("group", {
      name: "Image hotspot authoring area",
    });
    const imageTools = within(canvas).getByRole("toolbar", {
      name: "Image hotspot image tools",
    });
    expect(
      within(imageTools)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Replace image", "Add hotspot region", "Edit hotspots in expanded workspace"]);
    expect(screen.queryByText("Replace image")).toBeNull();

    fireEvent.click(within(imageTools).getByRole("button", { name: "Add hotspot region" }));

    const marker = await screen.findByRole("button", { name: "Edit hotspot 1" });
    expect(marker.getAttribute("data-hotspot-selected")).toBe("true");
    expect(marker.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Hotspot 1")).toBeNull();

    fireEvent.click(marker);
    await screen.findByText("Hotspot 1");

    await waitFor(() => {
      const hotspot = readCanvasData(editor).hotspots[0];
      expect(hotspot).toMatchObject({
        centerX: 50,
        centerY: 50,
        radius: 8,
        label: "",
      });
    });

    editor.destroy();
  });

  it("adds and selects a centred region from the expanded workspace toolbar", async () => {
    const user = userEvent.setup();
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-expanded-author")],
      },
    });

    renderAssessmentEditor(editor);
    await user.click(
      await screen.findByRole("button", {
        name: "Edit hotspots in expanded workspace",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Edit image hotspots",
    });
    const inspector = within(dialog).getByRole("region", {
      name: "Selected hotspot details",
    });
    const toolbar = within(dialog).getByRole("toolbar", { name: "Image hotspot tools" });

    scrollIntoViewMock.mockClear();
    await user.click(within(toolbar).getByRole("button", { name: "Add hotspot region" }));

    await waitFor(() => {
      expect(readCanvasData(editor).hotspots).toHaveLength(4);
      expect(readCanvasData(editor).hotspots[3]).toMatchObject({
        centerX: 50,
        centerY: 50,
        radius: 8,
        label: "",
      });
    });
    const marker = within(dialog).getByRole("button", { name: "Edit hotspot 4" });
    expect(marker.getAttribute("data-hotspot-selected")).toBe("true");
    const rowButton = within(inspector).getByRole("button", {
      name: "Select hotspot 4: Untitled hotspot",
    });
    expect(rowButton.getAttribute("aria-pressed")).toBe("true");
    const row = rowButton.closest("li");
    if (!row) throw new Error("Expected newly added hotspot row");
    expect(within(row).getByText("Hotspot 4")).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenLastCalledWith({
      block: "nearest",
      inline: "nearest",
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Close expanded hotspot workspace",
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit image hotspots" })).toBeNull();
    });

    editor.destroy();
  });

  it("starts a new expanded feedback session when the selected hotspot changes", async () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-expanded-target-switch")],
      },
    });

    renderAssessmentEditor(editor);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const inspector = within(dialog).getByRole("region", { name: "Selected hotspot details" });
    const firstField = await within(inspector).findByLabelText("Hotspot 1 feedback");
    const firstEditor = await latestNestedHotspotEditor();

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit hotspot 2: B" }));
    await waitFor(() => {
      expect(within(inspector).getByLabelText("Hotspot 2 feedback")).not.toBe(firstField);
      expect(firstEditor.isDestroyed).toBe(true);
    });
    const secondField = within(inspector).getByLabelText("Hotspot 2 feedback");
    const secondEditor = await latestNestedHotspotEditor();
    expect(secondEditor).not.toBe(firstEditor);

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit hotspot 3: C" }));
    await waitFor(() => {
      expect(within(inspector).getByLabelText("Hotspot 3 feedback")).not.toBe(secondField);
      expect(secondEditor.isDestroyed).toBe(true);
    });
    const thirdEditor = await latestNestedHotspotEditor();
    expect(thirdEditor).not.toBe(secondEditor);

    thirdEditor.commands.insertContent("Third hotspot feedback");
    await waitFor(() => {
      expect(readAuthoredHotspotFeedback(editor, "hs-expanded-target-switch", "h3")).toMatchObject(
        richFeedback("Third hotspot feedback").document,
      );
    });
    expect(readAuthoredHotspotFeedback(editor, "hs-expanded-target-switch", "h1")).toBeNull();
    expect(readAuthoredHotspotFeedback(editor, "hs-expanded-target-switch", "h2")).toBeNull();

    editor.destroy();
  });

  it("syncs an external selected-hotspot update into the mounted expanded field", async () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-expanded-external-sync")],
      },
    });

    renderAssessmentEditor(editor);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const inspector = within(dialog).getByRole("region", { name: "Selected hotspot details" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit hotspot 2: B" }));
    const feedbackEditor = await within(inspector).findByLabelText("Hotspot 2 feedback");
    const nestedEditor = await latestNestedHotspotEditor();
    let transactionCount = 0;
    editor.on("transaction", () => {
      transactionCount += 1;
    });

    setAuthoredHotspotFeedback(
      editor,
      "hs-expanded-external-sync",
      "h2",
      "Externally synchronized feedback",
    );

    await waitFor(() => {
      expect(within(inspector).getByLabelText("Hotspot 2 feedback")).toBe(feedbackEditor);
      expect(nestedEditor.getText()).toBe("Externally synchronized feedback");
    });
    expect(transactionCount).toBe(1);

    editor.destroy();
  });

  it("syncs external canvas and assessment changes into the open expanded workspace", async () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-expanded-model-sync")],
      },
    });

    renderAssessmentEditor(editor);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const inspector = within(dialog).getByRole("region", { name: "Selected hotspot details" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit hotspot 2: B" }));
    const labelInput = within(inspector).getByPlaceholderText("Short label for this region");
    expect(labelInput).toBeInstanceOf(HTMLInputElement);
    if (!(labelInput instanceof HTMLInputElement)) throw new Error("Expected hotspot label input");
    expect(labelInput.value).toBe("B");
    expect(within(inspector).getByRole("button", { name: "Mark as correct" })).toBeInTheDocument();

    const ownerPos = 0;
    const ownerNode = editor.state.doc.nodeAt(ownerPos);
    if (!ownerNode || ownerNode.type.name !== "image_hotspot") {
      throw new Error("Expected image-hotspot owner");
    }
    const canvas = directCanvasChild(ownerNode, ownerPos);
    if (!canvas) throw new Error("Expected image-hotspot canvas");
    const nextCanvasData = {
      ...readCanvasData(editor),
      hotspots: readCanvasData(editor).hotspots.map((hotspot) =>
        hotspot.id === "h2" ? { ...hotspot, label: "Externally renamed" } : hotspot,
      ),
    };
    const nextAssessment = {
      ...ImageHotspotPrivateAssessmentSchema.parse(ownerNode.attrs["assessment"] ?? {}),
      correctHotspotIds: ["h1", "h2", "h3"],
    };
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(canvas.pos, undefined, { ...canvas.node.attrs, data: nextCanvasData })
        .setNodeMarkup(ownerPos, undefined, { ...ownerNode.attrs, assessment: nextAssessment }),
    );

    await waitFor(() => {
      expect(within(inspector).getByPlaceholderText("Short label for this region")).toBe(
        labelInput,
      );
      expect(labelInput.value).toBe("Externally renamed");
      expect(
        within(dialog).getByRole("button", { name: "Edit hotspot 2: Externally renamed" }),
      ).toBeInTheDocument();
      expect(within(inspector).getByRole("button", { name: "Marked correct" })).toBeInTheDocument();
    });

    editor.destroy();
  });

  it("keeps expanded formatting chrome and focus ownership inside the modal workspace", async () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-expanded-formatting")],
      },
    });

    renderAssessmentEditor(editor);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit hotspots in expanded workspace" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Edit image hotspots" });
    const nestedEditor = await latestNestedHotspotEditor();
    const formattingToolbar = screen.getByRole("toolbar", { name: "Text formatting" });

    expect(dialog.contains(formattingToolbar)).toBe(true);
    expect(imageHotspotBubbleMenuMock.props.at(-1)?.appendTo?.()).toBe(dialog);
    expect(nestedEditor.isFocused).toBe(false);

    editor.destroy();
  });

  it("persists media library selections as managed hotspot images", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "hs-1" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas" },
            assessmentActions(),
          ],
        },
      ],
    });

    const mediaPort: MediaPort = {
      resolve: async (mediaId) => `https://cdn.example.test/${mediaId}.png`,
      upload: async () => ({
        id: "uploaded-image",
        url: "https://cdn.example.test/uploaded-image.png",
        mediaType: "image",
        fileName: "uploaded-image.png",
        mimeType: "image/png",
        size: 10,
      }),
      list: async () => [
        {
          id: "library-image",
          url: "https://cdn.example.test/library-image.png",
          mediaType: "image",
          fileName: "library-image.png",
          mimeType: "image/png",
          size: 10,
        },
      ],
    };

    renderAuthoringEditor(editor, mediaPort);

    fireEvent.click(await screen.findByRole("button", { name: "Add hotspot image" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Choose image: library-image.png",
      }),
    );

    await waitFor(() => {
      expect(readCanvasData(editor).image).toEqual({
        mode: "managed",
        mediaId: "library-image",
      });
    });

    editor.destroy();
  });

  it("scopes the image picker to the owning hotspot block id", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "hs-1" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas" },
            assessmentActions(),
          ],
        },
        {
          type: "image_hotspot",
          attrs: { id: "hs-2" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas" },
            assessmentActions(),
          ],
        },
      ],
    });

    const list = vi.fn(async () => [
      {
        id: "library-image",
        url: "https://cdn.example.test/library-image.png",
        mediaType: "image" as const,
        fileName: "library-image.png",
        mimeType: "image/png",
        size: 10,
      },
    ]);
    const mediaPort: MediaPort = {
      resolve: async (mediaId) => `https://cdn.example.test/${mediaId}.png`,
      upload: async () => ({
        id: "uploaded-image",
        url: "https://cdn.example.test/uploaded-image.png",
        mediaType: "image",
        fileName: "uploaded-image.png",
        mimeType: "image/png",
        size: 10,
      }),
      list,
    };

    renderAuthoringEditor(editor, mediaPort);

    const pickers = await screen.findAllByRole("button", {
      name: "Add hotspot image",
    });
    expect(pickers).toHaveLength(2);

    fireEvent.click(pickers[0]!);

    const dialog = await screen.findByRole("dialog", {
      name: "Add hotspot image",
    });

    expect(screen.getAllByRole("dialog", { name: "Add hotspot image" })).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(dialog.isConnected).toBe(false);
    });

    editor.destroy();
  });

  it("removes hotspot geometry, correctness, and feedback in one outer transaction", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "hs-1",
            assessment: {
              ...sampleAssessment,
              feedbackByHotspotId: { h2: richFeedback("Second hotspot feedback") },
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });

    renderAssessmentEditor(editor);

    fireEvent.click(await screen.findByRole("button", { name: "Edit hotspot 2: B" }));
    const title = await screen.findByText("Hotspot 2");
    const popover = title.closest(`[${AUTHORING_CHROME_ATTR}]`);
    expect(popover?.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);

    fireEvent.click(screen.getByRole("button", { name: "Mark as correct" }));
    await waitFor(() => {
      const block = editor.getJSON().content?.[0] as JSONContent | undefined;
      expect(block?.attrs?.["assessment"]).toMatchObject({
        correctHotspotIds: expect.arrayContaining(["h2"]),
      });
    });
    expect(screen.getByText("Hotspot 2")).toBeInTheDocument();

    let transactionCount = 0;
    editor.on("transaction", () => {
      transactionCount += 1;
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete hotspot 2" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Edit hotspot 2: B" })).toBeNull();
      expect(readCanvasData(editor).hotspots.map((h) => h.id)).toEqual(["h1", "h3"]);
      const block = editor.getJSON().content?.[0] as JSONContent | undefined;
      expect(block?.attrs?.["assessment"]).toMatchObject({
        correctHotspotIds: ["h1", "h3"],
        feedbackByHotspotId: {},
      });
    });
    expect(transactionCount).toBe(1);

    editor.destroy();
  });

  it("uses the common editable popover shell for compact hotspot details", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [imageHotspotBlock("hs-compact-common-shell")],
    });

    renderAssessmentEditor(editor);

    fireEvent.click(await screen.findByRole("button", { name: "Edit hotspot 2: B" }));

    const popover = await screen.findByRole("dialog", { name: "Hotspot 2" });
    expect(popover.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);
    const body = popover.querySelector<HTMLElement>('[data-slot="popover-surface-body"]');
    expect(body).not.toBeNull();
    expect(popover.querySelector("[data-scaffold-nested-rich-text-editor-field]")).not.toBeNull();
    expect(within(popover).getByPlaceholderText("Short label for this region")).toBeInTheDocument();
    expect(within(popover).getByRole("button", { name: "Mark as correct" })).toBeInTheDocument();
    expect(within(popover).getByRole("button", { name: "Delete hotspot 2" })).toBeInTheDocument();
    const formattingToolbar = screen.getByRole("toolbar", { name: "Text formatting" });
    expect(body?.contains(formattingToolbar)).toBe(true);
    expect(imageHotspotBubbleMenuMock.props.at(-1)?.appendTo?.()).toBe(body);

    editor.destroy();
  });

  it("keeps geometry dragging separate from the hotspot details popover", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "hs-geometry-mode", assessment: sampleAssessment },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const canvas = await screen.findByRole("group", {
      name: "Image hotspot authoring area",
    });
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    Object.defineProperties(canvas, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(canvas, {
      button: 0,
      buttons: 1,
      clientX: 60,
      clientY: 40,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      buttons: 0,
      clientX: 60,
      clientY: 40,
      pointerId: 1,
    });

    const marker = await screen.findByRole("button", { name: "Edit hotspot 2: B" });
    await waitFor(() => {
      expect(marker.getAttribute("data-hotspot-selected")).toBe("true");
      expect(marker.getAttribute("aria-expanded")).toBe("false");
    });
    expect(screen.queryByText("Hotspot 2")).toBeNull();

    fireEvent.click(marker);
    expect(await screen.findByText("Hotspot 2")).toBeInTheDocument();

    const beforeSuppressedDrag = readCanvasData(editor).hotspots.find((h) => h.id === "h2");
    fireEvent.pointerDown(canvas, {
      button: 0,
      buttons: 1,
      clientX: 66,
      clientY: 40,
      pointerId: 2,
    });
    fireEvent.pointerMove(canvas, {
      buttons: 1,
      clientX: 76,
      clientY: 40,
      pointerId: 2,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      buttons: 0,
      clientX: 76,
      clientY: 40,
      pointerId: 2,
    });

    await waitFor(() => {
      expect(screen.queryByText("Hotspot 2")).toBeNull();
    });
    expect(readCanvasData(editor).hotspots.find((h) => h.id === "h2")).toEqual(
      beforeSuppressedDrag,
    );

    fireEvent.pointerDown(canvas, {
      button: 0,
      buttons: 1,
      clientX: 60,
      clientY: 40,
      pointerId: 3,
    });
    fireEvent.pointerMove(canvas, {
      buttons: 1,
      clientX: 70,
      clientY: 50,
      pointerId: 3,
    });

    expect(readCanvasData(editor).hotspots.find((h) => h.id === "h2")).toEqual(
      beforeSuppressedDrag,
    );
    await waitFor(() => {
      expect(marker.style.left).toBe("70%");
      expect(marker.style.top).toBe("50%");
    });

    fireEvent.pointerUp(canvas, {
      button: 0,
      buttons: 0,
      clientX: 70,
      clientY: 50,
      pointerId: 3,
    });

    await waitFor(() => {
      const moved = readCanvasData(editor).hotspots.find((h) => h.id === "h2");
      expect(moved).toMatchObject({
        centerX: 70,
        centerY: 50,
        radius: 6,
      });
    });

    const beforeResize = readCanvasData(editor).hotspots.find((h) => h.id === "h2");
    fireEvent.pointerDown(canvas, {
      button: 0,
      buttons: 1,
      clientX: 76,
      clientY: 50,
      pointerId: 4,
    });
    fireEvent.pointerMove(canvas, {
      buttons: 1,
      clientX: 86,
      clientY: 50,
      pointerId: 4,
    });

    expect(readCanvasData(editor).hotspots.find((h) => h.id === "h2")).toEqual(beforeResize);

    fireEvent.pointerUp(canvas, {
      button: 0,
      buttons: 0,
      clientX: 86,
      clientY: 50,
      pointerId: 4,
    });

    await waitFor(() => {
      const resized = readCanvasData(editor).hotspots.find((h) => h.id === "h2");
      expect(resized).toMatchObject({
        centerX: 70,
        centerY: 50,
      });
      expect(resized?.radius).toBeGreaterThan(6);
    });

    editor.destroy();
  });

  it("renders authoring and runtime canvases through the shared surface contract", async () => {
    const authoringEditor = makeEditor();
    authoringEditor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "hs-author", assessment: sampleAssessment },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });

    renderAssessmentEditor(authoringEditor);

    expect(
      (await screen.findByAltText("sample"))
        .closest("[data-image-hotspot-canvas-surface]")
        ?.getAttribute("data-image-hotspot-canvas-surface"),
    ).toBe("authoring");

    cleanup();
    authoringEditor.destroy();

    const runtimeEditor = makeRuntimeEditor();
    runtimeEditor.setEditable(false);
    runtimeEditor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "hs-runtime",
            assessment: sampleAssessment,
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              legend: "Find the regions",
              points: 1,
              maxAttempts: null,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });

    renderRuntimeEditor(runtimeEditor, {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    });

    await waitFor(() => {
      expect(
        screen
          .getByAltText("sample")
          .closest("[data-image-hotspot-canvas-surface]")
          ?.getAttribute("data-image-hotspot-canvas-surface"),
      ).toBe("runtime");
    });

    runtimeEditor.destroy();
  });

  it("persists hotspot feedback through attr-backed rich text", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "hs-feedback", assessment: sampleAssessment },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });

    renderAssessmentEditor(editor);

    fireEvent.click(await screen.findByRole("button", { name: "Edit hotspot 2: B" }));
    const feedbackEditor = await screen.findByLabelText("Hotspot 2 feedback");

    expect(feedbackEditor.getAttribute("data-attr-rich-text-field")).toBe(
      "image_hotspot:hs-feedback:hotspot:h2:feedback",
    );
    expect(feedbackEditor.getAttribute("data-inline-editor-field")).toBeNull();

    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Look near the middle." : ""),
      },
    });

    await waitFor(() => {
      const block = editor.getJSON().content?.[0] as JSONContent | undefined;
      expect(block?.attrs?.["assessment"]).toMatchObject({
        feedbackByHotspotId: {
          h2: richFeedback("Look near the middle."),
        },
      });
    });

    editor.destroy();
  });

  it("routes compact feedback keyboard undo and redo through the outer editor", async () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-feedback-history")],
      },
      undoRedo: true,
    });

    renderAssessmentEditor(editor);

    fireEvent.click(await screen.findByRole("button", { name: "Edit hotspot 2: B" }));
    const nestedEditor = await latestNestedHotspotEditor();

    nestedEditor.commands.insertContent("Saved feedback");
    await waitFor(() => {
      expect(readAuthoredHotspotFeedback(editor, "hs-feedback-history", "h2")).toMatchObject(
        richFeedback("Saved feedback").document,
      );
    });

    fireEvent.keyDown(nestedEditor.view.dom, { ctrlKey: true, key: "z" });
    await waitFor(() => {
      expect(readAuthoredHotspotFeedback(editor, "hs-feedback-history", "h2")).toBeNull();
      expect(nestedEditor.getText()).toBe("");
    });

    fireEvent.keyDown(nestedEditor.view.dom, { ctrlKey: true, key: "z", shiftKey: true });
    await waitFor(() => {
      expect(readAuthoredHotspotFeedback(editor, "hs-feedback-history", "h2")).toMatchObject(
        richFeedback("Saved feedback").document,
      );
      expect(nestedEditor.getText()).toBe("Saved feedback");
    });

    editor.destroy();
  });

  it("writes compact feedback to the live hotspot ancestor after the canvas shifts", async () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-shifted-feedback")],
      },
    });

    renderAssessmentEditor(editor);
    fireEvent.click(await screen.findByRole("button", { name: "Edit hotspot 2: B" }));
    const nestedEditor = await latestNestedHotspotEditor();

    editor.commands.insertContentAt(0, {
      type: "paragraph",
      content: [{ type: "text", text: "Inserted before the hotspot." }],
    });
    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe("paragraph");
    });

    nestedEditor.commands.insertContent("Feedback after shift");
    await waitFor(() => {
      expect(readAuthoredHotspotFeedback(editor, "hs-shifted-feedback", "h2")).toMatchObject(
        richFeedback("Feedback after shift").document,
      );
    });

    editor.destroy();
  });

  it("does not dispatch a nested feedback write after the stable owner target disappears", async () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [imageHotspotBlock("hs-removed-feedback-target")],
      },
    });

    renderAssessmentEditor(editor);
    fireEvent.click(await screen.findByRole("button", { name: "Edit hotspot 2: B" }));
    const nestedEditor = await latestNestedHotspotEditor();
    const owner = editor.state.doc.firstChild;
    if (!owner) throw new Error("Expected image-hotspot owner");
    let transactionCount = 0;
    editor.on("transaction", () => {
      transactionCount += 1;
    });

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, {
        ...owner.attrs,
        id: "replacement-hotspot-owner",
      }),
    );
    if (!nestedEditor.isDestroyed) nestedEditor.commands.insertContent("Must not persist");

    await waitFor(() => {
      expect(transactionCount).toBe(1);
      expect(readAuthoredHotspotFeedback(editor, "replacement-hotspot-owner", "h2")).toBeNull();
    });

    editor.destroy();
  });

  it("renders registry-backed responsive resize chrome when selected", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "image-hotspot-resize-test" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });

    selectFirstNode(editor);
    renderAssessmentEditor(editor);

    const wrapper = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>("[data-authoring-frame-wrapper]");
      expect(element).not.toBeNull();
      return element;
    });

    expect(wrapper?.dataset["authoringFrameResizeMode"]).toBe("responsive");
    expect(
      document.body.querySelector<HTMLElement>(
        '[data-authoring-frame="block"][data-node="image_hotspot"]',
      )?.dataset["authoringFrameResizeMode"],
    ).toBe("responsive");
    expect(document.body.querySelectorAll("[data-authoring-resize-handle]")).toHaveLength(5);

    editor.destroy();
  });

  it("round-trips a full composite tree across settings and canvas attrs", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "hs-1",
            assessment: sampleAssessment,
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              legend: "Find the regions",
              points: 3,
              maxAttempts: 2,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            {
              type: "assessment_prompt",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Click the correct regions" }],
                },
              ],
            },
            {
              type: "image_hotspot_canvas",
              attrs: { data: sampleCanvasData },
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const json = editor.getJSON();
    const block = json.content?.[0] as JSONContent | undefined;
    expect(block?.attrs?.["quick"]).toBeUndefined();
    expect(block?.attrs).not.toHaveProperty("data");
    expect(block?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      legend: "Find the regions",
      points: 3,
      maxAttempts: 2,
    });
    expect(block?.content?.length).toBe(5);
    expect(block?.content?.[3]?.attrs?.["data"]).toMatchObject(sampleCanvasData);
    const canvas = (block?.content as JSONContent[] | undefined)?.[3];
    expect(canvas?.type).toBe("image_hotspot_canvas");
    expect(block?.content?.[4]?.type).toBe("assessment_actions_group");
    const data = canvas?.attrs?.["data"] as { hotspots: Array<{ id: string }> } | undefined;
    expect(data?.hotspots.map((h) => h.id)).toEqual(["h1", "h2", "h3"]);
    expect(block?.attrs?.["assessment"]).toMatchObject({
      correctHotspotIds: ["h1", "h3"],
    });
    editor.destroy();
  });

  it("parses defaults when canvas and settings attrs are absent", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas" },
            assessmentActions(),
          ],
        },
      ],
    });
    const block = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(block?.attrs?.["quick"]).toBeUndefined();
    expect(block?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    const canvas = (block?.content as JSONContent[] | undefined)?.[3];
    const data = canvas?.attrs?.["data"] as
      | {
          hotspots: unknown[];
          debug: boolean;
        }
      | undefined;
    expect(data?.hotspots).toEqual([]);
    expect(data?.debug).toBe(false);
    editor.destroy();
  });

  it("lets shared assessment children resolve their image_hotspot ancestor", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: { id: "hs-1" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });

    let hintsGroupPos: number | undefined;
    let summaryFeedbackPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "assessment_hints_group") hintsGroupPos = pos;
      if (node.type.name === "assessment_summary_feedback") summaryFeedbackPos = pos;
    });

    expect(findAncestorAssessmentId(editor, hintsGroupPos, ["image_hotspot"])).toBe("hs-1");
    expect(findAncestorAssessmentId(editor, summaryFeedbackPos, ["image_hotspot"])).toBe("hs-1");
    editor.destroy();
  });

  it("adds hints to the live image hotspot group after the mounted NodeView shifts", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [imageHotspotBlock("hs-original")],
    });

    renderAssessmentEditor(editor);

    await screen.findByRole("button", { name: "Add hint" });

    editor.commands.insertContentAt(0, imageHotspotBlock("hs-before"));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Add hint" })).toHaveLength(2);
    });

    const originalBlock = document.body.querySelector<HTMLElement>(
      '[data-node="image_hotspot"][data-id="hs-original"]',
    );
    if (!originalBlock) throw new Error("expected shifted original image hotspot block");

    fireEvent.click(within(originalBlock).getByRole("button", { name: "Add hint" }));

    await waitFor(() => {
      expect(assessmentHintCountByImageHotspotId(editor, "hs-original")).toBe(1);
    });
    expect(assessmentHintCountByImageHotspotId(editor, "hs-before")).toBe(0);
    expect(topLevelNodeCount(editor, "image_hotspot")).toBe(2);

    editor.destroy();
  });

  it("records runtime clicks against the addressed assessment problem", async () => {
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "hs-1",
            assessment: sampleAssessment,
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              legend: "Find the regions",
              points: 1,
              maxAttempts: null,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });
    const problemId = "artifact:artifact-1/block:hs-1";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    const image = screen.getByAltText("sample");
    const canvas = image.parentElement;
    if (!canvas) throw new Error("expected hotspot canvas");
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(canvas, { clientX: 20, clientY: 20 });

    await waitFor(() => {
      const clicks = localAssessmentResponse(assessmentStore, problemId)?.["clicks"] as
        | Array<{ hotspotId: string | null }>
        | undefined;
      expect(clicks).toHaveLength(1);
      expect(clicks?.[0]?.hotspotId).toBe("h1");
    });

    editor.destroy();
  });

  it("opens a runtime expanded workspace that records clicks in the assessment store", async () => {
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "hs-runtime-expanded",
            assessment: sampleAssessment,
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              legend: "Find the regions",
              points: 1,
              maxAttempts: null,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });
    const problemId = "artifact:artifact-1/block:hs-runtime-expanded";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Answer in expanded hotspot workspace",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Answer image hotspot",
    });
    const image = within(dialog).getByAltText("sample");
    const canvas = image.closest<HTMLElement>("[data-image-hotspot-canvas-surface]");
    if (!canvas) throw new Error("expected expanded hotspot canvas");
    const workspaceBody = canvas.closest<HTMLElement>(".sc-image-hotspot-runtime-workspace__body");
    expect(workspaceBody?.parentElement).toBe(dialog);
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(canvas, { clientX: 20, clientY: 20 });

    await waitFor(() => {
      const clicks = localAssessmentResponse(assessmentStore, problemId)?.["clicks"] as
        | Array<{ hotspotId: string | null }>
        | undefined;
      expect(clicks).toHaveLength(1);
      expect(clicks?.[0]?.hotspotId).toBe("h1");
    });

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Close expanded hotspot workspace",
      }),
    );

    editor.destroy();
  });

  it("hides response toolbar chrome for a hydrated submitted hotspot", async () => {
    const targetId = "hs-submitted-review";
    const initialSnapshot = assessmentSnapshot({
      problems: {
        [targetId]: hotspotProblemSnapshot({
          clicks: [{ x: 20, y: 20, hotspotId: "h1" }],
          result: {
            isCorrect: true,
            score: 1,
            maxScore: 1,
            feedback: null,
            items: { h1: { correct: true, expected: true, given: true } },
          },
        }),
      },
    });
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [imageHotspotBlock(targetId)],
    });

    renderRuntimeEditor(
      editor,
      {
        type: "runtime",
        submit: async (args) =>
          assessmentProblemOutcome(
            { ...canonicalAssessmentResult, isCorrect: false, score: 0 },
            { response: args.response },
          ),
      },
      initialSnapshot,
    );

    await screen.findByAltText("sample");
    expect(
      document.body.querySelector('[data-hotspot-marker-id="hydrated-click-1"]'),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Answer in expanded hotspot workspace" }),
    ).toBeNull();
    expect(document.body.querySelector(".sc-image-hotspot-runtime-toolbar")).toBeNull();

    editor.destroy();
  });

  it("restores expanded response access after resetting a retryable hotspot", async () => {
    const user = userEvent.setup();
    const targetId = "hs-retry-open";
    const problemId = `artifact:artifact-1/block:${targetId}`;
    const initialSnapshot = assessmentSnapshot({
      problems: {
        [targetId]: hotspotProblemSnapshot({
          clicks: [{ x: 60, y: 40, hotspotId: "h2" }],
          result: {
            isCorrect: false,
            score: 0,
            maxScore: 1,
            feedback: null,
            items: { h2: { correct: false, given: true } },
          },
        }),
      },
    });
    const block = imageHotspotBlock(targetId);
    block.attrs = {
      ...block.attrs,
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        legend: "Find the regions",
        points: 1,
        maxAttempts: 2,
      },
    };
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [block],
    });

    renderRuntimeEditor(
      editor,
      {
        type: "runtime",
        submit: async (args) =>
          assessmentProblemOutcome(
            { ...canonicalAssessmentResult, isCorrect: false, score: 0 },
            { response: args.response },
          ),
      },
      initialSnapshot,
    );

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Answer in expanded hotspot workspace" }),
      ).toBeInTheDocument();
      expect(localAssessmentResponse(assessmentStore, problemId)).toBeNull();
    });

    editor.destroy();
  });

  it("outlines policy-authorized correct hotspots in hydrated full Quiz review", async () => {
    const targetId = "hs-full-review";
    const problemId = `artifact:artifact-1/block:${targetId}`;
    const result: AssessmentResult = {
      isCorrect: false,
      score: 0,
      maxScore: 1,
      feedback: null,
      items: {
        h1: { correct: false, expected: true, given: false },
        h2: { correct: false, expected: false, given: true },
      },
    };
    const initialSnapshot = assessmentSnapshot({
      problems: {
        [targetId]: hotspotProblemSnapshot({
          clicks: [{ x: 60, y: 40, hotspotId: "h2" }],
          result,
        }),
      },
      quizzes: {
        "quiz-hotspot-full-review": completedQuizSnapshot({
          attemptId: "attempt-hotspot-full-review",
          result,
          targetId,
        }),
      },
    });
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [imageHotspotBlock(targetId)],
    });

    renderRuntimeEditor(
      editor,
      {
        type: "runtime",
        submit: async (args) =>
          assessmentProblemOutcome(
            { ...canonicalAssessmentResult, isCorrect: false, score: 0 },
            { response: args.response },
          ),
      },
      initialSnapshot,
    );

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });
    assessmentStore?.getState().registerQuiz({
      groupId: "quiz-hotspot-full-review",
      targetIds: [targetId],
      settings: {
        allowBacktracking: true,
        reviewTiming: "after_quiz",
        reviewDetail: "full_review",
        attemptsPerQuestion: 1,
        isGraded: true,
        timer: { enabled: false, durationSeconds: 0 },
      },
    });

    await waitFor(() => {
      expect(document.body.querySelector('[data-revealed-hotspot-id="h1"]')?.textContent).toBe(
        "Revealed correct hotspot 1: A",
      );
    });
    expect(describedText('[data-hotspot-marker-id="hydrated-click-1"]')).toBe(
      "Revealed click, incorrect",
    );

    editor.destroy();
  });

  it("keeps correct hotspots hidden in hydrated result-only Quiz review", async () => {
    const user = userEvent.setup();
    const targetId = "hs-result-only-review";
    const problemId = `artifact:artifact-1/block:${targetId}`;
    const result: AssessmentResult = {
      isCorrect: false,
      score: 0,
      maxScore: 1,
      feedback: null,
      items: {
        h1: { correct: false, expected: true, given: false },
        h2: { correct: false, expected: false, given: true },
      },
    };
    const initialSnapshot = assessmentSnapshot({
      problems: {
        [targetId]: hotspotProblemSnapshot({
          clicks: [{ x: 60, y: 40, hotspotId: "h2" }],
          result: {
            ...result,
            items: {
              ...result.items,
              h2: {
                ...result.items["h2"]!,
                feedback: richFeedback("This answer feedback must remain private."),
              },
            },
          },
        }),
      },
      quizzes: {
        "quiz-hotspot-result-only": completedQuizSnapshot({
          attemptId: "attempt-hotspot-result-only",
          result,
          targetId,
        }),
      },
    });
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [imageHotspotBlock(targetId)],
    });

    renderRuntimeEditor(
      editor,
      {
        type: "runtime",
        submit: async (args) =>
          assessmentProblemOutcome(
            { ...canonicalAssessmentResult, isCorrect: false, score: 0 },
            { response: args.response },
          ),
      },
      initialSnapshot,
    );

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });
    assessmentStore?.getState().registerQuiz({
      groupId: "quiz-hotspot-result-only",
      targetIds: [targetId],
      settings: {
        allowBacktracking: true,
        reviewTiming: "after_quiz",
        reviewDetail: "result_only",
        attemptsPerQuestion: 1,
        isGraded: true,
        timer: { enabled: false, durationSeconds: 0 },
      },
    });

    const marker = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-hotspot-marker-id="hydrated-click-1"]',
      );
      expect(element).not.toBeNull();
      return element;
    });
    expect(document.body.querySelector('[data-revealed-hotspot-id="h1"]')).toBeNull();
    expect(describedText('[data-hotspot-marker-id="hydrated-click-1"]')).toBe("Submitted click");
    expect(marker?.getAttribute("aria-label")).toBe("Submitted");
    expect(document.body.querySelector("[data-hotspot-marker-feedback-icon]")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Answer in expanded hotspot workspace" }),
    ).toBeNull();
    if (!marker) throw new Error("Expected result-only hotspot marker");
    await user.click(marker);
    expect(screen.queryByText("This answer feedback must remain private.")).toBeNull();

    editor.destroy();
  });

  it("describes pending image hotspot clicks and click limits", async () => {
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "hs-1",
            assessment: sampleAssessment,
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              legend: "Find the regions",
              points: 1,
              maxAttempts: null,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "image_hotspot_canvas",
              attrs: { data: { ...sampleCanvasData, maxClicks: 1 } },
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(describedText('[aria-label="Image hotspot response area"]')).toBe(
        "0 of 1 click placed",
      );
    });

    const image = screen.getByAltText("sample");
    const canvas = image.parentElement;
    if (!canvas) throw new Error("expected hotspot canvas");
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(canvas, { clientX: 20, clientY: 20 });

    await waitFor(() => {
      expect(describedText('[aria-label="Image hotspot response area"]')).toBe(
        "1 of 1 click placed. Click limit reached",
      );
      expect(describedText("[data-hotspot-marker-id]")).toBe("Pending click");
    });
    expect(
      screen.getByRole("button", { name: "Answer in expanded hotspot workspace" }),
    ).toBeInTheDocument();

    editor.destroy();
  });

  it("describes submitted image hotspot marker correctness", async () => {
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "hs-1",
            assessment: sampleAssessment,
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              legend: "Find the regions",
              points: 1,
              maxAttempts: null,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });
    const problemId = "artifact:artifact-1/block:hs-1";
    let submittedResponse: unknown = null;
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) => {
        submittedResponse = args.response;
        return assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              h2: {
                correct: false,
                feedback: richFeedback("Try another region."),
              },
            },
          },
          { response: args.response },
        );
      },
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });
    expect(
      setAssessmentResponseField(assessmentStore, problemId, "clicks", [
        { id: "click-1", x: 60, y: 40, hotspotId: "h2" },
      ]),
    ).toBe(true);
    const identity = assessmentProblemIdentity(assessmentStore, problemId);
    if (!assessmentStore || !identity) throw new Error("expected scoped hotspot registration");
    await assessmentStore.getState().submit(identity);

    expect(submittedResponse).toEqual({
      kind: "spatial-hotspot",
      selections: [{ hotspotId: "h2", x: 60, y: 40 }],
    });

    await waitFor(() => {
      expect(describedText('[data-hotspot-marker-id="hydrated-click-1"]')).toBe(
        "Submitted click, incorrect. Feedback available",
      );
    });

    const marker = document.body.querySelector<HTMLElement>(
      '[data-hotspot-marker-id="hydrated-click-1"]',
    );
    expect(marker).not.toBeNull();
    expect(marker?.querySelector("[data-hotspot-marker-feedback-icon]")).toBeNull();
    fireEvent.focus(marker!);
    expect(marker?.querySelector("[data-hotspot-marker-feedback-icon]")).not.toBeNull();
    fireEvent.blur(marker!);
    expect(marker?.querySelector("[data-hotspot-marker-feedback-icon]")).toBeNull();
    fireEvent.mouseEnter(marker!);
    expect(marker?.querySelector("[data-hotspot-marker-feedback-icon]")).not.toBeNull();
    fireEvent.click(marker!);
    fireEvent.blur(marker!);

    const feedbackDialog = await screen.findByRole("dialog", { name: "Feedback" });
    expect(
      within(feedbackDialog).getByRole("heading", { name: "Feedback", level: 2 }),
    ).toBeInTheDocument();
    expect(within(feedbackDialog).getByText("Try another region.")).toBeInstanceOf(HTMLElement);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Feedback" })).toBeNull();
    });

    editor.destroy();
  });

  it("keeps empty and missing runtime marker feedback absent", async () => {
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [imageHotspotBlock("hs-empty-invalid-feedback")],
    });
    const problemId = "artifact:artifact-1/block:hs-empty-invalid-feedback";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              h1: {
                correct: false,
                feedback: {
                  kind: "rich-text",
                  document: { type: "doc", content: [{ type: "paragraph" }] },
                },
              },
              h2: { correct: false },
            },
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });
    expect(
      setAssessmentResponseField(assessmentStore, problemId, "clicks", [
        { id: "empty-feedback", x: 20, y: 20, hotspotId: "h1" },
        { id: "invalid-feedback", x: 60, y: 40, hotspotId: "h2" },
      ]),
    ).toBe(true);
    const identity = assessmentProblemIdentity(assessmentStore, problemId);
    if (!assessmentStore || !identity) throw new Error("expected scoped hotspot registration");
    await assessmentStore.getState().submit(identity);

    await waitFor(() => {
      expect(describedText('[data-hotspot-marker-id="hydrated-click-1"]')).toBe(
        "Submitted click, incorrect",
      );
      expect(describedText('[data-hotspot-marker-id="hydrated-click-2"]')).toBe(
        "Submitted click, incorrect",
      );
    });
    expect(screen.queryByRole("dialog", { name: "Feedback" })).toBeNull();

    editor.destroy();
  });

  it("describes revealed image hotspot answers from the port payload", async () => {
    const editor = makeRuntimeEditor();
    editor.setEditable(false);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "hs-1",
            assessment: sampleAssessment,
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              legend: "Find the regions",
              points: 1,
              maxAttempts: null,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: sampleCanvasData } },
            assessmentActions(),
          ],
        },
      ],
    });
    const problemId = "artifact:artifact-1/block:hs-1";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: { h2: { correct: false } },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "spatial-hotspot",
          gradingMode: "partial-credit",
          correctHotspotIds: ["h1"],
          feedbackByHotspotId: {
            h1: richFeedback("This region is correct."),
          },
          summaryFeedback: null,
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });
    expect(
      setAssessmentResponseField(assessmentStore, problemId, "clicks", [
        { id: "click-1", x: 20, y: 20, hotspotId: "h1" },
      ]),
    ).toBe(true);
    const identity = assessmentProblemIdentity(assessmentStore, problemId);
    if (!assessmentStore || !identity) throw new Error("expected scoped hotspot registration");
    await assessmentStore.getState().submit(identity);
    await assessmentStore.getState().revealAnswer(identity);

    await waitFor(() => {
      expect(document.body.querySelector('[data-revealed-hotspot-id="h1"]')?.textContent).toBe(
        "Revealed correct hotspot 1: A",
      );
      expect(describedText('[data-hotspot-marker-id="hydrated-click-1"]')).toBe(
        "Revealed click, correct. Feedback available",
      );
      expect(describedText('[aria-label="Image hotspot response area"]')).toBe(
        "1 click placed. Answer revealed",
      );
    });

    const marker = document.body.querySelector<HTMLElement>(
      '[data-hotspot-marker-id="hydrated-click-1"]',
    );
    if (!marker) throw new Error("Expected revealed hotspot marker");
    fireEvent.click(marker);

    const feedbackDialog = await screen.findByRole("dialog", { name: "Feedback" });
    expect(
      within(feedbackDialog).getByRole("heading", { name: "Feedback", level: 2 }),
    ).toBeInTheDocument();
    expect(within(feedbackDialog).getByText("This region is correct.")).toBeInstanceOf(HTMLElement);

    editor.destroy();
  });
});

function assessmentHintCountByImageHotspotId(editor: Editor, id: string): number {
  let hintCount = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "image_hotspot" || node.attrs["id"] !== id) return true;

    node.descendants((child) => {
      if (child.type.name === "assessment_hint") hintCount += 1;
      return true;
    });
    return false;
  });
  return hintCount;
}

function topLevelNodeCount(editor: Editor, typeName: string): number {
  let count = 0;
  editor.state.doc.forEach((node) => {
    if (node.type.name === typeName) count += 1;
  });
  return count;
}

async function latestNestedHotspotEditor(): Promise<Editor> {
  await waitFor(() => {
    expect(imageHotspotBubbleMenuMock.props.at(-1)?.editor).toBeDefined();
  });
  const editor = imageHotspotBubbleMenuMock.props.at(-1)?.editor;
  if (!editor) throw new Error("Expected nested image hotspot editor");
  return editor;
}

function readAuthoredHotspotFeedback(editor: Editor, blockId: string, hotspotId: string) {
  let feedbackDocument = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "image_hotspot" || node.attrs["id"] !== blockId) return true;
    const assessment = ImageHotspotPrivateAssessmentSchema.parse(node.attrs["assessment"] ?? {});
    feedbackDocument = assessment.feedbackByHotspotId[hotspotId]?.document ?? null;
    return false;
  });
  return feedbackDocument;
}

function setAuthoredHotspotFeedback(
  editor: Editor,
  blockId: string,
  hotspotId: string,
  text: string,
) {
  let blockPos: number | null = null;
  let nextAttrs: Record<string, unknown> | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image_hotspot" || node.attrs["id"] !== blockId) return true;
    const assessment = ImageHotspotPrivateAssessmentSchema.parse(node.attrs["assessment"] ?? {});
    blockPos = pos;
    nextAttrs = {
      ...node.attrs,
      assessment: {
        ...assessment,
        feedbackByHotspotId: {
          ...assessment.feedbackByHotspotId,
          [hotspotId]: richFeedback(text),
        },
      },
    };
    return false;
  });
  if (blockPos === null || nextAttrs === null) throw new Error("Expected image hotspot block");
  editor.view.dispatch(editor.state.tr.setNodeMarkup(blockPos, undefined, nextAttrs));
}

describe("patchHotspotInCanvasData", () => {
  it("merges public hotspot geometry edits without clearing other fields", () => {
    const moved = patchHotspotInCanvasData(sampleCanvasData, "h2", {
      centerX: 65,
    });
    const h2 = moved.hotspots.find((h) => h.id === "h2");

    expect(h2?.centerX).toBe(65);
    expect(h2?.label).toBe("B");
  });
});
