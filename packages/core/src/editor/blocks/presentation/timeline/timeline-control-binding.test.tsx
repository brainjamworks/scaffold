// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, Node as TiptapNode, type Extensions, type JSONContent } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createDocumentAuthoringExtension } from "@/document/authoring";
import {
  requireSemanticActivationBinding,
  semanticActivationRequest,
} from "@/document/authoring/testing/semantic-activation-binding-test-extension";
import {
  getControlBindingRegistryForEditor,
  type ControlBinding,
  type ControlEvent,
} from "@/document/control-binding";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import { CourseDocumentNode, DocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { LayerNode } from "@/document/model/layers/layer-node";
import type { DocumentTreeDefinitionLookup } from "@/document/model/document-tree";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createTestNodeIdentityExtension } from "@/editor/testing";
import { surfaceAssessmentQuestionSchemaExtensions } from "@/editor/testing/surface-assessment-schema-extensions";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE } from "./content";
import { TimelineItemRuntimeView, TimelineRuntimeView, TimelineView } from "./Timeline";
import { timelineBlockDefinition } from "./timeline-definition";
import { createTimelineNode } from "./node";
import { createTimelineItemNode } from "./slots";

const editors: Editor[] = [];
const resizeObservers = new Set<TestResizeObserver>();
const originalResizeObserver = globalThis.ResizeObserver;
const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
const TIMELINE_ID = "timelineC001" as EmbeddedNodeId;
const ENTRY_IDS = [
  "timeEntry001" as EmbeddedNodeId,
  "timeEntry002" as EmbeddedNodeId,
  "timeEntry003" as EmbeddedNodeId,
] as const;
const semanticDefinitions: DocumentTreeDefinitionLookup = Object.freeze({
  blocks: Object.freeze({
    get: (nodeType: string) =>
      nodeType === TIMELINE_NODE
        ? Object.freeze({
            nodeType: TIMELINE_NODE,
            title: timelineBlockDefinition.title,
            isAssessment: false,
            ...(timelineBlockDefinition.documentTree
              ? { documentTree: timelineBlockDefinition.documentTree }
              : {}),
            ...(timelineBlockDefinition.control
              ? { control: timelineBlockDefinition.control }
              : {}),
          })
        : undefined,
  }),
  layouts: Object.freeze({ get: () => undefined }),
  surfaces: Object.freeze({
    get: (variant: string) =>
      variant === "page-default" ? Object.freeze({ id: "page-default", title: "Page" }) : undefined,
  }),
});
const TestArrangementNode = TiptapNode.create({
  name: "timeline_test_arrangement",
  group: "arrangement",
  content: "block+",
});

class TestResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {
    resizeObservers.add(this);
  }

  disconnect(): void {
    resizeObservers.delete(this);
  }

  observe(): void {}

  unobserve(): void {}

  trigger(): void {
    this.callback([], this);
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
});

afterEach(() => {
  cleanup();
  resizeObservers.clear();
  for (const editor of editors.splice(0)) editor.destroy();
  vi.unstubAllGlobals();
});

