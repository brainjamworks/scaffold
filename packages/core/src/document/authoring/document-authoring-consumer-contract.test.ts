// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import { EditorContent, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type SurfaceCapability,
} from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import {
  getControlBindingRegistryForEditor,
  getControlCapabilityCatalogueForEditor,
} from "@/document/control-binding";
import {
  APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES,
  DOCUMENT_TREE_LIFECYCLE_AUTHORING_STATE,
  createCompleteDocumentTreeLifecycleDocument,
} from "@/composition/application/testing/document-tree-lifecycle-fixtures";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";

import { DocumentTreeViewController, type DocumentTreeViewport } from "./document-tree";
import { getDocumentTreeForEditor } from "./document-tree";
import { getEditorNavigationForEditor } from "./editor-navigation";

const editors: Editor[] = [];
const CURRENT_SURFACE_ID = EmbeddedNodeIdSchema.parse("surfaceCur01");
const OTHER_SURFACE_ID = EmbeddedNodeIdSchema.parse("surfaceOth01");
const CURRENT_LAYOUT_ID = EmbeddedNodeIdSchema.parse("layoutCur001");
const OTHER_LAYOUT_ID = EmbeddedNodeIdSchema.parse("layoutOth001");
const CURRENT_SECTION_IDS = [
  EmbeddedNodeIdSchema.parse("sectionCur01"),
  EmbeddedNodeIdSchema.parse("sectionCur02"),
] as const;
const OTHER_SECTION_ID = EmbeddedNodeIdSchema.parse("sectionOth01");
const CONTROLLED_SURFACE_VARIANT = "control-intersection-surface";

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("document authoring internal consumer contract", () => {
  it("lets independent consumers borrow one environment without owning its disposal", () => {
    const editor = createEditor();
    const outlineBorrower = getSemanticTargetInteractionEnvironmentForEditor(editor);
    const timelineBorrower = getSemanticTargetInteractionEnvironmentForEditor(editor);
    const ownerId = EmbeddedNodeIdSchema.parse("borrower0001");
    const childId = EmbeddedNodeIdSchema.parse("borrower0002");
    const binding = {
      ownerId,
      activate: async () => ({ kind: "already-visible" as const, ownerId, childId }),
    };

    expect(timelineBorrower).toBe(outlineBorrower);
    expect(outlineBorrower).not.toHaveProperty("dispose");
    expect(outlineBorrower.registry).not.toHaveProperty("dispose");

    const releaseOutlineBinding = outlineBorrower.registry.register(binding);
    expect(timelineBorrower.registry.resolve(ownerId)).toEqual({ kind: "resolved", binding });
    releaseOutlineBinding();
    expect(timelineBorrower.registry.resolve(ownerId)).toEqual({
      kind: "unavailable",
      ownerId,
      reason: "owner-unmounted",
    });

    const releaseTimelineBinding = timelineBorrower.registry.register(binding);
    expect(outlineBorrower.registry.resolve(ownerId)).toEqual({ kind: "resolved", binding });
    releaseTimelineBinding();

    editor.destroy();
    expect(() => outlineBorrower.registry.register(binding)).toThrowError(
      "Cannot register a semantic activation binding after registry disposal",
    );
  });

  it("shares separate tree and navigation owners across independent hierarchy views", async () => {
    const editor = createEditor();
    const tree = getDocumentTreeForEditor(editor);
    const navigation = getEditorNavigationForEditor(editor);
    expect(getDocumentTreeForEditor(editor)).toBe(tree);
    expect(getEditorNavigationForEditor(editor)).toBe(navigation);
    const treeSnapshot = tree.getSnapshot();
    expect(Object.isFrozen(treeSnapshot)).toBe(true);
    const surfaceId = treeSnapshot.roots[0]?.id;
    if (!surfaceId) throw new Error("Expected complete hierarchy Surface root.");
    const outlineViewport = new RecordingViewport();
    const timelineViewport = new RecordingViewport();
    const outline = new DocumentTreeViewController({
      tree,
      navigation,
      origin: "document-outline",
      viewport: outlineViewport,
    });
    const timeline = new DocumentTreeViewController({
      tree,
      navigation,
      origin: "presentation-timeline",
      viewport: timelineViewport,
    });

    outline.setExpanded(surfaceId, false);
    timeline.setExpanded(surfaceId, false);
    outlineViewport.clear();
    timelineViewport.clear();
    outline.setExpanded(surfaceId, true);

    expect(outline.getSnapshot().expandedIds.has(surfaceId)).toBe(true);
    expect(timeline.getSnapshot().expandedIds.has(surfaceId)).toBe(false);

    navigation.reportComponentSelection(surfaceId);
    for (const family of APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES) {
      const memberId = family.memberIds.first;
      outlineViewport.clear();
      timelineViewport.clear();
      navigation.reportComponentSelection(memberId);

      expect(outline.getSnapshot().selectedId).toBe(memberId);
      expect(timeline.getSnapshot().selectedId).toBe(memberId);
      expect(tree.getSnapshot()).toBe(treeSnapshot);
      for (const ancestorId of ancestorIds(treeSnapshot.parentById, memberId)) {
        expect(outline.getSnapshot().expandedIds.has(ancestorId)).toBe(true);
        expect(timeline.getSnapshot().expandedIds.has(ancestorId)).toBe(true);
      }
      await Promise.resolve();
      expect(outlineViewport.revealed).toContain(memberId);
      expect(timelineViewport.revealed).toContain(memberId);
    }

    const independentlyCollapsedId = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES[0]!.ownerId;
    outline.setExpanded(independentlyCollapsedId, false);
    expect(outline.getSnapshot().expandedIds.has(independentlyCollapsedId)).toBe(false);
    expect(timeline.getSnapshot().expandedIds.has(independentlyCollapsedId)).toBe(true);

    outline.destroy();
    timeline.destroy();
  });

  it("intersects current-Surface catalogue targets with mounted owner membership", async () => {
    const editor = createControlIntersectionEditor();
    render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));
    const navigation = getEditorNavigationForEditor(editor);
    navigation.reportComponentSelection(CURRENT_SURFACE_ID);
    const snapshot = getDocumentTreeForEditor(editor).getSnapshot();
    const catalogue = getControlCapabilityCatalogueForEditor(editor);
    const registry = getControlBindingRegistryForEditor(editor);

    await waitFor(() => {
      expect(registry.get(CURRENT_LAYOUT_ID)).toBeDefined();
      expect(registry.get(OTHER_LAYOUT_ID)).toBeDefined();
    });

    const actionableCurrentSurfaceTargets = [...snapshot.itemById.keys()].flatMap((targetId) => {
      if (snapshot.locationById.get(targetId)?.surfaceId !== CURRENT_SURFACE_ID) return [];
      const resolved = catalogue.resolve(targetId);
      if (resolved.isErr()) return [];
      return registry.get(resolved.value.ownerId) ? [resolved.value] : [];
    });

    expect(navigation.getSelectionSnapshot().selectedId).toBe(CURRENT_SURFACE_ID);
    expect(actionableCurrentSurfaceTargets.map(({ targetId }) => targetId)).toEqual(
      CURRENT_SECTION_IDS,
    );
    const unmountedSurface = catalogue.resolve(CURRENT_SURFACE_ID);
    expect(unmountedSurface.isOk()).toBe(true);
    if (unmountedSurface.isErr()) throw new Error("Expected controlled current Surface.");
    expect(unmountedSurface.value.ownerId).toBe(CURRENT_SURFACE_ID);
    expect(registry.get(unmountedSurface.value.ownerId)).toBeUndefined();
    expect(actionableCurrentSurfaceTargets).not.toContainEqual(unmountedSurface.value);

    const mountedOtherSurfaceTarget = catalogue.resolve(OTHER_SECTION_ID);
    expect(mountedOtherSurfaceTarget.isOk()).toBe(true);
    if (mountedOtherSurfaceTarget.isErr()) {
      throw new Error("Expected controlled target on the other Surface.");
    }
    expect(registry.get(mountedOtherSurfaceTarget.value.ownerId)).toBeDefined();
    expect(snapshot.locationById.get(OTHER_SECTION_ID)?.surfaceId).toBe(OTHER_SURFACE_ID);
    expect(actionableCurrentSurfaceTargets).not.toContainEqual(mountedOtherSurfaceTarget.value);
  });

  it("keeps the internal seam out of the host-facing authoring entrypoint", () => {
    const authoringEntrypoint = readFileSync(resolve("src/entrypoints/authoring.ts"), "utf8");
    const outlineSource = readFileSync(
      resolve("src/editor/shell/outline/DocumentOutline.tsx"),
      "utf8",
    );

    expect(authoringEntrypoint).not.toContain("DocumentTreeStore");
    expect(authoringEntrypoint).not.toContain("EditorNavigationController");
    expect(authoringEntrypoint).not.toContain("DocumentTreeViewController");
    expect(outlineSource).toContain("@/document/authoring/editor-navigation");
    expect(outlineSource).not.toMatch(
      /@tiptap|ProseMirror|descendants\(|TableOfContents|builtIn|buildDocumentTree|projectStandardRichText|projectStructuralChildren/,
    );
  });
});

