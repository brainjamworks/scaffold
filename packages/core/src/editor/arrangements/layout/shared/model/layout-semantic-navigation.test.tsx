// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createSemanticDefinitionLookup } from "@/composition/model/semantic-definition-lookup";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  createSemanticDocumentExtension,
  getSemanticDocumentControllerForEditor,
} from "@/document/authoring/semantic-document";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { createTestNodeIdentityExtension } from "@/editor/testing";

import {
  getLayoutInteractionStoreState,
  type LayoutInteractionStoreState,
} from "./layout-interaction-store";

const CASES = [
  {
    variant: "tabs",
    layoutId: "layoutTabs01",
    sectionIds: ["tabNav000001", "tabNav000002"],
  },
  {
    variant: "accordion",
    layoutId: "layoutAcc001",
    sectionIds: ["accNav000001", "accNav000002"],
  },
  {
    variant: "paginated",
    layoutId: "layoutPag001",
    sectionIds: ["pagNav000001", "pagNav000002"],
  },
] as const satisfies readonly LayoutNavigationCase[];

const editors: Editor[] = [];
const rangeClientRectsDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
const rangeBoundingRectDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getBoundingClientRect",
);

beforeAll(() => {
  const rect = DOMRect.fromRect({ height: 16, width: 80, x: 0, y: 0 });
  Object.defineProperties(Range.prototype, {
    getBoundingClientRect: { configurable: true, value: () => rect },
    getClientRects: { configurable: true, value: () => [rect] },
  });
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

afterAll(() => {
  restoreProperty(Range.prototype, "getClientRects", rangeClientRectsDescriptor);
  restoreProperty(Range.prototype, "getBoundingClientRect", rangeBoundingRectDescriptor);
});

describe("Layout semantic navigation", () => {
  it.each(CASES)(
    "registers and unregisters the $variant adapter while revealing through owned state",
    async (testCase) => {
      const editor = makeEditor(testCase);
      const rendered = renderEditor(editor);
      const controller = getSemanticDocumentControllerForEditor(editor);
      const layoutId = testCase.layoutId as EmbeddedNodeId;
      const targetId = testCase.sectionIds[1] as EmbeddedNodeId;

      await waitFor(() => {
        expect(controller.containerAdapters.get(layoutId)).toBeDefined();
      });

      expect(
        controller.getSnapshot().semantics.locationById.get(targetId)?.activationPath,
      ).toContainEqual({ ownerId: layoutId, childId: targetId, ownerKind: "layout" });
      const adapter = controller.containerAdapters.get(layoutId);
      if (!adapter) throw new Error(`Missing ${testCase.variant} adapter`);
      const authoredDocument = editor.getJSON();
      const click = vi.fn();
      document.addEventListener("click", click);

      await expect(adapter.reveal(targetId, "navigate")).resolves.toBe("revealed");
      expect(visibleSectionId(testCase, getLayoutInteractionStoreState(editor))).toBe(targetId);
      await expect(adapter.reveal(targetId, "navigate")).resolves.toBe("already-visible");
      expect(click).not.toHaveBeenCalled();
      expect(editor.getJSON()).toEqual(authoredDocument);

      document.removeEventListener("click", click);
      act(() => rendered.unmount());
      expect(controller.containerAdapters.get(layoutId)).toBeUndefined();
    },
  );

  it("reports a directly activated tab as the current component selection", async () => {
    const user = userEvent.setup();
    const testCase = CASES[0];
    const editor = makeEditor(testCase);
    renderEditor(editor);
    const controller = getSemanticDocumentControllerForEditor(editor);

    await user.click(await screen.findByRole("tab", { name: "Second" }));

    expect(controller.getSnapshot()).toMatchObject({
      selectedId: testCase.sectionIds[1],
      selectionOrigin: "component",
    });
  });
});

interface LayoutNavigationCase {
  readonly variant: "tabs" | "accordion" | "paginated";
  readonly layoutId: string;
  readonly sectionIds: readonly [string, string];
}

function makeEditor(testCase: LayoutNavigationCase): Editor {
  const semantics = createSemanticDefinitionLookup({
    blocks: builtInBlockRegistry,
    layouts: builtInLayoutRegistry,
    surfaces: builtInSurfaceVariantRegistry,
  });
  const capabilities = Object.freeze({
    blocks: Object.freeze({
      registry: builtInBlockRegistry,
      duplication: Object.freeze({ getByNodeType: () => undefined }),
    }),
    layouts: Object.freeze({ registry: builtInLayoutRegistry }),
    surfaces: Object.freeze({ registry: builtInSurfaceVariantRegistry }),
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
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: documentContent(testCase),
  });
  editors.push(editor);
  return editor;
}

function renderEditor(editor: Editor) {
  return render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));
}

function documentContent(testCase: LayoutNavigationCase): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceNav01", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: testCase.layoutId,
                  variant: testCase.variant,
                  options:
                    testCase.variant === "accordion"
                      ? { allowMultiple: false, label: "Sections" }
                      : { label: "Sections" },
                },
                content: testCase.sectionIds.map((sectionId, index) => ({
                  type: "section",
                  attrs: {
                    id: sectionId,
                    options: {
                      label: index === 0 ? "First" : "Second",
                      defaultOpen: index === 0,
                    },
                  },
                  content: [
                    {
                      type: "paragraph",
                      attrs: { id: `${testCase.variant.slice(0, 3)}Txt00000${index + 1}` },
                      content: [{ type: "text", text: index === 0 ? "First" : "Second" }],
                    },
                  ],
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

function visibleSectionId(
  testCase: LayoutNavigationCase,
  state: LayoutInteractionStoreState,
): string | undefined {
  if (testCase.variant === "tabs") return state.activeTabByLayoutId[testCase.layoutId];
  if (testCase.variant === "paginated") return state.activePageByLayoutId[testCase.layoutId];
  return state.openAccordionSectionsByLayoutId[testCase.layoutId]?.[0];
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(target, property, descriptor);
  else Reflect.deleteProperty(target, property);
}