afterAll(() => {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: originalResizeObserver,
  });
  if (scrollToDescriptor) {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollToDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

describe("Timeline Control Binding", () => {
  it("declares only the approved public carousel entry capabilities", () => {
    expect((timelineBlockDefinition as BlockDefinition).control).toEqual({
      semanticChildren: {
        timeline_item: {
          events: [{ type: "navigated-to", label: "Navigated to" }],
          states: [
            {
              key: "current",
              label: "Current",
              valueType: { kind: "boolean" },
            },
          ],
          commands: [{ type: "scroll-to", label: "Scroll to" }],
        },
      },
    });
  });

  it("emits one post-settlement event for learner button and gesture navigation", async () => {
    const user = userEvent.setup();
    const editor = createRuntimeEditor("carousel");
    const rendered = render(<EditorContent editor={editor} />);
    const binding = await requireTimelineBinding(editor);
    const geometry = installCarouselGeometry();
    triggerResize();
    const events: ControlEvent[] = [];
    const currentAtEvent: boolean[] = [];
    binding.eventSource?.subscribe((event) => {
      events.push(event);
      currentAtEvent.push(
        binding.stateReader?.read({ targetId: event.targetId, key: "current" }) === true,
      );
    });

    expect(binding.stateReader?.read({ targetId: ENTRY_IDS[0], key: "current" })).toBe(true);
    await user.click(await screen.findByRole("button", { name: "Next event" }));
    expect(geometry.scrollTo).toHaveBeenCalledWith({ behavior: "smooth", left: 200 });

    geometry.track.scrollLeft = 100;
    fireEvent.scroll(geometry.track);
    expect(events).toEqual([]);
    geometry.track.scrollLeft = 200;
    fireEvent.scroll(geometry.track);
    fireEvent(geometry.track, new Event("scrollend"));
    await waitFor(() => expect(events).toEqual([{ targetId: ENTRY_IDS[1], type: "navigated-to" }]));

    fireEvent.wheel(geometry.track);
    geometry.track.scrollLeft = 300;
    fireEvent.scroll(geometry.track);
    expect(events).toHaveLength(1);
    geometry.track.scrollLeft = 400;
    fireEvent.scroll(geometry.track);
    fireEvent(geometry.track, new Event("scrollend"));
    await waitFor(() =>
      expect(events).toEqual([
        { targetId: ENTRY_IDS[1], type: "navigated-to" },
        { targetId: ENTRY_IDS[2], type: "navigated-to" },
      ]),
    );
    expect(currentAtEvent).toEqual([true, true]);

    const next = screen.getByRole("button", { name: "Next event" });
    expect(next).toBeDisabled();
    await user.click(next);
    expect(events).toHaveLength(2);

    fireEvent.wheel(geometry.track);
    fireEvent.scroll(geometry.track);
    fireEvent(geometry.track, new Event("scrollend"));
    expect(events).toHaveLength(2);

    rendered.unmount();
    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(TIMELINE_ID)).toBeUndefined(),
    );
    expect(() => binding.stateReader?.read({ targetId: ENTRY_IDS[0], key: "current" })).toThrow(
      `Control Binding for owner "${TIMELINE_ID}" is no longer mounted.`,
    );
  });

  it("completes commands only at the exact settled target and preserves typed cancellation", async () => {
    const editor = createRuntimeEditor("carousel");
    render(<EditorContent editor={editor} />);
    const binding = await requireTimelineBinding(editor);
    const geometry = installCarouselGeometry();
    triggerResize();
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    const idempotent = await binding.commandExecutor?.execute({
      targetId: ENTRY_IDS[0],
      type: "scroll-to",
      signal: new AbortController().signal,
    });
    expect(idempotent?.isOk()).toBe(true);
    expect(geometry.scrollTo).not.toHaveBeenCalled();

    const preAborted = new AbortController();
    preAborted.abort();
    const cancelled = await binding.commandExecutor?.execute({
      targetId: ENTRY_IDS[1],
      type: "scroll-to",
      signal: preAborted.signal,
    });
    expect(cancelled?.isErr()).toBe(true);
    if (!cancelled || cancelled.isOk()) {
      throw new Error("Expected the pre-aborted Timeline command to be cancelled.");
    }
    expect(cancelled.error).toEqual({ reason: "cancelled" });

    let commandCompleted = false;
    const command = binding.commandExecutor?.execute({
      targetId: ENTRY_IDS[1],
      type: "scroll-to",
      signal: new AbortController().signal,
    });
    void command?.then(() => {
      commandCompleted = true;
    });
    await Promise.resolve();
    expect(commandCompleted).toBe(false);
    expect(geometry.scrollTo).toHaveBeenLastCalledWith({ behavior: "smooth", left: 200 });
    fireEvent.scroll(geometry.track);
    fireEvent(geometry.track, new Event("scrollend"));
    expect((await command)?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: ENTRY_IDS[1], key: "current" })).toBe(true);
    expect(events).toEqual([]);

    const midFlightAbort = new AbortController();
    const abortedCommand = binding.commandExecutor?.execute({
      targetId: ENTRY_IDS[2],
      type: "scroll-to",
      signal: midFlightAbort.signal,
    });
    midFlightAbort.abort();
    const abortedResult = await abortedCommand;
    expect(abortedResult?.isErr()).toBe(true);
    if (!abortedResult || abortedResult.isOk()) {
      throw new Error("Expected the mid-flight Timeline command to be cancelled.");
    }
    expect(abortedResult.error).toEqual({ reason: "cancelled" });
    fireEvent.scroll(geometry.track);
    fireEvent(geometry.track, new Event("scrollend"));
    expect(binding.stateReader?.read({ targetId: ENTRY_IDS[2], key: "current" })).toBe(true);
    expect(events).toEqual([]);

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const reducedMotionCommand = binding.commandExecutor?.execute({
      targetId: ENTRY_IDS[0],
      type: "scroll-to",
      signal: new AbortController().signal,
    });
    expect(geometry.scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", left: 0 });
    fireEvent.scroll(geometry.track);
    fireEvent(geometry.track, new Event("scrollend"));
    expect((await reducedMotionCommand)?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: ENTRY_IDS[0], key: "current" })).toBe(true);
    expect(events).toEqual([]);

    expect(() =>
      binding.stateReader?.read({
        targetId: "foreignTime1" as EmbeddedNodeId,
        key: "current",
      }),
    ).toThrow(`Control target "foreignTime1" does not belong to owner "${TIMELINE_ID}".`);
  });

  it("lets silent editor navigation supersede an in-flight Control command", async () => {
    const editor = createRuntimeEditor("carousel");
    render(<EditorContent editor={editor} />);
    const binding = await requireTimelineBinding(editor);
    const geometry = installCarouselGeometry();
    triggerResize();
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    const controlAbort = new AbortController();
    let controlResult:
      | Awaited<ReturnType<NonNullable<ControlBinding["commandExecutor"]>["execute"]>>
      | undefined;
    const controlCommand = binding.commandExecutor?.execute({
      targetId: ENTRY_IDS[2],
      type: "scroll-to",
      signal: controlAbort.signal,
    });
    void controlCommand?.then((result) => {
      controlResult = result;
    });
    const semanticRegistry = getSemanticTargetInteractionEnvironmentForEditor(editor).registry;
    const semanticNavigation = requireSemanticActivationBinding(
      semanticRegistry,
      TIMELINE_ID,
    ).activate(semanticActivationRequest(TIMELINE_ID, ENTRY_IDS[1]));
    await waitFor(() =>
      expect(geometry.scrollTo).toHaveBeenLastCalledWith({ behavior: "smooth", left: 200 }),
    );
    fireEvent.scroll(geometry.track);
    fireEvent(geometry.track, new Event("scrollend"));
    await expect(semanticNavigation).resolves.toEqual({
      kind: "revealed",
      ownerId: TIMELINE_ID,
      childId: ENTRY_IDS[1],
    });
    await Promise.resolve();
    const wasSuperseded = controlResult?.isErr() === true;
    if (!wasSuperseded) controlAbort.abort();
    expect(wasSuperseded).toBe(true);
    if (!controlResult || controlResult.isOk()) {
      throw new Error("Expected superseded Timeline Control command cancellation.");
    }
    expect(controlResult.error).toEqual({ reason: "cancelled" });
    expect(binding.stateReader?.read({ targetId: ENTRY_IDS[1], key: "current" })).toBe(true);
    expect(events).toEqual([]);
  });

  it("silently reconciles reorder, deletion, geometry reflow and presentation changes", async () => {
    const editor = createRuntimeEditor("carousel");
    render(<EditorContent editor={editor} />);
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireTimelineBinding(editor);
    const geometry = installCarouselGeometry();
    triggerResize();
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    const ownerPosition = requireNodePosition(editor, TIMELINE_ID);
    const owner = editor.state.doc.nodeAt(ownerPosition);
    if (!owner) throw new Error("Expected Timeline owner.");
    const reordered = owner.type.create(owner.attrs, [
      owner.child(1),
      owner.child(0),
      owner.child(2),
    ]);
    editor.view.dispatch(
      editor.state.tr.replaceWith(ownerPosition, ownerPosition + owner.nodeSize, reordered),
    );
    await waitFor(() => {
      expect(registry.get(TIMELINE_ID)).toBe(binding);
      expect(binding.stateReader?.read({ targetId: ENTRY_IDS[1], key: "current" })).toBe(true);
    });
    expect(events).toEqual([]);

    const reorderedOwner = editor.state.doc.nodeAt(ownerPosition);
    if (!reorderedOwner) throw new Error("Expected reordered Timeline owner.");
    const withoutCurrent = reorderedOwner.type.create(reorderedOwner.attrs, [
      reorderedOwner.child(1),
      reorderedOwner.child(2),
    ]);
    editor.view.dispatch(
      editor.state.tr.replaceWith(
        ownerPosition,
        ownerPosition + reorderedOwner.nodeSize,
        withoutCurrent,
      ),
    );
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: ENTRY_IDS[0], key: "current" })).toBe(true);
      expect(() => binding.stateReader?.read({ targetId: ENTRY_IDS[1], key: "current" })).toThrow();
    });
    expect(events).toEqual([]);

    geometry.track.scrollLeft = 200;
    fireEvent.scroll(geometry.track);
    fireEvent(geometry.track, new Event("scrollend"));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: ENTRY_IDS[2], key: "current" })).toBe(true),
    );
    expect(events).toEqual([]);

    const latestOwner = editor.state.doc.nodeAt(ownerPosition);
    if (!latestOwner) throw new Error("Expected current Timeline owner.");
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(ownerPosition, undefined, {
        ...latestOwner.attrs,
        data: { ...latestOwner.attrs["data"], presentation: "vertical" },
      }),
    );
    await waitFor(() => expect(registry.get(TIMELINE_ID)).toBeUndefined());
    expect(events).toEqual([]);
  });

  it("mounts no live binding for vertical runtime or authoring", async () => {
    const vertical = createRuntimeEditor("vertical");
    render(<EditorContent editor={vertical} />);
    await screen.findByRole("list", { name: "Timeline events" });
    expect(getControlBindingRegistryForEditor(vertical).get(TIMELINE_ID)).toBeUndefined();
    cleanup();

    const authoring = createAuthoringEditor();
    render(<EditorContent editor={authoring} />);
    await screen.findByRole("list", { name: "Timeline events" });
    expect(getControlBindingRegistryForEditor(authoring).get(TIMELINE_ID)).toBeUndefined();
  });
});