class RecordingViewport implements DocumentTreeViewport {
  readonly revealed: EmbeddedNodeId[] = [];

  reveal(itemId: EmbeddedNodeId): void {
    this.revealed.push(itemId);
  }

  clear(): void {
    this.revealed.length = 0;
  }
}

function createEditor(): Editor {
  const editor = new Editor({
    editable: true,
    extensions: DOCUMENT_TREE_LIFECYCLE_AUTHORING_STATE.extensions,
    content: createCompleteDocumentTreeLifecycleDocument().toJSON(),
  });
  editors.push(editor);
  return editor;
}

function createControlIntersectionEditor(): Editor {
  const application = createScaffoldApplication({
    packs: [
      defineScaffoldExtensionPack({
        id: "control-intersection",
        surfaces: [controlIntersectionSurfaceCapability()],
      }),
    ],
  });
  const environment = createCourseDocumentAuthoringEnvironment({
    composition: application.authoring,
    editable: true,
  });
  const editor = new Editor({
    editable: true,
    extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
    content: controlIntersectionDocument(),
  });
  editors.push(editor);
  return editor;
}

function controlIntersectionSurfaceCapability(): SurfaceCapability {
  return {
    definition: {
      id: CONTROLLED_SURFACE_VARIANT,
      modes: ["slideshow"],
      title: "Control intersection Surface",
      description: "Test-only Surface with static capability and no mounted binding",
      control: {
        owner: { commands: [{ type: "advance", label: "Advance" }] },
      },
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: CONTROLLED_SURFACE_VARIANT, settings: {} },
        content: [{ type: "paragraph" }],
      }),
    },
    authoringView: {
      variantId: CONTROLLED_SURFACE_VARIANT,
      component: ControlIntersectionSurfaceView,
    },
    runtimeView: {
      variantId: CONTROLLED_SURFACE_VARIANT,
      component: ControlIntersectionSurfaceView,
    },
  };
}

