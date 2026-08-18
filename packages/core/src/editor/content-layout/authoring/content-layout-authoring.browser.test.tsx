import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document/semantic-document-storage";
import { AuthoringContentChrome } from "@/editor/shell/authoring/AuthoringContentChrome";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { AppNotificationsProvider } from "@/ui/components/app/AppNotifications/AppNotifications";
import { CONTENT_LAYOUT_PROJECTION_DOM_ATTRS } from "../view/content-layout-projection-dom";
import { readContentLayoutAuthoringState } from "../prosemirror/content-layout-authoring-extension";
import "@/styles/globals.css";

const IDS = Object.freeze({
  first: id("para00000001"),
  region: id("region000001"),
  second: id("para00000002"),
  slideTitle: id("slidetitle01"),
  surface: id("surface00001"),
});

const composition = createCoreScaffoldAuthoringComposition();
const mountedEditors: MountedEditor[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const mounted of mountedEditors.splice(0)) {
    mounted.root.unmount();
    mounted.editor.destroy();
    mounted.host.remove();
  }
});

describe("mounted Content Layout authoring", () => {
  it("keeps Region intent and child one physical selection after Sequence whitespace activation", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Sequence);
    const { editor } = mounted;
    const documentBefore = JSON.stringify(editor.getJSON());
    const undoBefore = editor.can().undo();

    await expectProjectedChild(editor, IDS.first, "available");
    await expectProjectedChild(editor, IDS.second, "withheld");

    await openRegionBubble(editor);
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.second, "available");
    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 2 of 2" }))
      .toBeVisible();

    await userEvent.click(page.getByRole("button", { name: "Previous sequence child" }));
    await expectProjectedChild(editor, IDS.first, "available");
    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 2" }))
      .toBeVisible();

    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
    await clickRegionWhitespace(editor);

    await expectProjectedChild(editor, IDS.first, "available");
    await expectProjectedChild(editor, IDS.second, "withheld");
    expect(getSemanticDocumentControllerForEditor(editor).getSnapshot()).toMatchObject({
      selectedId: IDS.region,
      selectionOrigin: "editor",
    });
    expectSelectionWithin(editor, IDS.first);
    expectProjectedDom(editor, IDS.first, "available");
    expectProjectedDom(editor, IDS.second, "withheld");
    expect(JSON.stringify(editor.getJSON())).toBe(documentBefore);
    expect(editor.can().undo()).toBe(undoBefore);
    expect(editor.can().undo()).toBe(false);
    await openRegionBubble(editor);
    await expect
      .element(page.getByRole("status", { name: "Current sequence child 1 of 2" }))
      .toBeVisible();
  });

  it("keeps Flow structural placement on the production pointer path", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Flow);
    const { editor } = mounted;
    const documentBefore = JSON.stringify(editor.getJSON());
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords");

    await clickRegionWhitespace(editor);

    expect(posAtCoords).toHaveBeenCalled();
    expect(getSemanticDocumentControllerForEditor(editor).getSnapshot()).toMatchObject({
      selectedId: IDS.region,
      selectionOrigin: "editor",
    });
    expectSelectionWithin(editor, IDS.region);
    expect(findNodeDom(editor, IDS.first)).not.toHaveAttribute(
      CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot,
    );
    expect(findNodeDom(editor, IDS.second)).not.toHaveAttribute(
      CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot,
    );
    expect(JSON.stringify(editor.getJSON())).toBe(documentBefore);
    expect(editor.can().undo()).toBe(false);
  });

  it("hands a navigated Sequence child to ordinary editable click selection", async () => {
    const mounted = await mountRegionEditor(PresentationContentLayout.Sequence);
    const { editor } = mounted;

    await expectProjectedChild(editor, IDS.first, "available");
    await openRegionBubble(editor);
    await userEvent.click(page.getByRole("button", { name: "Next sequence child" }));
    await expectProjectedChild(editor, IDS.second, "available");

    getInteractionFacadeStoreForEditor(editor).getState().commands.dismissInteraction();
    await nextFrame();
    const second = requireNodeDom(editor, IDS.second);
    await userEvent.click(second);

    expect(getSemanticDocumentControllerForEditor(editor).getSnapshot()).toMatchObject({
      selectedId: IDS.second,
      selectionOrigin: "editor",
    });
    expectSelectionWithin(editor, IDS.second);
    expect(
      readContentLayoutAuthoringState(editor.state).containers.get(IDS.region)?.activeChildId,
    ).toBe(IDS.second);
    expectProjectedDom(editor, IDS.second, "available");
    expectProjectedDom(editor, IDS.first, "withheld");
  });
});

interface MountedEditor {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly root: Root;
}

async function mountRegionEditor(contentLayout: PresentationContentLayout): Promise<MountedEditor> {
  const environment = createCourseDocumentAuthoringEnvironment({ composition, editable: true });
  const editor = new Editor({
    editable: true,
    extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
    content: createDocument(contentLayout),
  });
  const host = document.createElement("div");
  host.style.cssText =
    "height: 640px; inset: 0 auto auto 0; overflow: visible; position: absolute; width: 960px;";
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    <AppThemeProvider appearance="light">
      <main>
        <AppNotificationsProvider appearance="light">
          <CourseThemeProvider appearance="light" theme={createDefaultPersistedCourseTheme()}>
            <AuthoringContentChrome
              blockDefinitions={composition.capabilities.blocks.registry}
              editable
              editor={editor}
              overlayContainer={host}
              surfaceAuthoringChrome={composition.surfaces.chrome}
              surfaceVariants={composition.capabilities.surfaces.registry}
            >
              <EditorContent className="sc-course-document-editor__content" editor={editor} />
            </AuthoringContentChrome>
          </CourseThemeProvider>
        </AppNotificationsProvider>
      </main>
    </AppThemeProvider>,
  );

  const mounted = { editor, host, root };
  mountedEditors.push(mounted);
  await expect.element(page.getByText("First child")).toBeVisible();
  establishRegionTestGeometry(editor);
  return mounted;
}