async function requireTimelineBinding(editor: Editor): Promise<ControlBinding> {
  const registry = getControlBindingRegistryForEditor(editor);
  await waitFor(() => expect(registry.get(TIMELINE_ID)).toBeDefined());
  const binding = registry.get(TIMELINE_ID);
  if (!binding) throw new Error("Expected mounted Timeline Control Binding.");
  return binding;
}

function createRuntimeEditor(presentation: "carousel" | "vertical"): Editor {
  const editor = new Editor({
    editable: false,
    extensions: timelineEditorExtensions("runtime"),
    content: timelineDocument(presentation),
  });
  editors.push(editor);
  return editor;
}

function createAuthoringEditor(): Editor {
  const editor = new Editor({
    editable: true,
    extensions: timelineEditorExtensions("authoring"),
    content: timelineDocument("carousel"),
  });
  editors.push(editor);
  return editor;
}

function timelineEditorExtensions(lifecycle: "authoring" | "runtime"): Extensions {
  const timelineItem = createTimelineItemNode({
    addNodeView: () => ReactNodeViewRenderer(TimelineItemRuntimeView),
  });
  const timeline = createTimelineNode({
    addNodeView: () =>
      ReactNodeViewRenderer(
        lifecycle === "runtime" ? TestTimelineRuntimeView : TestTimelineAuthoringView,
      ),
  });
  return [
    createTestNodeIdentityExtension(),
    createDocumentAuthoringExtension(semanticDefinitions),
    DocumentNode,
    StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
    ExtendedParagraph,
    CourseDocumentNode,
    createCourseSectionNode(),
    SurfaceNode,
    ...surfaceAssessmentQuestionSchemaExtensions,
    RegionNode,
    LayerNode,
    TestArrangementNode,
    timelineItem,
    timeline,
  ];
}