function ControlIntersectionSurfaceView() {
  return createElement(NodeViewWrapper, {}, createElement(NodeViewContent));
}

function controlIntersectionDocument() {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseCtrl01", mode: "slideshow" },
        content: [
          {
            type: "courseSection",
            attrs: { id: "courseSec001", title: "Control intersection" },
          },
          controlIntersectionSurface(CURRENT_SURFACE_ID, CURRENT_LAYOUT_ID, CURRENT_SECTION_IDS),
          controlIntersectionSurface(OTHER_SURFACE_ID, OTHER_LAYOUT_ID, [OTHER_SECTION_ID]),
        ],
      },
    ],
  };
}

function controlIntersectionSurface(
  surfaceId: EmbeddedNodeId,
  layoutId: EmbeddedNodeId,
  sectionIds: readonly EmbeddedNodeId[],
) {
  return {
    type: "surface",
    attrs: { id: surfaceId, variant: CONTROLLED_SURFACE_VARIANT, settings: {} },
    content: [
      {
        type: "layout",
        attrs: {
          id: layoutId,
          variant: "tabs",
          options: { label: "Controlled sections", variant: "default" },
        },
        content: sectionIds.map((sectionId, index) => ({
          type: "section",
          attrs: { id: sectionId, options: { label: `Section ${index + 1}` } },
          content: [
            {
              type: "paragraph",
              attrs: { id: EmbeddedNodeIdSchema.parse(`para${surfaceId.slice(-7)}${index}`) },
              content: [{ type: "text", text: `Section ${index + 1}` }],
            },
          ],
        })),
      },
    ],
  };
}

function ancestorIds(
  parentById: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId | null>,
  itemId: EmbeddedNodeId,
): readonly EmbeddedNodeId[] {
  const ancestors: EmbeddedNodeId[] = [];
  let parentId = parentById.get(itemId) ?? null;
  while (parentId) {
    ancestors.push(parentId);
    parentId = parentById.get(parentId) ?? null;
  }
  return ancestors;
}
