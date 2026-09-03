// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { NodeSelection, type Transaction } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createSemanticDefinitionLookup } from "@/composition/model/semantic-definition-lookup";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import {
  createSemanticDocumentExtension,
  getSemanticDocumentControllerForEditor,
} from "@/document/authoring/semantic-document";
import {
  requireSemanticActivationBinding,
  semanticActivationRequest,
} from "@/document/authoring/semantic-document/testing/semantic-activation-binding-test-extension";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { createTestNodeIdentityExtension } from "@/editor/testing";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE } from "./content";
import { TimelineAuthoringExtension } from "./timeline-authoring-extension";

const TIMELINE_ID = "timelineN001" as EmbeddedNodeId;
const ENTRY_IDS = ["timeEntry001" as EmbeddedNodeId, "timeEntry002" as EmbeddedNodeId] as const;
const SECOND_TIMELINE_ID = "timelineN002" as EmbeddedNodeId;
const SECOND_ENTRY_IDS = [
  "timeEntry003" as EmbeddedNodeId,
  "timeEntry004" as EmbeddedNodeId,
] as const;
const editors: Editor[] = [];
const runtimeComposition = createCoreScaffoldRuntimeComposition();
const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

afterAll(() => {
  if (scrollToDescriptor) {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollToDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

describe("Timeline semantic navigation", () => {
  it("reveals the exact runtime entry through the configured-presentation coordinator", async () => {
    const editor = makeRuntimeEditor("carousel");
    const rendered = render(createElement(EditorContent, { editor }));
    const initiatingControl = document.createElement("button");
    const click = vi.fn();
    const keydown = vi.fn();
    const pointerdown = vi.fn();

    try {
      document.body.append(initiatingControl);
      initiatingControl.focus();
      document.addEventListener("click", click);
      document.addEventListener("keydown", keydown);
      document.addEventListener("pointerdown", pointerdown);
      const environment = getSemanticTargetInteractionEnvironmentForEditor(editor);
      await waitFor(() => {
        expect(environment.registry.resolve(TIMELINE_ID).kind).toBe("resolved");
      });
      const track = timelineRuntimeTrack(TIMELINE_ID);
      const target = timelineEntry(track, ENTRY_IDS[1]);
      const scrollTo = installGeometry(track, target, "carousel", false);
      const authoredDocument = editor.getJSON();
      const selection = editor.state.selection.toJSON();

      await expect(
        environment.coordinator.activate(ENTRY_IDS[1], {
          origin: "configured-presentation",
        }),
      ).resolves.toEqual({ kind: "reached", requestedId: ENTRY_IDS[1] });

      expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", left: 260 });
      expect(editor.getJSON()).toEqual(authoredDocument);
      expect(editor.state.selection.toJSON()).toEqual(selection);
      expect(document.activeElement).toBe(initiatingControl);
      expect(click).not.toHaveBeenCalled();
      expect(keydown).not.toHaveBeenCalled();
      expect(pointerdown).not.toHaveBeenCalled();

      rendered.unmount();
      expect(environment.registry.resolve(TIMELINE_ID)).toEqual({
        kind: "unavailable",
        ownerId: TIMELINE_ID,
        reason: "owner-unmounted",
      });
    } finally {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", pointerdown);
      initiatingControl.remove();
    }
  });

  it("registers and unregisters its binding while exposing exact persisted entry IDs", async () => {
    const editor = makeEditor("vertical");
    const rendered = renderEditor(editor);
    const controller = getSemanticDocumentControllerForEditor(editor);

    await waitFor(() => {
      expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID).kind).toBe(
        "resolved",
      );
    });
    expect(
      Array.from(document.querySelectorAll<HTMLElement>("[data-timeline-entry-id]")).map(
        (element) => element.dataset.timelineEntryId,
      ),
    ).toEqual(ENTRY_IDS);

    rendered.unmount();
    expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID)).toEqual({
      kind: "unavailable",
      ownerId: TIMELINE_ID,
      reason: "owner-unmounted",
    });
  });

  it.each(["carousel", "vertical"] as const)(
    "reveals the exact offscreen entry in the %s owner and retains semantic selection",
    async (presentation) => {
      const editor = makeEditor(presentation);
      renderEditor(editor);
      const controller = getSemanticDocumentControllerForEditor(editor);
      const targetId = ENTRY_IDS[1];
      await waitFor(() =>
        expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID).kind).toBe(
          "resolved",
        ),
      );
      const track = timelineTrack(TIMELINE_ID);
      const target = timelineEntry(track, targetId);
      const scrollTo = installGeometry(track, target, presentation, false);
      const authoredDocument = editor.getJSON();
      const dispatched: Transaction[] = [];
      const focus = vi.fn();
      const click = vi.fn();
      document.addEventListener("click", click);
      controller.setNavigationEditor({
        dispatch: (transaction) => {
          dispatched.push(transaction);
          editor.view.dispatch(transaction);
        },
        focus,
      });
      const bringIntoView = vi.fn(async () => undefined);
      controller.setNavigationEnvironment({
        presentSurface: vi.fn(async () => undefined),
        bringIntoView,
        createActivationTransaction: (location) =>
          editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, location.from)),
      });

      await expect(controller.select(targetId, { origin: "document-outline" })).resolves.toEqual({
        kind: "reached",
        id: targetId,
      });

      const expectedScroll = presentation === "carousel" ? { left: 260 } : { top: 190 };
      expect(scrollTo).toHaveBeenCalledWith({
        behavior: expect.stringMatching(/^(auto|smooth)$/),
        ...expectedScroll,
      });
      expect(controller.getSnapshot()).toMatchObject({
        selectedId: targetId,
        selectionOrigin: "document-outline",
      });
      expect((editor.state.selection as NodeSelection).node.attrs["id"]).toBe(TIMELINE_ID);
      expect(bringIntoView).toHaveBeenCalledWith(
        controller.getSnapshot().semantics.locationById.get(TIMELINE_ID),
        "smooth",
      );
      expect(dispatched).toHaveLength(1);
      expect(dispatched.every((transaction) => !transaction.docChanged)).toBe(true);
      expect(editor.getJSON()).toEqual(authoredDocument);
      expect(click).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
      document.removeEventListener("click", click);
    },
  );

  it("returns already-visible and rejects a stale or foreign child without scrolling", async () => {
    const editor = makeEditor("vertical");
    renderEditor(editor);
    const controller = getSemanticDocumentControllerForEditor(editor);
    await waitFor(() =>
      expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID).kind).toBe(
        "resolved",
      ),
    );
    const binding = requireSemanticActivationBinding(
      controller.semanticTargetInteractions.registry,
      TIMELINE_ID,
    );
    const track = timelineTrack(TIMELINE_ID);
    const target = timelineEntry(track, ENTRY_IDS[0]);
    const scrollTo = installGeometry(track, target, "vertical", true);

    await expect(
      binding.activate(semanticActivationRequest(TIMELINE_ID, ENTRY_IDS[0])),
    ).resolves.toEqual({ kind: "already-visible", ownerId: TIMELINE_ID, childId: ENTRY_IDS[0] });
    const foreignId = "timeOther001" as EmbeddedNodeId;
    await expect(
      binding.activate(semanticActivationRequest(TIMELINE_ID, foreignId)),
    ).resolves.toEqual({
      kind: "unavailable",
      ownerId: TIMELINE_ID,
      childId: foreignId,
      reason: "child-missing",
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("confines persisted-ID lookup to the current Timeline owner", async () => {
    const editor = makeEditor("vertical", true);
    renderEditor(editor);
    const controller = getSemanticDocumentControllerForEditor(editor);
    await waitFor(() => {
      expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID).kind).toBe(
        "resolved",
      );
      expect(controller.semanticTargetInteractions.registry.resolve(SECOND_TIMELINE_ID).kind).toBe(
        "resolved",
      );
    });
    const binding = requireSemanticActivationBinding(
      controller.semanticTargetInteractions.registry,
      TIMELINE_ID,
    );
    const firstTrack = timelineTrack(TIMELINE_ID);
    const firstEntry = timelineEntry(firstTrack, ENTRY_IDS[0]);
    const scrollTo = installGeometry(firstTrack, firstEntry, "vertical", true);
    expect(timelineEntry(timelineTrack(SECOND_TIMELINE_ID), SECOND_ENTRY_IDS[1])).toBeDefined();

    await expect(
      binding.activate(semanticActivationRequest(TIMELINE_ID, SECOND_ENTRY_IDS[1])),
    ).resolves.toEqual({
      kind: "unavailable",
      ownerId: TIMELINE_ID,
      childId: SECOND_ENTRY_IDS[1],
      reason: "child-missing",
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll for an aborted reveal", async () => {
    const editor = makeEditor("vertical");
    renderEditor(editor);
    const controller = getSemanticDocumentControllerForEditor(editor);
    await waitFor(() =>
      expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID).kind).toBe(
        "resolved",
      ),
    );
    const binding = requireSemanticActivationBinding(
      controller.semanticTargetInteractions.registry,
      TIMELINE_ID,
    );
    const track = timelineTrack(TIMELINE_ID);
    const target = timelineEntry(track, ENTRY_IDS[1]);
    const scrollTo = installGeometry(track, target, "vertical", false);

    const abortedController = new AbortController();
    const abortedActivation = binding.activate(
      semanticActivationRequest(TIMELINE_ID, ENTRY_IDS[1], {
        signal: abortedController.signal,
      }),
    );
    abortedController.abort();
    await expect(abortedActivation).resolves.toEqual({
      kind: "interrupted",
      ownerId: TIMELINE_ID,
      childId: ENTRY_IDS[1],
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll for a reveal superseded before activation", async () => {
    const editor = makeEditor("vertical");
    renderEditor(editor);
    const controller = getSemanticDocumentControllerForEditor(editor);
    await waitFor(() =>
      expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID).kind).toBe(
        "resolved",
      ),
    );
    const binding = requireSemanticActivationBinding(
      controller.semanticTargetInteractions.registry,
      TIMELINE_ID,
    );
    const track = timelineTrack(TIMELINE_ID);
    const target = timelineEntry(track, ENTRY_IDS[1]);
    const scrollTo = installGeometry(track, target, "vertical", false);

    const supersededActivation = binding.activate(
      semanticActivationRequest(TIMELINE_ID, ENTRY_IDS[1]),
    );
    const currentActivation = binding.activate(
      semanticActivationRequest(TIMELINE_ID, ENTRY_IDS[1]),
    );
    await expect(supersededActivation).resolves.toEqual({
      kind: "interrupted",
      ownerId: TIMELINE_ID,
      childId: ENTRY_IDS[1],
    });
    await expect(currentActivation).resolves.toEqual({
      kind: "revealed",
      ownerId: TIMELINE_ID,
      childId: ENTRY_IDS[1],
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("does not scroll for a reveal whose Timeline unmounts before activation", async () => {
    const editor = makeEditor("vertical");
    const rendered = renderEditor(editor);
    const controller = getSemanticDocumentControllerForEditor(editor);
    await waitFor(() =>
      expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID).kind).toBe(
        "resolved",
      ),
    );
    const binding = requireSemanticActivationBinding(
      controller.semanticTargetInteractions.registry,
      TIMELINE_ID,
    );
    const track = timelineTrack(TIMELINE_ID);
    const target = timelineEntry(track, ENTRY_IDS[1]);
    const scrollTo = installGeometry(track, target, "vertical", false);

    const unmountedActivation = binding.activate(
      semanticActivationRequest(TIMELINE_ID, ENTRY_IDS[1]),
    );
    rendered.unmount();
    await expect(unmountedActivation).resolves.toEqual({
      kind: "unavailable",
      ownerId: TIMELINE_ID,
      childId: ENTRY_IDS[1],
      reason: "owner-unmounted",
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(controller.semanticTargetInteractions.registry.resolve(TIMELINE_ID).kind).toBe(
      "unavailable",
    );
  });
});

function makeEditor(presentation: "carousel" | "vertical", includeSecondTimeline = false): Editor {
  const semantics = createSemanticDefinitionLookup({
    blocks: builtInBlockRegistry,
    layouts: builtInLayoutRegistry,
    surfaces: builtInSurfaceVariantRegistry,
  });
  const capabilities = Object.freeze({
    blocks: Object.freeze({
      registry: builtInBlockRegistry,
    }),
    layouts: Object.freeze({ registry: builtInLayoutRegistry }),
    surfaces: Object.freeze({ registry: builtInSurfaceVariantRegistry }),
    contentIdentity: Object.freeze({
      rewrites: Object.freeze({ getByNodeType: () => undefined, hasNodeType: () => false }),
    }),
    documentSemantics: semantics,
  });
  const editor = new Editor({
    extensions: [
      createTestNodeIdentityExtension(),
      createScaffoldCapabilitiesStorageExtension(capabilities),
      createSemanticDocumentExtension(semantics),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TimelineAuthoringExtension,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: documentContent(presentation, includeSecondTimeline),
  });
  editors.push(editor);
  return editor;
}

function makeRuntimeEditor(presentation: "carousel" | "vertical"): Editor {
  const editor = new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({ composition: runtimeComposition }),
    content: documentContent(presentation, false),
  });
  editors.push(editor);
  return editor;
}

function renderEditor(editor: Editor) {
  return render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));
}