function TestTimelineRuntimeView(props: NodeViewProps) {
  return (
    <NodeViewWrapper>
      <TimelineRuntimeView {...props} />
    </NodeViewWrapper>
  );
}

function TestTimelineAuthoringView(props: NodeViewProps) {
  return (
    <NodeViewWrapper>
      <TimelineView props={props} />
    </NodeViewWrapper>
  );
}

function timelineDocument(presentation: "carousel" | "vertical"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseTime01", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceTime1", variant: "page-default" },
            content: [
              {
                type: "region",
                attrs: { id: "regionTime01", role: "main" },
                content: [createLayerWithContent([timelineContent(presentation)])],
              },
            ],
          },
        ],
      },
    ],
  };
}

function timelineContent(presentation: "carousel" | "vertical"): JSONContent {
  return {
    type: TIMELINE_NODE,
    attrs: {
      id: TIMELINE_ID,
      data: { type: "timeline", alignment: "alternate", presentation, showAxis: true },
    },
    content: ENTRY_IDS.map((id, index) => ({
      type: TIMELINE_ITEM_NODE,
      attrs: { id },
      content: [
        paragraph(`timeDate${String(index + 1).padStart(4, "0")}`, `Date ${index + 1}`),
        paragraph(`timeTitl${String(index + 1).padStart(4, "0")}`, `Title ${index + 1}`),
        paragraph(`timeBody${String(index + 1).padStart(4, "0")}`, `Body ${index + 1}`),
      ],
    })),
  };
}

