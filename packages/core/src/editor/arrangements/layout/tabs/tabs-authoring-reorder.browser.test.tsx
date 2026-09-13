import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import { LayerNode } from "@/document/model/layers/layer-node";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { assertParsedMountedNodeIdentity } from "@/document/model/establishment/mounted-node-identity";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { SECTION_ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { createLayoutAuthoringNodes } from "@/editor/arrangements/layout/authoring/layout-nodes";
import { createLayoutAuthoringViewRegistry } from "@/editor/arrangements/layout/authoring/layout-view-registry";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR } from "@/editor/movement/view/authoring-contained-reorder-projection";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { surfaceAssessmentQuestionSchemaExtensions } from "@/editor/testing/surface-assessment-schema-extensions";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import "@radix-ui/themes/styles.css";

import { tabsLayoutDefinition } from "./tabs-definition";
import { TabsLayoutView, TabsSectionView, tabsSectionFrame } from "./tabs-views";

interface TabsAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  handle(index: number): HTMLButtonElement;
  itemsInDom(): HTMLElement[];
  sectionIdsInDocument(): string[];
}

const mounted: TabsAuthoringHarness[] = [];
const TABS_SURFACE_ID = "surfaceTabs1";
const TABS_LAYOUT_ID = "layoutTabs01";
const TAB_SECTION_IDS = ["tabSection01", "tabSection02", "tabSection03"] as const;
const testLayoutRegistry = createLayoutRegistry([tabsLayoutDefinition]);
const testLayoutAuthoringViews = createLayoutAuthoringViewRegistry(testLayoutRegistry, [
  {
    id: tabsLayoutDefinition.id,
    layout: TabsLayoutView,
    section: TabsSectionView,
    sectionFrame: tabsSectionFrame,
  },
]);
const { layoutNode: TestLayoutAuthoringNode, sectionNode: TestSectionAuthoringNode } =
  createLayoutAuthoringNodes({
    registry: testLayoutRegistry,
    authoringViews: testLayoutAuthoringViews,
    blockDefinitions: builtInBlockRegistry,
  });
const testScaffoldCapabilities = resolveScaffoldCapabilities({
  blockCapabilities: [],
  layoutDefinitions: [tabsLayoutDefinition],
  surfaceDefinitions: [pageDefaultSurfaceDefinition],
});
const TestSectionArrangementNode = Node.create({
  name: "tabs_reorder_test_section_arrangement",
  group: SECTION_ARRANGEMENT_CONTENT,
  atom: true,
});

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("authoring Tabs reorder", () => {
  it("projects tab order locally and commits the document once on keyboard drop", async () => {
    await page.viewport(1000, 800);
    const harness = await mountTabsAuthoringHarness();
    mounted.push(harness);
    const items = harness.itemsInDom();
    const first = items[0];
    const second = items[1];
    if (!first || !second) throw new Error("Tabs reorder requires two tab items");
    const firstLeft = first.getBoundingClientRect().left;
    const secondLeft = second.getBoundingClientRect().left;
    const before = harness.sectionIdsInDocument();
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    const handle = harness.handle(0);
    const activationId = handle.getAttribute("data-authoring-movement-activation-id");
    handle.focus({ preventScroll: true });
    expect(document.activeElement).toBe(handle);
    expect(handle.disabled).toBe(false);
    expect(handle).toHaveAttribute("data-interaction-drag-activation-valid", "true");
    expect(first.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(first.getBoundingClientRect().height).toBeGreaterThan(0);
    await userEvent.keyboard(" ");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(
      () =>
        first.getBoundingClientRect().left > firstLeft + 4 &&
        second.getBoundingClientRect().left < secondLeft - 4,
      "Tabs to project their horizontal order",
    );
    expect(harness.itemsInDom()).toEqual(items);
    expect(harness.sectionIdsInDocument()).toEqual(before);
    expect(documentWrites).toBe(0);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await userEvent.keyboard(" ");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.sectionIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(documentWrites).toBe(1);
    await waitFor(
      () =>
        document.activeElement?.getAttribute("data-authoring-movement-activation-id") ===
        activationId,
      "focus restoration to the moved tab",
    );
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("uses the same local tab projection for pointer dragging", async () => {
    await page.viewport(1000, 800);
    const harness = await mountTabsAuthoringHarness();
    mounted.push(harness);
    const first = harness.itemsInDom()[0];
    const second = harness.itemsInDom()[1];
    if (!first || !second) throw new Error("Tabs reorder requires two tab items");
    const firstLeft = first.getBoundingClientRect().left;
    const secondRect = second.getBoundingClientRect();
    const before = harness.sectionIdsInDocument();
    const destination = {
      x: secondRect.left + secondRect.width * 0.75,
      y: secondRect.top + secondRect.height / 2,
    };

    await startPointerDrag(harness.handle(0), destination);
    await waitFor(
      () => first.getBoundingClientRect().left > firstLeft + 4,
      "pointer-projected Tabs order",
    );

    expect(harness.sectionIdsInDocument()).toEqual(before);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.sectionIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(
      harness.host.querySelector(`[${AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR}]`),
    ).toBeNull();
  });
});

async function mountTabsAuthoringHarness(): Promise<TabsAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 500px; padding: 32px; position: relative; width: 900px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; min-height: 436px; overflow: auto; padding: 24px; position: relative; width: 836px";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(testScaffoldCapabilities),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      ...surfaceAssessmentQuestionSchemaExtensions,
      RegionNode,
      LayerNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      TestSectionArrangementNode,
      TestLayoutAuthoringNode,
      TestSectionAuthoringNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: tabsDocument(),
  });
  expect(assertParsedMountedNodeIdentity(editor.state.doc)).toEqual([]);
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll("[data-course-tabs-item]").length === 3);
  await waitFor(
    () =>
      ownerRoot.querySelectorAll('[data-interaction-drag-activation-valid="true"]').length === 3,
    "Tabs drag environment",
  );
  await animationFrames(2);

  const itemsInDom = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>("[data-course-tabs-item]")).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  return {
    editor,
    host,
    rendered,
    handle: (index) => requiredElement(itemsInDom()[index]!, "[data-authoring-move-handle]"),
    itemsInDom,
    sectionIdsInDocument: () => sectionIdsInDocument(editor),
  };
}

function tabsDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: createEmbeddedNodeId(), mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: TABS_SURFACE_ID, variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: TABS_LAYOUT_ID,
                  variant: "tabs",
                  options: { label: "Lesson sections", variant: "default" },
                },
                content: [
                  tabSection(TAB_SECTION_IDS[0], "Overview"),
                  tabSection(TAB_SECTION_IDS[1], "Practice"),
                  tabSection(TAB_SECTION_IDS[2], "Review"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function tabSection(id: string, label: string): JSONContent {
  return {
    type: "section",
    attrs: { id, role: "tab-panel", options: { label } },
    content: [
      createLayerWithContent([
        {
          type: "paragraph",
          attrs: { id: createEmbeddedNodeId() },
          content: [{ type: "text", text: `${label} content` }],
        },
      ]),
    ],
  };
}

function sectionIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "section" && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
  });
  return ids;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}.`);
  return element;
}

async function startPointerDrag(
  source: HTMLElement,
  destination: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const sourceRect = source.getBoundingClientRect();
  const start = {
    x: sourceRect.left + sourceRect.width / 2,
    y: sourceRect.top + sourceRect.height / 2,
  };
  fireEvent.pointerDown(source, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: start.x + 12,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(1);
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function finishPointerDrag(point: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function waitFor(condition: () => unknown, description = "Tabs authoring drag state") {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${description}.`);
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