async function openRegionBubble(editor: Editor): Promise<void> {
  const target = {
    id: IDS.region,
    kind: InteractionTargetKind.Region,
    pos: findNodePosition(editor, IDS.region),
  } as const;
  const commands = getInteractionFacadeStoreForEditor(editor).getState().commands;
  expect(commands.activateStructuralTarget(target)).toBe(true);
  expect(commands.openMenu(target)).toBe(true);
  await expect.element(page.getByRole("status", { name: /Current sequence child/ })).toBeVisible();
}

async function clickRegionWhitespace(editor: Editor): Promise<void> {
  const region = requireRegionFrame(editor);
  await userEvent.click(region, { position: { x: 8, y: 8 } });
}

function establishRegionTestGeometry(editor: Editor): void {
  const region = requireRegionFrame(editor);
  region.style.boxSizing = "border-box";
  region.style.height = "360px";
  region.style.padding = "32px";
  region.style.width = "720px";
  const contentRoot = region.querySelector<HTMLElement>("[data-content-layout-root]");
  if (!contentRoot) throw new Error("Expected mounted Region content root.");
  contentRoot.style.display = "grid";
  contentRoot.style.height = "296px";
  contentRoot.style.width = "656px";
  for (const childId of [IDS.first, IDS.second]) {
    const child = requireNodeDom(editor, childId);
    child.style.alignSelf = "start";
    child.style.minHeight = "64px";
    child.style.width = "320px";
  }
}

async function expectProjectedChild(
  editor: Editor,
  childId: EmbeddedNodeId,
  availability: "available" | "withheld",
): Promise<void> {
  const child = requireNodeDom(editor, childId);
  await expect
    .element(page.elementLocator(child))
    .toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability, availability);
}

function expectProjectedDom(
  editor: Editor,
  childId: EmbeddedNodeId,
  availability: "available" | "withheld",
): void {
  const child = requireNodeDom(editor, childId);
  expect(child).toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot, "shared");
  expect(child).toHaveAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.availability, availability);
  expect(child).toHaveAttribute(
    CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.interaction,
    availability === "available" ? "enabled" : "inert",
  );
  expect(child).toHaveAttribute(
    CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.accessibility,
    availability === "available" ? "exposed" : "hidden",
  );
  if (availability === "available") {
    expect(child).not.toHaveAttribute("inert");
    expect(child).not.toHaveAttribute("aria-hidden");
  } else {
    expect(child).toHaveAttribute("inert", "");
    expect(child).toHaveAttribute("aria-hidden", "true");
  }
}

function expectSelectionWithin(editor: Editor, id: EmbeddedNodeId): void {
  const from = findNodePosition(editor, id);
  const node = editor.state.doc.nodeAt(from);
  if (!node) throw new Error(`Expected document node ${id}.`);
  expect(editor.state.selection.from).toBeGreaterThan(from);
  expect(editor.state.selection.to).toBeLessThan(from + node.nodeSize);
}

function findNodeDom(editor: Editor, id: EmbeddedNodeId): HTMLElement | null {
  const dom = editor.view.nodeDOM(findNodePosition(editor, id));
  return dom instanceof HTMLElement ? dom : null;
}

function requireNodeDom(editor: Editor, id: EmbeddedNodeId): HTMLElement {
  const dom = findNodeDom(editor, id);
  if (!dom) throw new Error(`Expected mounted DOM node ${id}.`);
  return dom;
}

function requireRegionFrame(editor: Editor): HTMLElement {
  const regionNodeView = requireNodeDom(editor, IDS.region);
  const regionFrame = regionNodeView.querySelector<HTMLElement>(
    `[data-authoring-frame="region"][data-id="${IDS.region}"]`,
  );
  if (!regionFrame) throw new Error("Expected mounted Region authoring frame.");
  return regionFrame;
}

function findNodePosition(editor: Editor, id: EmbeddedNodeId): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs["id"] !== id) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`Expected document node ${id}.`);
  return found;
}

function createDocument(contentLayout: PresentationContentLayout): JSONContent {
  const content = createScaffoldDocumentContent({
    initialCourseSectionTitle: "Mounted Content Layout",
    mode: "slideshow",
    surfaceId: IDS.surface,
  });
  const courseDocument = content.content?.[0];
  const courseSection = courseDocument?.content?.[0];
  if (!courseDocument || courseDocument.type !== "courseDocument" || !courseSection) {
    throw new Error("Expected generated slideshow Course Document.");
  }
  courseDocument.content = [
    courseSection,
    {
      type: "surface",
      attrs: {
        id: IDS.surface,
        settings: {
          footer: { enabled: false },
          header: { enabled: false },
          slideTitle: { enabled: true },
        },
        variant: "slide-content",
      },
      content: [
        { type: "slide_title", attrs: { id: IDS.slideTitle } },
        {
          type: "region",
          attrs: { contentLayout, id: IDS.region, role: "main" },
          content: [paragraph(IDS.first, "First child"), paragraph(IDS.second, "Second child")],
        },
      ],
    },
  ];
  return content;
}

function paragraph(id: EmbeddedNodeId, text: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    content: [{ type: "text", text }],
  };
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