function paragraph(id: string, text: string): JSONContent {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

function installCarouselGeometry() {
  const track = document.querySelector<HTMLElement>(".sc-course-timeline__track");
  if (!track) throw new Error("Expected Timeline carousel track.");
  Object.defineProperties(track, {
    clientWidth: { configurable: true, value: 200 },
    scrollWidth: { configurable: true, value: 600 },
  });
  track.getBoundingClientRect = () => DOMRect.fromRect({ height: 160, width: 200, x: 0, y: 0 });
  for (const entry of timelineEntries(track)) {
    entry.getBoundingClientRect = () => {
      const index = timelineEntries(track).indexOf(entry);
      return DOMRect.fromRect({
        height: 100,
        width: 80,
        x: 60 + index * 200 - track.scrollLeft,
        y: 20,
      });
    };
  }
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    if (typeof options.left === "number") track.scrollLeft = options.left;
  });
  Object.defineProperty(track, "scrollTo", { configurable: true, value: scrollTo });
  return { scrollTo, track };
}

function timelineEntries(track: HTMLElement): HTMLElement[] {
  return Array.from(track.querySelectorAll<HTMLElement>("[data-timeline-entry-id]"));
}

function triggerResize(): void {
  for (const observer of [...resizeObservers]) observer.trigger();
}

function requireNodePosition(editor: Editor, id: EmbeddedNodeId): number {
  let position: number | undefined;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.attrs["id"] !== id) return true;
    position = nodePosition;
    return false;
  });
  if (position === undefined) throw new Error(`Expected document node "${id}".`);
  return position;
}
