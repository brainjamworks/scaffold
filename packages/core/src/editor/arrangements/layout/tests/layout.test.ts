// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { TabsIcon as Tabs } from "@phosphor-icons/react";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent } from "@tiptap/react";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { Fragment } from "@tiptap/pm/model";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createScaffoldAuthoringCataloguesStorageExtension } from "@/composition/extensions/scaffold-authoring-catalogues-storage";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  ARRANGEMENT_CONTENT,
  CELL_ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  ExtendedBlockquote,
  ExtendedBulletList,
  ExtendedCodeBlock,
  ExtendedHeading,
  ExtendedHorizontalRule,
  ExtendedListItem,
  ExtendedOrderedList,
} from "@/editor/rich-text/model/rich-text-blocks";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { LayerNode } from "@/document/model/layers/layer-node";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { AUTHORING_CHROME_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import {
  AUTHORING_FRAME_ATTR,
  AUTHORING_CHROME_ACTIVE_ATTR,
  AUTHORING_ANCHOR_ATTR,
} from "@/editor/interactions/dom/authoring-frame";
import { resolveEditorMovementTarget } from "@/editor/movement/view/use-editor-movement-target";
import { resolveMovementNodeContext } from "@/editor/movement/model/movement-policy";
import { resolveStructureMovementTargetPresentation } from "@/editor/movement/view/movement-dom";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import {
  CourseSelectionMode,
  resolveCourseSelectionFacts,
} from "@/editor/selection/selection-facts";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { InteractionOwnerCommandKind } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-command-model";
import {
  interactionOwnerPluginKey,
  setInteractionOwnerCommandMeta,
} from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { BubbleMenus } from "@/editor/shell/bubbles/BubbleMenus";
import { AuthoringDocumentChrome } from "@/editor/shell/authoring/AuthoringDocumentChrome";
import { resolveStructuralInteractionBubbleModel } from "@/editor/shell/bubbles/interaction/StructuralInteractionBubbleMenu";
import { createStructuralInteractionBubbleRendererMap } from "@/editor/interactions/interaction-bubble";
import { getDocumentTreeForEditor } from "@/document/authoring/document-tree";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import { describeLayoutContract } from "@/editor/testing";
import { surfaceAssessmentQuestionSchemaExtensions } from "@/editor/testing/surface-assessment-schema-extensions";

import {
  createLayoutAuthoringNodeView,
  createSectionAuthoringNodeView,
} from "../authoring/layout-node-views";
import { createLayoutNode, createSectionNode } from "../model/layout-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "../accordion/accordion-section-nodes";
import { builtInLayoutAuthoringViews } from "../authoring/built-in-layout-views";
import {
  builtInLayoutDefinitions,
  builtInLayoutRegistry,
} from "../model/built-in-layout-definitions";
import { createLayoutArrangementAnchorId } from "../model/layout-arrangement-helpers";
import {
  layoutStructuralInteractionBubbleRendererBindings,
  LayoutMenuBubbleContent,
  resolveLayoutMenuSnapshot,
} from "../authoring/layout-bubble-controls";
import type { LayoutMenuSnapshot } from "../authoring/layout-bubble-controls";
import { reorderLayoutSectionAt } from "../model/layout-commands";
import { getLayoutKindFromAttrs, type LayoutDefinition } from "../model/layout-definition";
import type { LayoutComponentProps } from "../authoring/layout-view-definition";
import { createLayoutRegistry } from "../model/layout-registry";
import { createLayoutAuthoringViewRegistry } from "../authoring/layout-view-registry";
import { DefaultLayoutContent } from "../authoring/default-layout-content";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { AppNotificationsProvider } from "@/ui/components/app/AppNotifications/AppNotifications";
import { createInteractionStore } from "@/editor/interactions/targets/facade/interaction-store";

const REAL_SECTION_IDS = Object.freeze({
  region: EmbeddedNodeIdSchema.parse("region000001"),
  layout: EmbeddedNodeIdSchema.parse("layout000001"),
  section: EmbeddedNodeIdSchema.parse("section00001"),
  first: EmbeddedNodeIdSchema.parse("para00000001"),
  second: EmbeddedNodeIdSchema.parse("para00000002"),
  surface: EmbeddedNodeIdSchema.parse("surface00001"),
  slideTitle: EmbeddedNodeIdSchema.parse("slidetitle01"),
});

const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: builtInBlockRegistry,
  layoutDefinitions: builtInLayoutRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});
const layoutStructuralRenderers = createStructuralInteractionBubbleRendererMap(
  layoutStructuralInteractionBubbleRendererBindings,
);
const testScaffoldApplication = createScaffoldApplication();
const testScaffoldCapabilities = testScaffoldApplication.capabilities;

const elementGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "getBoundingClientRect",
);

const boundedLayoutDefinition = {
  id: "test-bounded-layout",
  title: "Bounded layout",
  description: "Layout fixture that opts into bounded fill placement",
  icon: Tabs,
  boundedPlacement: "fill",
  createContent: () => ({
    type: "layout",
    attrs: { variant: "test-bounded-layout" },
    content: [{ type: "section" }],
  }),
} satisfies LayoutDefinition;

let boundedLayoutBlockDefinitions: unknown = null;

function BoundedLayoutView(props: LayoutComponentProps) {
  boundedLayoutBlockDefinitions = props.blockDefinitions;
  return createElement(DefaultLayoutContent, props);
}

const testLayoutRegistry = createLayoutRegistry([
  ...builtInLayoutDefinitions,
  boundedLayoutDefinition,
]);
const testLayoutAuthoringViewRegistry = createLayoutAuthoringViewRegistry(testLayoutRegistry, [
  ...builtInLayoutAuthoringViews,
  { id: boundedLayoutDefinition.id, layout: BoundedLayoutView },
]);
const TestLayoutAuthoringNode = createLayoutNode({
  addNodeView: () =>
    createLayoutAuthoringNodeView(
      testLayoutRegistry,
      testLayoutAuthoringViewRegistry,
      builtInBlockRegistry,
    ),
});
const TestSectionAuthoringNode = createSectionNode({
  addNodeView: () =>
    createSectionAuthoringNodeView(
      testLayoutRegistry,
      testLayoutAuthoringViewRegistry,
      builtInBlockRegistry,
    ),
});

describeLayoutContract({
  blockDefinitions: builtInBlockRegistry,
  layoutDefinitions: testLayoutRegistry,
  layoutAuthoringViews: testLayoutAuthoringViewRegistry,
  layoutId: "tabs",
  expectsLayoutConfiguration: true,
  expectsSectionConfiguration: true,
});

async function makeRealSectionEditor(): Promise<Editor> {
  const composition = createCoreScaffoldAuthoringComposition();
  const editor = new Editor({
    editable: true,
    extensions: [
      ...createCourseDocumentAuthoringExtensions({ editable: true, composition }),
      UndoRedo,
    ],
    content: createRealSectionDocument(),
  });
  await Promise.resolve();
  return editor;
}

