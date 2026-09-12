import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { LayerNode } from "@/document/model/layers/layer-node";
import { SECTION_ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { createLayoutAuthoringNodes } from "@/editor/arrangements/layout/authoring/layout-nodes";
import { createLayoutAuthoringViewRegistry } from "@/editor/arrangements/layout/authoring/layout-view-registry";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR } from "@/editor/movement/view/authoring-contained-reorder-projection";
import { AUTHORING_MOVEMENT_SILHOUETTE_ATTR } from "@/editor/movement/view/authoring-movement-presentation";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { surfaceAssessmentQuestionSchemaExtensions } from "@/editor/testing/surface-assessment-schema-extensions";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import "@radix-ui/themes/styles.css";

import { accordionLayoutDefinition } from "./accordion-definition";
import { AccordionSectionPanelNode, AccordionSectionTitleNode } from "./accordion-section-nodes";
import {
  AccordionLayoutView,
  AccordionSectionView,
  accordionSectionFrame,
} from "./accordion-views";

interface AccordionAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  handle(index: number): HTMLButtonElement;
  itemsInDom(): HTMLElement[];
  sectionIdsInDocument(): string[];
}

const mounted: AccordionAuthoringHarness[] = [];
const testLayoutRegistry = createLayoutRegistry([accordionLayoutDefinition]);
const testLayoutAuthoringViews = createLayoutAuthoringViewRegistry(testLayoutRegistry, [
  {
    id: accordionLayoutDefinition.id,
    layout: AccordionLayoutView,
    section: AccordionSectionView,
    sectionFrame: accordionSectionFrame,
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
  layoutDefinitions: [accordionLayoutDefinition],
  surfaceDefinitions: [pageDefaultSurfaceDefinition],
});
const TestSectionArrangementNode = Node.create({
  name: "accordion_reorder_test_section_arrangement",
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

describe("authoring Accordion reorder", () => {
  it("projects an Accordion section upward and commits once on keyboard drop", async () => {
    await page.viewport(1000, 900);
    const harness = await mountAccordionAuthoringHarness();
    mounted.push(harness);
    const items = harness.itemsInDom();
    const second = items[1];
    const third = items[2];
    if (!second || !third) throw new Error("Accordion reorder requires three sections");
    const secondTop = second.getBoundingClientRect().top;
    const thirdTop = third.getBoundingClientRect().top;
    const before = harness.sectionIdsInDocument();
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    const handle = harness.handle(2);
    const activationId = handle.getAttribute("data-authoring-movement-activation-id");
    handle.focus({ preventScroll: true });
    expect(document.activeElement).toBe(handle);
    await userEvent.keyboard(" ");
    const overlay = await waitForElement(harness.host, "[data-interaction-drag-overlay]");

    expect(overlay.querySelector("[data-authoring-movement-snapshot]")?.textContent).toContain(
      "Review",
    );
    await waitFor(
      () => harness.host.querySelector(`[${AUTHORING_MOVEMENT_SILHOUETTE_ATTR}]`),
      "Accordion keyboard silhouette",
    );
    expect(harness.host.querySelector(`[${AUTHORING_MOVEMENT_SILHOUETTE_ATTR}]`)).toHaveAttribute(
      "data-id",
      "accordion-c",
    );

    await userEvent.keyboard("{ArrowUp}");
    await waitFor(
      () =>
        third.getBoundingClientRect().top < thirdTop - 4 &&
        second.getBoundingClientRect().top > secondTop + 4,
      "Accordion to project upward",
    );

    expect(harness.itemsInDom()).toEqual(items);
    expect(harness.sectionIdsInDocument()).toEqual(before);
    expect(documentWrites).toBe(0);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await userEvent.keyboard(" ");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.sectionIdsInDocument()).toEqual([before[0], before[2], before[1]]);
    expect(documentWrites).toBe(1);
    await waitFor(
      () =>
        document.activeElement?.getAttribute("data-authoring-movement-activation-id") ===
        activationId,
      "focus restoration to the moved Accordion section",
    );
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("projects an Accordion section downward during pointer dragging", async () => {
    await page.viewport(1000, 900);
    const harness = await mountAccordionAuthoringHarness();
    mounted.push(harness);
    const items = harness.itemsInDom();
    const first = items[0];
    const second = items[1];
    if (!first || !second) throw new Error("Accordion reorder requires two sections");
    const firstTop = first.getBoundingClientRect().top;
    const secondTop = second.getBoundingClientRect().top;
    const secondRect = second.getBoundingClientRect();
    const before = harness.sectionIdsInDocument();
    const destination = {
      x: secondRect.left + secondRect.width / 2,
      y: secondRect.top + secondRect.height * 0.75,
    };

    await startPointerDrag(harness.handle(0), destination);
    const overlay = await waitForElement(harness.host, "[data-interaction-drag-overlay]");

    expect(overlay.querySelector("[data-authoring-movement-snapshot]")?.textContent).toContain(
      "Overview",
    );
    await waitFor(
      () => harness.host.querySelector(`[${AUTHORING_MOVEMENT_SILHOUETTE_ATTR}]`),
      "Accordion pointer silhouette",
    );
    expect(harness.host.querySelector(`[${AUTHORING_MOVEMENT_SILHOUETTE_ATTR}]`)).toHaveAttribute(
      "data-id",
      "accordion-a",
    );
    await waitFor(
      () =>
        first.getBoundingClientRect().top > firstTop + 4 &&
        second.getBoundingClientRect().top < secondTop - 4,
      "Accordion to project downward",
    );

    expect(harness.sectionIdsInDocument()).toEqual(before);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.sectionIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(
      harness.host.querySelector(`[${AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR}]`),
    ).toBeNull();
    expect(first).not.toHaveAttribute(AUTHORING_MOVEMENT_SILHOUETTE_ATTR);
  });
});

async function mountAccordionAuthoringHarness(): Promise<AccordionAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 650px; padding: 32px; position: relative; width: 900px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; min-height: 586px; overflow: auto; padding: 24px; position: relative; width: 836px";
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
      TestSectionArrangementNode,
      TestLayoutAuthoringNode,
      TestSectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: accordionDocument(),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll(accordionItemSelector()).length === 3);
  await waitFor(
    () =>
      ownerRoot.querySelectorAll('[data-interaction-drag-activation-valid="true"]').length === 3,
    "Accordion drag environment",
  );
  await animationFrames(2);

  const itemsInDom = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>(accordionItemSelector())).filter(
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

function accordionItemSelector(): string {
  return '[data-authoring-frame="section"][data-layout-kind="accordion"]';
}

function accordionDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: [
          {
            type: "surface",
            attrs: { id: "surface-accordion", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: "layout-accordion",
                  variant: "accordion",
                  options: { allowMultiple: false, label: "Lesson sections", variant: "default" },
                },
                content: [
                  accordionSection("accordion-a", "Overview"),
                  accordionSection("accordion-b", "Practice"),
                  accordionSection("accordion-c", "Review"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function accordionSection(id: string, label: string): JSONContent {
  return {
    type: "section",
    attrs: { id, role: "accordion-panel", options: { defaultOpen: false } },
    content: [
      {
        type: "accordion_section_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
      },
      {
        type: "accordion_section_panel",
        content: [{ type: "paragraph", content: [{ type: "text", text: `${label} content` }] }],
      },
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

async function waitForElement(root: ParentNode, selector: string): Promise<HTMLElement> {
  let element: HTMLElement | null = null;
  await waitFor(() => {
    element = root.querySelector<HTMLElement>(selector);
    return element;
  }, `element ${selector}`);
  return element!;
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
    clientX: start.x,
    clientY: start.y + 12,
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

async function waitFor(condition: () => unknown, description = "Accordion authoring drag state") {
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