function documentContent(
  presentation: "carousel" | "vertical",
  includeSecondTimeline: boolean,
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseDoc001", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceNav01", variant: "page-default" },
            content: [
              {
                type: "region",
                attrs: { id: "regionNav001", role: "main" },
                content: [
                  timelineContent(TIMELINE_ID, ENTRY_IDS, presentation, 0),
                  ...(includeSecondTimeline
                    ? [timelineContent(SECOND_TIMELINE_ID, SECOND_ENTRY_IDS, presentation, 2)]
                    : []),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function timelineContent(
  timelineId: EmbeddedNodeId,
  entryIds: readonly EmbeddedNodeId[],
  presentation: "carousel" | "vertical",
  ordinalOffset: number,
): JSONContent {
  return {
    type: TIMELINE_NODE,
    attrs: {
      id: timelineId,
      data: { type: "timeline", alignment: "alternate", presentation, showAxis: true },
    },
    content: entryIds.map((entryId, index) => {
      const ordinal = ordinalOffset + index + 1;
      return {
        type: TIMELINE_ITEM_NODE,
        attrs: { id: entryId },
        content: [
          paragraph(`paraDate${String(ordinal).padStart(4, "0")}`, `Date ${ordinal}`),
          paragraph(`paraTitle${String(ordinal).padStart(3, "0")}`, `Title ${ordinal}`),
          paragraph(`paraBody${String(ordinal).padStart(4, "0")}`, `Body ${ordinal}`),
        ],
      };
    }),
  };
}

function paragraph(id: string, text: string): JSONContent {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

function timelineTrack(timelineId: EmbeddedNodeId): HTMLElement {
  const track = document.querySelector<HTMLElement>(
    `[data-authoring-frame="block"][data-id="${timelineId}"] .sc-course-timeline__track`,
  );
  if (!track) throw new Error(`Missing track for Timeline ${timelineId}`);
  return track;
}

function timelineRuntimeTrack(timelineId: EmbeddedNodeId): HTMLElement {
  const track = document.querySelector<HTMLElement>(
    `[data-runtime-frame="block"][data-id="${timelineId}"] .sc-course-timeline__track`,
  );
  if (!track) throw new Error(`Missing runtime track for Timeline ${timelineId}`);
  return track;
}

function timelineEntry(track: HTMLElement, entryId: EmbeddedNodeId): HTMLElement {
  const entry = Array.from(track.querySelectorAll<HTMLElement>("[data-timeline-entry-id]")).find(
    (candidate) => candidate.dataset.timelineEntryId === entryId,
  );
  if (!entry) throw new Error(`Missing Timeline entry ${entryId}`);
  return entry;
}

function installGeometry(
  track: HTMLElement,
  target: HTMLElement,
  presentation: "carousel" | "vertical",
  visible: boolean,
) {
  Object.defineProperties(track, {
    clientHeight: { configurable: true, value: 160 },
    clientWidth: { configurable: true, value: 200 },
  });
  track.getBoundingClientRect = () => DOMRect.fromRect({ height: 160, width: 200, x: 20, y: 20 });
  target.getBoundingClientRect = () =>
    presentation === "carousel"
      ? DOMRect.fromRect({
          height: 80,
          width: 80,
          x: (visible ? 80 : 340) - track.scrollLeft,
          y: 50,
        })
      : DOMRect.fromRect({
          height: 60,
          width: 120,
          x: 50,
          y: (visible ? 70 : 260) - track.scrollTop,
        });
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    if (typeof options.left === "number") track.scrollLeft = options.left;
    if (typeof options.top === "number") track.scrollTop = options.top;
  });
  Object.defineProperty(track, "scrollTo", { configurable: true, value: scrollTo });
  return scrollTo;
}