function createRealSectionDocument(): JSONContent {
  const content = createScaffoldDocumentContent({
    initialCourseSectionTitle: "Section content layout",
    mode: "slideshow",
    surfaceId: REAL_SECTION_IDS.surface,
  });
  const courseDocument = content.content?.[0];
  const courseSection = courseDocument?.content?.[0];
  if (!courseDocument || courseDocument.type !== "courseDocument" || !courseSection) {
    throw new Error("Expected a generated slideshow Course Document");
  }

  courseDocument.content = [
    courseSection,
    {
      type: "surface",
      attrs: {
        id: REAL_SECTION_IDS.surface,
        settings: {
          footer: { enabled: false },
          header: { enabled: false },
          slideTitle: { enabled: true },
        },
        variant: "slide-content",
      },
      content: [
        { type: "slide_title", attrs: { id: REAL_SECTION_IDS.slideTitle } },
        {
          type: "region",
          attrs: { id: REAL_SECTION_IDS.region, role: "main" },
          content: [
            {
              type: "layout",
              attrs: { id: REAL_SECTION_IDS.layout, variant: "tabs" },
              content: [
                {
                  type: "section",
                  attrs: {
                    id: REAL_SECTION_IDS.section,
                    role: "tab-panel",
                  },
                  content: [
                    { type: "paragraph", attrs: { id: REAL_SECTION_IDS.first } },
                    { type: "paragraph", attrs: { id: REAL_SECTION_IDS.second } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  return content;
}

function makeEditor(content?: JSONContent) {
  const editor = new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(testScaffoldCapabilities),
      createScaffoldAuthoringCataloguesStorageExtension(
        testScaffoldApplication.authoring.catalogues,
      ),
      DocumentNode,
      StarterKit.configure({
        document: false,
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      ExtendedBulletList,
      ExtendedOrderedList,
      ExtendedListItem,
      ExtendedBlockquote,
      ExtendedCodeBlock,
      ExtendedHorizontalRule,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      ...surfaceAssessmentQuestionSchemaExtensions,
      RegionNode,
      LayerNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      GridAuthoringNode,
      CellAuthoringNode,
      TestLayoutAuthoringNode,
      TestSectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
    ],
    ...(content ? { content } : {}),
  });
  return editor;
}

function editorFacade(editor: Editor) {
  return getInteractionFacadeStoreForEditor(editor);
}

function renderEditorContent(editor: Editor) {
  return render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));
}

function menuOwnerForTest(editor: Editor): InteractionTargetRef | null {
  return interactionOwnerPluginKey.getState(editor.state)?.menuOwner ?? null;
}

function settingsOwnerForTest(editor: Editor): InteractionTargetRef | null {
  return interactionOwnerPluginKey.getState(editor.state)?.settingsOwner ?? null;
}

function explicitOwnerForTest(editor: Editor): InteractionTargetRef | null {
  return interactionOwnerPluginKey.getState(editor.state)?.explicitOwner ?? null;
}

function structuralRefForTest(
  editor: Editor,
  kind: "layout" | "section" | "cell",
  id: string,
): InteractionTargetRef {
  return { id, kind, pos: nodePos(editor, kind, id) };
}

function resolveLayoutMenuModelForTest(editor: Editor) {
  return resolveStructuralInteractionBubbleModel(
    editor,
    publishInteractionOwnerSnapshot(editor.state, null, { blockDefinitions: builtInBlockRegistry }),
    alignmentTargetPort,
    layoutStructuralRenderers,
  );
}

function countNodesOfType(editor: Editor, type: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) count += 1;
    return true;
  });
  return count;
}

function accordionSectionContent(label: string): JSONContent[] {
  return [
    {
      type: "accordion_section_title",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: label }],
        },
      ],
    },
    {
      type: "accordion_section_panel",
      content: [{ type: "paragraph" }],
    },
  ];
}

function nodePos(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (id !== undefined && node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Could not find ${type}${id ? `:${id}` : ""}`);
  return found;
}

function renderAuthoringChrome(editor: Editor) {
  mockDefaultFloatingControlRect();
  const rendered = render(
    createElement(AuthoringDocumentChrome, {
      editable: true,
      editor,
      surfaceAuthoringChrome: builtInSurfaceAuthoringChromeResolver,
      children: createElement(EditorContent, { editor }),
    }),
  );
  mockFloatingControlRect(editor.view.dom.parentElement, {
    height: 600,
    width: 800,
    x: 0,
    y: 0,
  });
  editor.commands.focus();
  editor.view.dom.focus();
  return rendered;
}

function renderActiveLayoutAuthoringChrome(editor: Editor, layoutId: string) {
  const rendered = renderAuthoringChrome(editor);
  const layoutElement = document.body.querySelector(
    `[data-authoring-frame="layout"][data-id="${layoutId}"]`,
  );
  if (layoutElement) {
    mockFloatingControlRect(layoutElement, {
      height: 240,
      width: 420,
      x: 120,
      y: 80,
    });
  }
  createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).activateStructuralTarget(
    structuralRefForTest(editor, "layout", layoutId),
  );
  return rendered;
}

function textPos(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Could not find text: ${text}`);
  return found;
}

function renderLayoutMenuForTest(
  editor: Editor,
  descriptor: Parameters<typeof LayoutMenuBubbleContent>[0]["descriptor"],
  snapshot: LayoutMenuSnapshot,
  store = createInteractionStore(),
) {
  const menu = createElement(LayoutMenuBubbleContent, { descriptor, editor, snapshot });
  const interaction = createElement(InteractionProvider, { store, children: menu });
  const notifications = createElement(AppNotificationsProvider, {
    appearance: "light",
    children: interaction,
  });
  return render(createElement(TooltipProvider, { children: notifications }));
}

function readMenuButtonLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "")
    .filter(Boolean);
}

function mockFloatingControlRect(
  element: Element | null,
  rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  },
): void {
  if (!element) throw new Error("Expected element for floating control rect.");

  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      DOMRect.fromRect({
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      }),
  });
}

function mockDefaultFloatingControlRect(): void {
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return DOMRect.fromRect({
        height: 240,
        width: 420,
        x: 120,
        y: 80,
      });
    },
  });
}

function restoreDefaultFloatingControlRect(): void {
  if (elementGetBoundingClientRectDescriptor) {
    Object.defineProperty(
      Element.prototype,
      "getBoundingClientRect",
      elementGetBoundingClientRectDescriptor,
    );
    return;
  }

  delete (Element.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
}

describe("layout arrangement nodes", () => {
  afterEach(() => {
    cleanup();
    restoreDefaultFloatingControlRect();
    document.body.replaceChildren();
  });

  it("defines layout and section schema placement rules", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const layoutType = schema.nodes.layout;
    const sectionType = schema.nodes.section;
    const accordionTitleType = schema.nodes.accordion_section_title;
    const accordionPanelType = schema.nodes.accordion_section_panel;

    expect(layoutType?.spec.group).toBe(`${ARRANGEMENT_CONTENT} ${CELL_ARRANGEMENT_CONTENT}`);
    expect(layoutType?.spec.content).toBe("section+");
    expect(layoutType?.spec.selectable).toBe(true);
    expect(layoutType?.spec.draggable).toBe(false);
    expect(sectionType?.spec.content).toBe(`(block | ${SECTION_ARRANGEMENT_CONTENT})+`);
    expect(sectionType?.spec.selectable).toBe(true);
    expect(sectionType?.spec.draggable).toBe(false);
    expect(accordionTitleType?.spec.group).toBe("block");
    expect(accordionTitleType?.spec.content).toBe("text_content+");
    expect(accordionPanelType?.spec.group).toBe("block");
    expect(accordionPanelType?.spec.content).toBe(`(block | ${SECTION_ARRANGEMENT_CONTENT})+`);

    editor.destroy();
  });

  it("allows rich text content in accordion section titles", () => {
    const editor = makeEditor();
    const accordionTitleType = editor.schema.nodes.accordion_section_title!;
    const heading = editor.schema.nodes.heading!.create(
      { level: 2 },
      editor.schema.text("Section heading"),
    );
    const list = editor.schema.nodes.bulletList!.createAndFill();

    expect(() => accordionTitleType.createChecked(null, [heading, list!])).not.toThrow();

    editor.destroy();
  });

  it("requires layouts and sections to contain editable anchors", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const layoutType = schema.nodes.layout!;
    const sectionType = schema.nodes.section!;
    const paragraphType = schema.nodes.paragraph!;
    const section = sectionType.create(null, paragraphType.create());

    expect(layoutType.validContent(Fragment.empty)).toBe(false);
    expect(sectionType.validContent(Fragment.empty)).toBe(false);
    expect(layoutType.validContent(Fragment.from(section))).toBe(true);
    expect(sectionType.validContent(Fragment.from(paragraphType.create()))).toBe(true);

    editor.destroy();
  });

  it("allows layouts inside surfaces and cells", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const paragraphType = schema.nodes.paragraph!;
    const layoutType = schema.nodes.layout!;
    const sectionType = schema.nodes.section!;
    const surfaceType = schema.nodes.surface!;
    const cellType = schema.nodes.cell!;

    const section = sectionType.create(null, paragraphType.create());
    const layout = layoutType.create(null, section);

    expect(surfaceType.validContent(Fragment.from(layout))).toBe(true);
    expect(cellType.validContent(Fragment.from(layout))).toBe(true);

    editor.destroy();
  });

  it("allows grids inside sections and rejects nested layouts inside sections", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const paragraphType = schema.nodes.paragraph!;
    const gridType = schema.nodes.grid!;
    const cellType = schema.nodes.cell!;
    const layoutType = schema.nodes.layout!;
    const sectionType = schema.nodes.section!;
    const innerSection = sectionType.create(null, paragraphType.create());
    const cell = cellType.create(null, paragraphType.create());
    const grid = gridType.create(null, cell);
    const layout = layoutType.create(null, innerSection);

    expect(sectionType.validContent(Fragment.from(paragraphType.create()))).toBe(true);
    expect(sectionType.validContent(Fragment.from(grid))).toBe(true);
    expect(sectionType.validContent(Fragment.from(layout))).toBe(false);

    editor.destroy();
  });

  it("allows grids inside accordion section panels", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const paragraphType = schema.nodes.paragraph!;
    const gridType = schema.nodes.grid!;
    const cellType = schema.nodes.cell!;
    const accordionPanelType = schema.nodes.accordion_section_panel!;

    const cell = cellType.create(null, paragraphType.create());
    const grid = gridType.create(null, cell);

    expect(accordionPanelType.validContent(Fragment.from(paragraphType.create()))).toBe(true);
    expect(accordionPanelType.validContent(Fragment.from(grid))).toBe(true);

    editor.destroy();
  });

  it("serializes layout attrs with parseable defaults", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const paragraphType = schema.nodes.paragraph!;
    const layoutType = schema.nodes.layout!;
    const sectionType = schema.nodes.section!;
    const section = sectionType.create(null, paragraphType.create());

    const defaultLayout = layoutType.create(null, section);
    const variantLayout = layoutType.create(
      { id: "layout-1", variant: "mediaText", options: { emphasis: "media" } },
      section,
    );

    expect(defaultLayout.attrs).toMatchObject({
      id: null,
      variant: null,
      options: {},
    });
    expect(variantLayout.toJSON().attrs).toMatchObject({
      id: "layout-1",
      variant: "mediaText",
      options: { emphasis: "media" },
    });

    editor.destroy();
  });

  it("resolves layout kind only from the variant attr", () => {
    expect(getLayoutKindFromAttrs({ variant: "tabs" })).toBe("tabs");
    expect(getLayoutKindFromAttrs({ kind: "tabs" })).toBeNull();
    expect(getLayoutKindFromAttrs({})).toBeNull();
  });

  it("marks layout and section node views as drop targets", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-a" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "section-a" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="layout"]')).not.toBeNull();
      expect(document.body.querySelector('[data-authoring-frame="section"]')).not.toBeNull();
    });
    const layoutElement = document.body.querySelector('[data-authoring-frame="layout"]');
    const sectionElement = document.body.querySelector('[data-authoring-frame="section"]');

    expect(layoutElement?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("layout");
    expect(layoutElement?.getAttribute("data-node")).toBe("layout");
    expect(layoutElement?.getAttribute("data-definition")).toBe("layout");
    expect(layoutElement?.getAttribute("data-id")).toBe("layout-a");
    expect(layoutElement?.getAttribute("class")).toContain("sc-layout-authoring");
    expect(sectionElement?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("section");
    expect(sectionElement?.getAttribute("data-node")).toBe("section");
    expect(sectionElement?.getAttribute("data-definition")).toBe("section");
    expect(sectionElement?.getAttribute("data-id")).toBe("section-a");
    expect(sectionElement?.getAttribute("data-empty")).toBe("true");
    expect(sectionElement?.getAttribute("class")).toContain("sc-layout-section-authoring");
    expect(sectionElement?.getAttribute("class")).toContain("sc-layout-section-authoring--empty");
    expect(layoutElement?.getAttribute(AUTHORING_CHROME_ACTIVE_ATTR)).toBeNull();
    expect(layoutElement?.querySelector("[data-layout-outline]")?.getAttribute("class")).toContain(
      "sc-layout-outline",
    );
    expect(
      layoutElement?.querySelector("[data-layout-outline]")?.getAttribute("contenteditable"),
    ).toBe("false");
    expect(layoutElement?.querySelector(".sc-layout-authoring__content")).not.toBeNull();
    expect(sectionElement?.querySelector(".sc-layout-section-authoring__content")).not.toBeNull();
    expect(sectionElement?.querySelector("[data-section-outline]")).toBeNull();
    expect(layoutElement?.querySelector("[data-authoring-move-handle]")).toBeNull();
    expect(sectionElement?.hasAttribute("data-authoring-move-handle")).toBe(false);
    expect(document.body.querySelector("[data-layout-section-reorder-handle]")).toBeNull();

    editor.destroy();
  });

  it("uses the generic authoring fallback for an unknown persisted variant", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-unknown", variant: "persisted-unknown" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "section-unknown" },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Unknown authoring content" }],
                        },
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
    renderEditorContent(editor);

    await waitFor(() => {
      expect(
        document.body.querySelector(
          '[data-authoring-frame="layout"][data-definition="persisted-unknown"].sc-layout-authoring',
        ),
      ).not.toBeNull();
    });

    expect(document.body.textContent).toContain("Unknown authoring content");
    editor.destroy();
  });

  it("emits bounded placement on layout authoring frames when the definition opts in", async () => {
    boundedLayoutBlockDefinitions = null;
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-bounded",
                    variant: "test-bounded-layout",
                  },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "section-bounded" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(
        document.body.querySelector(
          '[data-authoring-frame="layout"][data-definition="test-bounded-layout"]',
        ),
      ).not.toBeNull();
    });

    const layoutElement = document.body.querySelector(
      '[data-authoring-frame="layout"][data-definition="test-bounded-layout"]',
    );

    expect(layoutElement?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(boundedLayoutBlockDefinitions).toBe(builtInBlockRegistry);

    editor.destroy();
  });

  it("marks selected layout outline active without adding generic section outline", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-selected" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "section-selected" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="layout"]')).not.toBeNull();
    });

    editor.commands.focus();
    editor.view.dom.focus();
    const ports = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);
    expect(
      ports.activateStructuralTarget({
        id: "layout-selected",
        kind: InteractionTargetKind.Layout,
        pos: nodePos(editor, "layout"),
      }),
    ).toBe(true);
    await waitFor(() => {
      const layoutElement = document.body.querySelector('[data-authoring-frame="layout"]');
      expect(layoutElement?.getAttribute("data-authoring-chrome-active")).toBe("");
      expect(
        layoutElement?.querySelector("[data-layout-outline]")?.getAttribute("class"),
      ).toContain("sc-layout-outline");
      expect(
        layoutElement?.querySelector("[data-layout-outline]")?.getAttribute("contenteditable"),
      ).toBe("false");
    });

    expect(
      ports.activateStructuralTarget({
        id: "section-selected",
        kind: InteractionTargetKind.Section,
        pos: nodePos(editor, "section"),
      }),
    ).toBe(true);
    expect(
      document.body
        .querySelector('[data-authoring-frame="section"]')
        ?.getAttribute("data-authoring-chrome-active"),
    ).toBeNull();
    expect(document.body.querySelector("[data-section-outline]")).toBeNull();

    editor.destroy();
  });

  it("marks layout outline active from a shared section menu target", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Outside layout" }],
                },
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    editor.commands.setTextSelection(textPos(editor, "Outside") + 1);
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="layout"]')).not.toBeNull();
    });

    expect(
      document.body
        .querySelector('[data-authoring-frame="layout"]')
        ?.getAttribute("data-authoring-chrome-active"),
    ).toBeNull();

    editor.commands.focus();
    editor.view.dom.focus();
    expect(
      createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).openMenu(
        structuralRefForTest(editor, "section", "tab-a"),
      ),
    ).toBe(true);

    await waitFor(() => {
      expect(
        document.body
          .querySelector('[data-authoring-frame="layout"]')
          ?.getAttribute("data-authoring-chrome-active"),
      ).toBe("");
    });

    editor.destroy();
  });

  it("activates the parent layout without menus when a tab header is clicked", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Outside layout" }],
                },
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "section",
                      attrs: { id: "tab-b", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[role="tab"]')).not.toBeNull();
    });

    const secondTab = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )[1];
    fireEvent.click(secondTab!);

    expect(explicitOwnerForTest(editor)).toMatchObject({
      id: "layout-tabs",
      kind: InteractionTargetKind.Layout,
    });
    expect(menuOwnerForTest(editor)).toBeNull();
    expect(settingsOwnerForTest(editor)).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="menu"]')).toBeNull();

    expect(
      createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).dismissInteraction(),
    ).toBe(true);
    editor.commands.setTextSelection(textPos(editor, "Outside") + 1);
    await waitFor(() => {
      expect(
        document.body
          .querySelector('[data-authoring-frame="layout"]')
          ?.getAttribute("data-authoring-chrome-active"),
      ).toBeNull();
    });

    editor.destroy();
  });

  it("keeps the layout floating menu trigger visible when a tab header owns focus", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Outside tabs" }],
                },
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "section",
                      attrs: { id: "tab-b", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderAuthoringChrome(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[role="tab"]')).not.toBeNull();
    });
    editor.commands.setTextSelection(textPos(editor, "Outside tabs") + 1);

    const layoutElement = document.body.querySelector(
      '[data-authoring-frame="layout"][data-id="layout-tabs"]',
    );
    mockFloatingControlRect(layoutElement, {
      height: 240,
      width: 420,
      x: 120,
      y: 80,
    });

    const secondTab = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )[1];
    secondTab?.focus();
    fireEvent.click(secondTab!);

    await waitFor(() => {
      expect(explicitOwnerForTest(editor)).toMatchObject({
        id: "layout-tabs",
        kind: InteractionTargetKind.Layout,
      });
      expect(document.activeElement).toBe(secondTab);
      expect(document.body.querySelector("[data-layout-menu-trigger]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("serializes section attrs with parseable defaults", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const sectionType = schema.nodes.section!;

    const defaultSection = sectionType.create();
    const tabSection = sectionType.create({
      id: "section-1",
      role: "tab",
      label: "Details",
      defaultOpen: true,
      options: { icon: "book-open" },
    });

    expect(defaultSection.attrs).toMatchObject({
      id: null,
      role: null,
      label: null,
      defaultOpen: null,
      options: {},
    });
    expect(tabSection.toJSON().attrs).toMatchObject({
      id: "section-1",
      role: "tab",
      label: "Details",
      defaultOpen: true,
      options: { icon: "book-open" },
    });

    editor.destroy();
  });

  it("resolves layout menu snapshots from shared layout and section targets", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs",
                    variant: "tabs",
                    options: { variant: "pills", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-a",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const layoutPos = nodePos(editor, "layout", "layout-tabs");
    const sectionPos = nodePos(editor, "section", "tab-a");
    const layoutDescriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRefForTest(editor, "layout", "layout-tabs"),
    );
    const sectionDescriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRefForTest(editor, "section", "tab-a"),
    );

    expect(resolveLayoutMenuSnapshot(layoutDescriptor)).toMatchObject({
      kind: "layout",
      layoutDefinition: { id: "tabs" },
      layoutPos,
    });
    expect(resolveLayoutMenuSnapshot(sectionDescriptor)).toMatchObject({
      kind: "section",
      layoutDefinition: { id: "tabs" },
      sectionDefinition: { label: "Tab" },
      sectionPos,
    });
    editor.destroy();
  });

  it("composes real Tabs Section controls while keeping Layout arrangement-only", async () => {
    const editor = await makeRealSectionEditor();
    const documentTree = getDocumentTreeForEditor(editor);
    await waitFor(() => {
      expect(documentTree.getSnapshot().itemById.has(REAL_SECTION_IDS.section)).toBe(true);
    });

    const sectionDescriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRefForTest(editor, "section", REAL_SECTION_IDS.section),
    );
    if (!sectionDescriptor || sectionDescriptor.kind !== InteractionTargetKind.Section) {
      throw new Error("Missing valid Section descriptor");
    }
    const sectionSnapshot = resolveLayoutMenuSnapshot(sectionDescriptor);
    if (!sectionSnapshot || sectionSnapshot.kind !== "section") {
      throw new Error("Missing Section menu snapshot");
    }

    expect(sectionSnapshot).toMatchObject({
      kind: "section",
      layoutDefinition: { id: "tabs" },
      sectionId: REAL_SECTION_IDS.section,
    });
    const sectionStore = createInteractionStore({
      commandPorts: createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry),
    });
    const sectionMenu = renderLayoutMenuForTest(
      editor,
      sectionDescriptor,
      sectionSnapshot,
      sectionStore,
    );
    const sectionScope = within(sectionMenu.container);
    expect(readMenuButtonLabels(sectionMenu.container)).toEqual([
      "Duplicate section",
      "Delete section",
      "Open section settings",
    ]);
    expect(sectionMenu.container.querySelectorAll(".sc-menu-separator")).toHaveLength(1);

    const user = userEvent.setup();
    await user.click(sectionScope.getByRole("button", { name: "Open section settings" }));
    await waitFor(() => {
      expect(settingsOwnerForTest(editor)).toMatchObject({
        id: REAL_SECTION_IDS.section,
        kind: InteractionTargetKind.Section,
      });
    });
    sectionMenu.unmount();

    const layoutDescriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRefForTest(editor, "layout", REAL_SECTION_IDS.layout),
    );
    if (!layoutDescriptor || layoutDescriptor.kind !== InteractionTargetKind.Layout) {
      throw new Error("Missing Layout descriptor");
    }
    const layoutSnapshot = resolveLayoutMenuSnapshot(layoutDescriptor);
    if (!layoutSnapshot || layoutSnapshot.kind !== "layout") {
      throw new Error("Missing Layout menu snapshot");
    }

    const layoutMenu = renderLayoutMenuForTest(editor, layoutDescriptor, layoutSnapshot);
    expect(readMenuButtonLabels(layoutMenu.container)).toEqual([
      "Duplicate layout",
      "Delete layout",
      "Style: Default",
      "Style: Pills",
      "Style: Underline",
      "Open layout settings",
    ]);
    expect(layoutMenu.container.querySelectorAll(".sc-menu-separator")).toHaveLength(2);
    layoutMenu.unmount();
    editor.destroy();
  });

  it("contributes layout and section models through the structural bubble host", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const ports = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);

    expect(ports.openMenu(structuralRefForTest(editor, "layout", "layout-tabs"))).toBe(true);
    const layoutModel = resolveLayoutMenuModelForTest(editor);
    expect(layoutModel?.targetKey).toContain("layout:");
    expect(layoutModel?.content).toBeDefined();

    expect(ports.openMenu(structuralRefForTest(editor, "section", "tab-a"))).toBe(true);
    const sectionModel = resolveLayoutMenuModelForTest(editor);
    expect(sectionModel?.targetKey).toContain("section:");
    expect(sectionModel?.content).toBeDefined();

    editor.destroy();
  });

  it("does not open the layout bubble from layout or section selection", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const layoutPos = nodePos(editor, "layout", "layout-tabs");
    const sectionPos = nodePos(editor, "section", "tab-a");

    editor.commands.setNodeSelection(layoutPos);
    expect(resolveLayoutMenuModelForTest(editor)).toBeNull();

    editor.commands.setNodeSelection(sectionPos);
    expect(resolveLayoutMenuModelForTest(editor)).toBeNull();

    expect(
      createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).openMenu(
        structuralRefForTest(editor, "layout", "layout-tabs"),
      ),
    ).toBe(true);
    const model = resolveLayoutMenuModelForTest(editor);
    expect(model?.descriptor).toMatchObject({
      id: "layout-tabs",
      kind: InteractionTargetKind.Layout,
    });

    editor.destroy();
  });

  it("opens the shared layout menu target from the layout menu trigger", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderActiveLayoutAuthoringChrome(editor, "layout-tabs");

    await waitFor(() => {
      expect(document.body.querySelector("[data-layout-menu-trigger]")).not.toBeNull();
    });

    const trigger = document.body.querySelector<HTMLButtonElement>("[data-layout-menu-trigger]");
    expect(trigger?.getAttribute(AUTHORING_ANCHOR_ATTR)).toBe("layout-menu:layout-tabs");
    expect(trigger?.getAttribute(AUTHORING_CHROME_ATTR)).toBe("trigger");
    expect(trigger?.getAttribute("class")).toContain("sc-floating-layout-menu-trigger");

    fireEvent.mouseDown(trigger!);
    fireEvent.click(trigger!);

    await waitFor(() => {
      expect(menuOwnerForTest(editor)).toMatchObject({
        id: "layout-tabs",
        kind: InteractionTargetKind.Layout,
      });
      expect(document.body.querySelector('[data-authoring-chrome="menu"]')).not.toBeNull();
    });

    const closeTrigger = document.body.querySelector<HTMLButtonElement>(
      "[data-layout-menu-trigger]",
    );
    fireEvent.mouseDown(closeTrigger!);
    fireEvent.click(closeTrigger!);
    expect(menuOwnerForTest(editor)).toBeNull();

    editor.destroy();
  });

  it("does not publish the passive layout menu trigger while a cell owns the interaction", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "grid",
                  attrs: { columnWidths: [1], id: "grid-a" },
                  content: [
                    {
                      type: "cell",
                      attrs: { id: "cell-a" },
                      content: [
                        {
                          type: "layout",
                          attrs: { id: "layout-tabs", variant: "tabs" },
                          content: [
                            {
                              type: "section",
                              attrs: { id: "tab-a", role: "tab-panel" },
                              content: [
                                {
                                  type: "paragraph",
                                  content: [{ type: "text", text: "Cell tab text" }],
                                },
                              ],
                            },
                          ],
                        },
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
    renderAuthoringChrome(editor);
    editor.commands.setTextSelection(textPos(editor, "Cell tab text") + 1);

    expect(
      createInteractionOwnerCommandPorts(
        editor.view,
        builtInBlockRegistry,
      ).activateStructuralTarget(structuralRefForTest(editor, "cell", "cell-a")),
    ).toBe(true);

    await waitFor(() => {
      expect(explicitOwnerForTest(editor)).toMatchObject({
        id: "cell-a",
        kind: InteractionTargetKind.Cell,
      });
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
      expect(document.body.querySelector("[data-grid-cell-menu-trigger]")).not.toBeNull();
    });

    expect(document.body.querySelector("[data-layout-menu-trigger]")).toBeNull();

    editor.destroy();
  });

  it("publishes the layout floating movement handle for a v2 layout owner", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderAuthoringChrome(editor);

    expect(resolveEditorMovementTarget(editor, builtInBlockRegistry)).toBeNull();

    expect(
      createInteractionOwnerCommandPorts(
        editor.view,
        builtInBlockRegistry,
      ).activateStructuralTarget(structuralRefForTest(editor, "layout", "layout-tabs")),
    ).toBe(true);

    const movementTarget = resolveEditorMovementTarget(editor, builtInBlockRegistry);
    expect(movementTarget?.targetRef).toMatchObject({
      id: "layout-tabs",
      kind: InteractionTargetKind.Layout,
    });
    expect(movementTarget?.context.node.type.name).toBe("layout");

    await waitFor(() => {
      expect(document.body.querySelector("[data-authoring-move-handle]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("does not publish the floating movement handle for a section owner", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(
      createInteractionOwnerCommandPorts(
        editor.view,
        builtInBlockRegistry,
      ).activateStructuralTarget(structuralRefForTest(editor, "section", "tab-a")),
    ).toBe(true);

    // Sections support movement through their section-local handles inside
    // the layout component, not through the shared floating handle. The
    // schema confines sections to layouts, so a document-level floating
    // drag source would have nowhere valid to drop.
    expect(resolveEditorMovementTarget(editor, builtInBlockRegistry)).toBeNull();

    editor.destroy();
  });

  it("does not create position fallback anchors for layouts without ids", () => {
    expect(createLayoutArrangementAnchorId("layout-menu", null)).toBeNull();
    expect(createLayoutArrangementAnchorId("layout-menu", "")).toBeNull();
    expect(createLayoutArrangementAnchorId("section-menu", undefined)).toBeNull();
    expect(createLayoutArrangementAnchorId("layout-menu", "layout-tabs")).toBe(
      "layout-menu:layout-tabs",
    );
  });

  it("opens layout settings through the shared settings target", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderActiveLayoutAuthoringChrome(editor, "layout-tabs");

    await waitFor(() => {
      expect(document.body.querySelector("[data-layout-menu-trigger]")).not.toBeNull();
    });

    fireEvent.click(document.body.querySelector<HTMLButtonElement>("[data-layout-menu-trigger]")!);

    await waitFor(() => {
      expect(document.body.querySelector('[aria-label="Open layout settings"]')).not.toBeNull();
    });

    fireEvent.click(
      document.body.querySelector<HTMLButtonElement>('[aria-label="Open layout settings"]')!,
    );

    // Settings sheet rendering stays on the quarantined old host until
    // Phase 4C; the interaction contract here is the settings owner dispatch.
    await waitFor(() => {
      expect(settingsOwnerForTest(editor)).toMatchObject({
        id: "layout-tabs",
        kind: InteractionTargetKind.Layout,
      });
    });

    editor.destroy();
  });

  it("adds a tab without opening the layout menu", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    render(
      createElement(
        "div",
        null,
        createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })),
        createElement(
          InteractionProvider,
          { store: editorFacade(editor) },
          createElement(BubbleMenus, {
            blockDefinitions: builtInBlockRegistry,
            editor,
            surfaceAuthoringChrome: builtInSurfaceAuthoringChromeResolver,
            surfaceVariants: builtInSurfaceVariantRegistry,
          }),
        ),
      ),
    );

    await waitFor(() => {
      expect(document.body.querySelector("[data-layout-add-ghost]")).not.toBeNull();
    });
    expect(document.body.querySelector("[data-layout-add-ghost]")).toHaveClass(
      "sc-app-block-add",
      "sc-app-tabs-add",
    );

    fireEvent.click(document.body.querySelector("[data-layout-add-ghost]")!);

    await waitFor(() => {
      expect(document.body.querySelectorAll('[data-authoring-frame="section"]')).toHaveLength(2);
      const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

      expect(tabs).toHaveLength(2);
      expect(tabs[0]?.getAttribute("aria-selected")).toBe("false");
      expect(tabs[1]?.textContent).toBe("Tab 2");
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    });
    expect(menuOwnerForTest(editor)).toBeNull();
    expect(settingsOwnerForTest(editor)).toBeNull();

    editor.destroy();
  });

  it("opens the shared section menu target from section action triggers", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderAuthoringChrome(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-layout-section-menu-trigger]")).not.toBeNull();
    });

    const trigger = document.body.querySelector<HTMLButtonElement>(
      "[data-layout-section-menu-trigger]",
    );
    expect(trigger?.getAttribute(AUTHORING_ANCHOR_ATTR)).toBe("section-menu:tab-a");
    expect(trigger?.getAttribute("class")).toContain("sc-layout-section-action-trigger");

    fireEvent.mouseDown(trigger!);
    fireEvent.click(trigger!);

    await waitFor(() => {
      expect(menuOwnerForTest(editor)).toMatchObject({
        id: "tab-a",
        kind: InteractionTargetKind.Section,
      });
      expect(document.body.querySelector('[data-authoring-chrome="menu"]')).not.toBeNull();
    });

    const closeTrigger = document.body.querySelector<HTMLButtonElement>(
      "[data-layout-section-menu-trigger]",
    );
    fireEvent.mouseDown(closeTrigger!);
    fireEvent.click(closeTrigger!);
    expect(menuOwnerForTest(editor)).toBeNull();

    editor.destroy();
  });

  it("opens section settings through the shared settings target", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "tab-a", role: "tab-panel" },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderAuthoringChrome(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-layout-section-menu-trigger]")).not.toBeNull();
    });

    fireEvent.click(
      document.body.querySelector<HTMLButtonElement>("[data-layout-section-menu-trigger]")!,
    );

    await waitFor(() => {
      expect(document.body.querySelector('[aria-label="Open section settings"]')).not.toBeNull();
    });

    fireEvent.click(
      document.body.querySelector<HTMLButtonElement>('[aria-label="Open section settings"]')!,
    );

    // Settings sheet rendering stays on the quarantined old host until
    // Phase 4C; the interaction contract here is the settings owner dispatch.
    await waitFor(() => {
      expect(settingsOwnerForTest(editor)).toMatchObject({
        id: "tab-a",
        kind: InteractionTargetKind.Section,
      });
    });

    editor.destroy();
  });

  it("keeps tab section chrome beside the tab item, outside the tab label and panel content", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs",
                    variant: "tabs",
                    options: { variant: "default", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-a",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-course-tabs-item]")).not.toBeNull();
    });

    const item = document.body.querySelector<HTMLElement>("[data-course-tabs-item]");
    const tab = item?.querySelector<HTMLButtonElement>("[data-course-tabs-trigger]");
    const panel = document.body.querySelector<HTMLElement>('[role="tabpanel"]');
    const move = item?.querySelector<HTMLButtonElement>("[data-authoring-move-handle]");
    const menu = item?.querySelector<HTMLButtonElement>("[data-layout-section-menu-trigger]");

    expect(move).not.toBeNull();
    expect(menu).not.toBeNull();
    expect(move?.getAttribute("class")).toContain("sc-app-structure-movement-handle");
    expect(move?.getAttribute("class")).toContain("sc-app-structure-movement-handle--bare");
    expect(move?.getAttribute("class")).toContain("sc-app-compact-movement-handle");
    expect(move?.getAttribute("class")).not.toContain("sc-course-tabs__handle");
    expect(move?.getAttribute("class")).toContain("sc-app-tabs-handle");
    expect(move?.closest("[data-course-tabs-item]")).toBe(item);
    expect(menu?.closest("[data-course-tabs-item]")).toBe(item);
    expect(tab?.contains(move ?? null)).toBe(false);
    expect(tab?.contains(menu ?? null)).toBe(false);
    expect(panel?.contains(move ?? null)).toBe(false);
    expect(panel?.contains(menu ?? null)).toBe(false);
    expect(move?.getAttribute("contenteditable")).toBe("false");
    expect(menu?.getAttribute("contenteditable")).toBe("false");

    editor.destroy();
  });

  it("uses the tab item as the section movement presentation source", async () => {
    mockDefaultFloatingControlRect();
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs-presentation",
                    variant: "tabs",
                    options: { variant: "default", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-presentation",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-course-tabs-item]")).not.toBeNull();
    });
    const item = document.body.querySelector<HTMLElement>("[data-course-tabs-item]");
    if (!item) throw new Error("Expected tab item");
    const handle = item.querySelector<HTMLButtonElement>("[data-authoring-move-handle]");
    if (!handle) throw new Error("Expected tab movement handle");

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 140,
      clientY: 100,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(handle.ownerDocument, {
      clientX: 150,
      clientY: 110,
      pointerId: 1,
    });

    await waitFor(() => {
      expect(item).toHaveAttribute("data-authoring-movement-silhouette");
    });
    await waitFor(() => {
      expect(document.body.querySelector("[data-authoring-movement-snapshot]")).not.toBeNull();
    });
    const snapshot = document.body.querySelector<HTMLElement>("[data-authoring-movement-snapshot]");
    expect(snapshot?.textContent).toContain("Overview");
    expect(snapshot?.querySelector("[data-authoring-move-handle]")).toBeNull();

    editor.destroy();
  });

  it("keeps accordion section chrome around the row header, outside the disclosure label and panel content", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-accordion",
                    variant: "accordion",
                    options: {
                      variant: "default",
                      label: "Topics",
                      allowMultiple: false,
                    },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "accordion-a",
                        role: "accordion-panel",
                        options: { defaultOpen: true },
                      },
                      content: accordionSectionContent("Before class"),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="section"]')).not.toBeNull();
    });

    const section = document.body.querySelector<HTMLElement>(
      '[data-authoring-frame="section"][data-layout-kind="accordion"]',
    );
    const trigger = section?.querySelector<HTMLButtonElement>("[data-scaffold-accordion-trigger]");
    const rowChrome = trigger?.closest('[data-slot="accordion-section-title"]');
    const panel = section?.querySelector<HTMLElement>("[data-scaffold-accordion-panel]");
    const move = section?.querySelector<HTMLButtonElement>("[data-authoring-move-handle]");
    const menu = section?.querySelector<HTMLButtonElement>("[data-layout-section-menu-trigger]");

    expect(rowChrome).not.toBeNull();
    expect(move).not.toBeNull();
    expect(menu).not.toBeNull();
    expect(rowChrome?.textContent).toContain("Before class");
    expect(rowChrome?.contains(move ?? null)).toBe(false);
    expect(rowChrome?.contains(menu ?? null)).toBe(false);
    expect(trigger?.contains(move ?? null)).toBe(false);
    expect(trigger?.contains(menu ?? null)).toBe(false);
    expect(panel?.contains(move ?? null)).toBe(false);
    expect(panel?.contains(menu ?? null)).toBe(false);
    expect(move?.getAttribute("contenteditable")).toBe("false");
    expect(menu?.getAttribute("contenteditable")).toBe("false");

    editor.destroy();
  });

  it("renders tabs layout with Radix-inspired tab semantics", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs",
                    variant: "tabs",
                    options: { variant: "pills", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-a",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "tab-b",
                        role: "tab-panel",
                        options: { label: "Practice" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[role="tablist"]')).not.toBeNull();
    });

    const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(document.body.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    const sections = Array.from(
      document.body.querySelectorAll<HTMLElement>(
        '[data-authoring-frame="section"][data-layout-kind="tabs"]',
      ),
    );
    const layout = document.body.querySelector<HTMLElement>(
      '[data-authoring-frame="layout"][data-definition="tabs"]',
    );

    expect(layout?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(tabs).toHaveLength(2);
    expect(panels).toHaveLength(2);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.getAttribute("role")).toBeNull();
    expect(sections[0]?.getAttribute("data-state")).toBeNull();
    expect(tabs[0]?.textContent).toBe("Overview");
    expect(tabs[0]?.textContent).not.toContain("Section options");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
    expect(panels[0]?.hidden).toBe(false);
    expect(panels[1]?.hidden).toBe(true);
    expect(panels[0]?.getAttribute("data-state")).toBe("active");
    expect(panels[1]?.getAttribute("data-state")).toBe("inactive");
    expect(tabs[0]?.getAttribute("aria-controls")).toBe(panels[0]?.id);
    expect(panels[0]?.getAttribute("aria-labelledby")).toBe(tabs[0]?.id);
    expect(tabs[0]?.id).toMatch(/^sc-tabs-trigger-/);
    expect(panels[0]?.id).toMatch(/^sc-tabs-panel-/);
    expect(tabs[0]?.id).not.toContain("layout-tabs");
    expect(tabs[0]?.id).not.toContain("tab-a");

    const firstSectionPos = nodePos(editor, "section", "tab-a");
    const firstSectionDom = editor.view.nodeDOM(firstSectionPos);
    if (!(firstSectionDom instanceof Element)) throw new Error("Expected first section DOM");
    const movementPresentation = resolveStructureMovementTargetPresentation(
      firstSectionDom,
      resolveMovementNodeContext(editor.state.doc, firstSectionPos),
      builtInBlockRegistry,
    );
    expect(movementPresentation?.axis).toBe("horizontal");
    expect(movementPresentation?.element).toBe(tabs[0]?.closest("[data-course-tabs-item]"));

    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });

    await waitFor(() => {
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[1]?.hidden).toBe(false);
    });

    fireEvent.keyDown(tabs[1]!, { key: "ArrowDown" });

    await waitFor(() => {
      const sectionPos = nodePos(editor, "section", "tab-b");
      const section = editor.state.doc.nodeAt(sectionPos);

      expect(section).not.toBeNull();
      expect(editor.state.selection.from).toBeGreaterThan(sectionPos);
      expect(editor.state.selection.from).toBeLessThan(sectionPos + (section?.nodeSize ?? 0));
    });

    editor.destroy();
  });

  it("reveals the tab section that contains the editor text selection", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs",
                    variant: "tabs",
                    options: { variant: "default", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-a",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "tab-b",
                        role: "tab-panel",
                        options: { label: "Practice" },
                      },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Practice prompt" }],
                        },
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
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[role="tablist"]')).not.toBeNull();
    });

    const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(document.body.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(panels[1]?.hidden).toBe(true);

    editor.commands.setTextSelection(textPos(editor, "Practice prompt") + 1);

    await waitFor(() => {
      expect(tabs[0]?.getAttribute("aria-selected")).toBe("false");
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[1]?.hidden).toBe(false);
    });

    editor.destroy();
  });

  it("reveals the tab section from live interaction context before stale selection", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs",
                    variant: "tabs",
                    options: { variant: "default", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-a",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Overview prompt" }],
                        },
                      ],
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "tab-b",
                        role: "tab-panel",
                        options: { label: "Practice" },
                      },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Practice prompt" }],
                        },
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
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[role="tablist"]')).not.toBeNull();
    });

    const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(document.body.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    const overviewSelectionPos = textPos(editor, "Overview prompt") + 1;
    editor.commands.setTextSelection(overviewSelectionPos);

    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        contextOwner: structuralRefForTest(editor, "section", "tab-b"),
        kind: InteractionOwnerCommandKind.EnterEditableContent,
      }),
    );

    await waitFor(() => {
      expect(tabs[0]?.getAttribute("aria-selected")).toBe("false");
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[1]?.hidden).toBe(false);
      expect(editor.state.selection.from).toBe(overviewSelectionPos);
    });

    editor.destroy();
  });

  it("moves an existing tabs caret into the clicked tab section", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs",
                    variant: "tabs",
                    options: { variant: "default", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-a",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Overview text" }],
                        },
                      ],
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "tab-b",
                        role: "tab-panel",
                        options: { label: "Practice" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[role="tablist"]')).not.toBeNull();
    });
    editor.commands.setTextSelection(textPos(editor, "Overview text") + 1);

    const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(document.body.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    fireEvent.click(tabs[1]!);

    await waitFor(() => {
      const sectionPos = nodePos(editor, "section", "tab-b");
      const section = editor.state.doc.nodeAt(sectionPos);

      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(panels[1]?.hidden).toBe(false);
      expect(editor.state.selection.from).toBeGreaterThan(sectionPos);
      expect(editor.state.selection.from).toBeLessThan(sectionPos + (section?.nodeSize ?? 0));
    });

    editor.destroy();
  });

  it("activates the parent layout when an authoring tab trigger is selected", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs",
                    variant: "tabs",
                    options: { variant: "default", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-a",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "tab-b",
                        role: "tab-panel",
                        options: { label: "Practice" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[role="tablist"]')).not.toBeNull();
    });

    const layoutPos = nodePos(editor, "layout", "layout-tabs");
    const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

    fireEvent.click(tabs[1]!);

    await waitFor(() => {
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(explicitOwnerForTest(editor)).toMatchObject({
        id: "layout-tabs",
        kind: InteractionTargetKind.Layout,
        pos: layoutPos,
      });
    });

    // Tab activation is semantic interaction ownership, never a structural
    // NodeSelection, so Backspace cannot delete the layout from here.
    expect(resolveCourseSelectionFacts(editor.state.selection).selectionMode).not.toBe(
      CourseSelectionMode.NodeSelection,
    );
    const layoutCountBefore = countNodesOfType(editor, "layout");
    fireEvent.keyDown(editor.view.dom, { key: "Backspace" });
    editor.commands.keyboardShortcut("Backspace");
    expect(countNodesOfType(editor, "layout")).toBe(layoutCountBefore);

    editor.destroy();
  });

  it("activates the parent layout when an authoring paginated page is selected", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-pages",
                    variant: "paginated",
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "page-a",
                        role: "page",
                        options: { label: "Page one" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "page-b",
                        role: "page",
                        options: { label: "Page two" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[aria-label="Pages"]')).not.toBeNull();
    });

    const layoutPos = nodePos(editor, "layout", "layout-pages");
    const pageButton = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Page two"]',
    );
    const sections = Array.from(
      document.body.querySelectorAll<HTMLElement>(
        '[data-authoring-frame="section"][data-layout-kind="paginated"]',
      ),
    );
    const panels = Array.from(
      document.body.querySelectorAll<HTMLElement>(".sc-course-paginated__panel"),
    );

    expect(pageButton).not.toBeNull();
    expect(sections).toHaveLength(2);
    expect(panels).toHaveLength(2);
    expect(sections[0]?.getAttribute("role")).toBeNull();
    expect(sections[0]?.getAttribute("data-state")).toBeNull();
    expect(panels[0]?.getAttribute("data-state")).toBe("active");
    expect(panels[1]?.getAttribute("data-state")).toBe("inactive");
    fireEvent.click(pageButton!);

    await waitFor(() => {
      expect(pageButton?.getAttribute("aria-current")).toBe("page");
      expect(panels[0]?.getAttribute("data-state")).toBe("inactive");
      expect(panels[1]?.getAttribute("data-state")).toBe("active");
      expect(explicitOwnerForTest(editor)).toMatchObject({
        id: "layout-pages",
        kind: InteractionTargetKind.Layout,
        pos: layoutPos,
      });
    });

    // Page activation is semantic interaction ownership, never a structural
    // NodeSelection, so Backspace cannot delete the layout from here.
    expect(resolveCourseSelectionFacts(editor.state.selection).selectionMode).not.toBe(
      CourseSelectionMode.NodeSelection,
    );
    const layoutCountBefore = countNodesOfType(editor, "layout");
    editor.commands.keyboardShortcut("Backspace");
    expect(countNodesOfType(editor, "layout")).toBe(layoutCountBefore);

    editor.destroy();
  });

  it("keeps the active tab panel visible after sections are reordered", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-tabs",
                    variant: "tabs",
                    options: { variant: "default", label: "Lesson sections" },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "tab-a",
                        role: "tab-panel",
                        options: { label: "Overview" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "tab-b",
                        role: "tab-panel",
                        options: { label: "Practice" },
                      },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[role="tablist"]')).not.toBeNull();
    });

    const initialTabs = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    fireEvent.click(initialTabs[1]!);

    await waitFor(() => {
      expect(initialTabs[1]?.getAttribute("aria-selected")).toBe("true");
    });

    expect(
      reorderLayoutSectionAt(
        editor,
        nodePos(editor, "section", "tab-b"),
        nodePos(editor, "layout", "layout-tabs"),
        0,
      ),
    ).toBe(true);

    await waitFor(() => {
      const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const panels = Array.from(document.body.querySelectorAll<HTMLElement>('[role="tabpanel"]'));

      expect(tabs[0]?.textContent).toBe("Practice");
      expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
      expect(panels.filter((panel) => !panel.hidden)).toHaveLength(1);
      expect(panels[0]?.hidden).toBe(false);
      expect(panels[1]?.hidden).toBe(true);
    });

    editor.destroy();
  });

  it("renders accordion layout with accessible disclosure semantics", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-accordion",
                    variant: "accordion",
                    options: {
                      variant: "default",
                      label: "Topics",
                      allowMultiple: false,
                    },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "accordion-a",
                        role: "accordion-panel",
                        options: { defaultOpen: true },
                      },
                      content: accordionSectionContent("Before class"),
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "accordion-b",
                        role: "accordion-panel",
                        options: { defaultOpen: false },
                      },
                      content: accordionSectionContent("After class"),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-scaffold-accordion]")).not.toBeNull();
    });

    const triggers = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("[data-scaffold-accordion-trigger]"),
    );
    const sections = Array.from(
      document.body.querySelectorAll<HTMLElement>(
        '[data-authoring-frame="section"][data-layout-kind="accordion"]',
      ),
    );
    const sectionFrames = Array.from(
      document.body.querySelectorAll<HTMLElement>(".sc-course-accordion__section-frame"),
    );
    const panels = Array.from(
      document.body.querySelectorAll<HTMLElement>("[data-scaffold-accordion-panel]"),
    );

    expect(triggers).toHaveLength(2);
    expect(sections).toHaveLength(2);
    expect(panels).toHaveLength(2);
    expect(sectionFrames).toHaveLength(2);
    expect(triggers[0]?.getAttribute("aria-label")).toBe("Before class");
    expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(triggers[1]?.getAttribute("aria-expanded")).toBe("false");
    expect(triggers[0]?.getAttribute("aria-controls")).toBe(panels[0]?.id);
    expect(panels[0]?.getAttribute("aria-labelledby")).toBe(triggers[0]?.id);
    expect(sections[0]?.getAttribute("data-state")).toBeNull();
    expect(sectionFrames[0]?.getAttribute("data-state")).toBe("open");
    expect(sectionFrames[1]?.getAttribute("data-state")).toBe("closed");
    expect(panels[0]?.hidden).toBe(false);
    expect(panels[1]?.hidden).toBe(true);

    fireEvent.click(triggers[1]!);

    await waitFor(() => {
      expect(triggers[0]?.getAttribute("aria-expanded")).toBe("false");
      expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
      expect(sectionFrames[0]?.getAttribute("data-state")).toBe("closed");
      expect(sectionFrames[1]?.getAttribute("data-state")).toBe("open");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[1]?.hidden).toBe(false);
    });

    fireEvent.click(triggers[1]!);

    await waitFor(() => {
      expect(triggers[1]?.getAttribute("aria-expanded")).toBe("false");
      expect(sectionFrames[1]?.getAttribute("data-state")).toBe("closed");
      expect(panels[1]?.hidden).toBe(true);
    });

    editor.destroy();
  });

  it("adds and reveals an accordion section without opening the layout menu", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: "layout-accordion",
                    variant: "accordion",
                    options: {
                      variant: "default",
                      label: "Topics",
                      allowMultiple: false,
                    },
                  },
                  content: [
                    {
                      type: "section",
                      attrs: {
                        id: "accordion-a",
                        role: "accordion-panel",
                        options: { defaultOpen: true },
                      },
                      content: accordionSectionContent("Before class"),
                    },
                    {
                      type: "section",
                      attrs: {
                        id: "accordion-b",
                        role: "accordion-panel",
                        options: { defaultOpen: false },
                      },
                      content: accordionSectionContent("After class"),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    renderEditorContent(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-layout-add-ghost]")).not.toBeNull();
    });
    expect(document.body.querySelector("[data-layout-add-ghost]")?.getAttribute("class")).toContain(
      "sc-app-accordion-add",
    );

    fireEvent.click(document.body.querySelector("[data-layout-add-ghost]")!);

    await waitFor(() => {
      const triggers = Array.from(
        document.body.querySelectorAll<HTMLButtonElement>("[data-scaffold-accordion-trigger]"),
      );
      const sections = Array.from(
        document.body.querySelectorAll<HTMLElement>(
          '[data-authoring-frame="section"][data-layout-kind="accordion"]',
        ),
      );
      const sectionFrames = Array.from(
        document.body.querySelectorAll<HTMLElement>(".sc-course-accordion__section-frame"),
      );
      const panels = Array.from(
        document.body.querySelectorAll<HTMLElement>("[data-scaffold-accordion-panel]"),
      );

      expect(triggers).toHaveLength(3);
      expect(sections).toHaveLength(3);
      expect(sectionFrames).toHaveLength(3);
      expect(panels).toHaveLength(3);
      expect(triggers[0]?.getAttribute("aria-expanded")).toBe("false");
      expect(triggers[2]?.getAttribute("aria-label")).toBe("Section 3");
      expect(triggers[2]?.getAttribute("aria-expanded")).toBe("true");
      expect(sections[0]?.getAttribute("data-state")).toBeNull();
      expect(sectionFrames[0]?.getAttribute("data-state")).toBe("closed");
      expect(sectionFrames[2]?.getAttribute("data-state")).toBe("open");
      expect(panels[0]?.hidden).toBe(true);
      expect(panels[2]?.hidden).toBe(false);
    });
    expect(menuOwnerForTest(editor)).toBeNull();
    expect(settingsOwnerForTest(editor)).toBeNull();

    editor.destroy();
  });
});
