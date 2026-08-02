// @vitest-environment happy-dom

import { CircleIcon } from "@phosphor-icons/react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type BlockCapability,
  type LayoutCapability,
  type SurfaceCapability,
} from "@/composition/application/create-scaffold-application";
import { createScaffoldAuthoringCataloguesStorageExtension } from "@/composition/authoring/scaffold-authoring-catalogues-storage";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { AUTHORING_ANCHOR_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { AUTHORING_INTERACTION_ROOT_ATTR } from "@/editor/interactions/dom/authoring-root";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { interactionOwnerPluginKey } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { authoringSlideDividersPluginKey } from "@/editor/surfaces/authoring/AuthoringSlideDividers";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";

import {
  AuthoringDocumentBlockStrip,
  AuthoringDocumentChrome,
  AuthoringDocumentSurfaceTemplatePickerHost,
} from "./AuthoringDocumentChrome";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";

function createTestEditor() {
  const application = createScaffoldApplication();

  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createScaffoldCapabilitiesStorageExtension(application.capabilities),
      createScaffoldAuthoringCataloguesStorageExtension(application.authoring.catalogues),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function createAuthoringEditor() {
  return new Editor({
    editable: true,
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
    }),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

describe("AuthoringDocumentChrome", () => {
  it("binds the editor's Core insertion catalogue at document composition", () => {
    const editor = createTestEditor();

    render(<AuthoringDocumentBlockStrip editor={editor} />);

    expect(screen.getByLabelText("Insert block")).toBeInTheDocument();

    editor.destroy();
  });

  it("keeps cumulative Block and Layout discovery isolated between simultaneous editors", async () => {
    const hostBlock = hostBlockCapability("plus_block_strip_block", "Plus Block Strip Block");
    const hostLayout = hostLayoutCapability("plus-block-strip-layout", "Plus Block Strip Layout");
    const plusApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "plus-block-strip",
          blocks: [hostBlock],
          layouts: [hostLayout],
        }),
      ],
    });
    const coreEditor = createApplicationAuthoringEditor(createScaffoldApplication());
    const plusEditor = createApplicationAuthoringEditor(plusApplication);
    const rendered = render(
      <>
        <AuthoringDocumentBlockStrip editor={plusEditor} />
        <AuthoringDocumentBlockStrip editor={coreEditor} />
      </>,
    );
    const [plusStrip, coreStrip] = screen.getAllByRole("complementary", {
      name: "Insert block",
    });
    if (!plusStrip || !coreStrip) throw new Error("Expected two mounted Block Strips.");

    await userEvent.click(within(plusStrip).getByRole("button", { name: "Content" }));
    expect(screen.getByRole("button", { name: "Plus Block Strip Block" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Callout" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(coreStrip).getByRole("button", { name: "Content" }));
    expect(screen.queryByRole("button", { name: "Plus Block Strip Block" })).toBeNull();
    expect(screen.getByRole("button", { name: "Callout" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(plusStrip).getByRole("button", { name: "Containers" }));
    expect(screen.getByRole("button", { name: "Plus Block Strip Layout" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(coreStrip).getByRole("button", { name: "Containers" }));
    expect(screen.queryByRole("button", { name: "Plus Block Strip Layout" })).toBeNull();

    rendered.unmount();
    plusEditor.destroy();
    coreEditor.destroy();
  });

  it("keeps cumulative Surface discovery and insertion isolated at the shell boundary", async () => {
    const hostSurface = hostSurfaceCapability("plus-private-surface");
    const plusApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "plus-surface-picker",
          surfaces: [hostSurface],
        }),
      ],
    });
    const plusEditor = createApplicationAuthoringEditor(
      plusApplication,
      createSlideshowDocumentJSON({
        regionId: "plus-region",
        surfaceId: "plus-slide-1",
        text: "Plus slide content",
      }),
    );
    const coreEditor = createApplicationAuthoringEditor(
      createScaffoldApplication(),
      createSlideshowDocumentJSON({
        regionId: "core-region",
        surfaceId: "core-slide-1",
        text: "Core slide content",
      }),
    );
    const user = userEvent.setup();
    const rendered = render(
      <>
        <AuthoringDocumentSurfaceTemplatePickerHost editor={plusEditor} />
        <AuthoringDocumentSurfaceTemplatePickerHost editor={coreEditor} />
      </>,
    );
    openSurfaceTemplatePicker(coreEditor, "core-slide-1");
    openSurfaceTemplatePicker(plusEditor, "plus-slide-1");

    const dialogs = await waitFor(() => {
      const mountedDialogs = Array.from(
        document.body.querySelectorAll<HTMLElement>(".sc-surface-template-picker-dialog"),
      );
      expect(mountedDialogs).toHaveLength(2);
      return mountedDialogs;
    });
    const plusDialog = dialogs.find((dialog) =>
      dialog.textContent?.includes("Private Plus Surface"),
    );
    const coreDialog = dialogs.find(
      (dialog) => !dialog.textContent?.includes("Private Plus Surface"),
    );
    if (!plusDialog || !coreDialog) {
      throw new Error("Expected one isolated Plus Surface picker and one Core Surface picker.");
    }
    expect(dialogs.every((dialog) => dialog.textContent?.includes("Content"))).toBe(true);

    const hostSurfaceCard = within(plusDialog)
      .getByText("Private Plus Surface")
      .closest<HTMLButtonElement>("button");
    if (!hostSurfaceCard) throw new Error("Expected the private Plus Surface card.");
    await user.click(hostSurfaceCard);

    await waitFor(() => {
      expect(readSurfaceVariants(plusEditor.getJSON())).toEqual([
        "slide-content",
        hostSurface.definition.id,
      ]);
    });
    expect(readSurfaceVariants(coreEditor.getJSON())).toEqual(["slide-content"]);
    expect(document.body.querySelectorAll(".sc-surface-template-picker-dialog")).toHaveLength(1);

    rendered.unmount();
    plusEditor.destroy();
    coreEditor.destroy();
  });

  it("renders authoring chrome only for editable mounts", () => {
    const editor = createTestEditor();

    const { rerender } = render(
      <AuthoringDocumentChrome editable editor={editor}>
        <div data-testid="editor-content" />
      </AuthoringDocumentChrome>,
    );

    expect(screen.getByTestId("scaffold-editor-movement-layer")).toBeInTheDocument();
    expect(
      screen.getByTestId("editor-content").closest(`[${AUTHORING_INTERACTION_ROOT_ATTR}]`),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-editor-resize-frame-layer")).toBeNull();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();

    rerender(
      <AuthoringDocumentChrome editable={false} editor={editor}>
        <div data-testid="editor-content" />
      </AuthoringDocumentChrome>,
    );

    expect(screen.queryByTestId("scaffold-editor-movement-layer")).toBeNull();
    expect(screen.queryByTestId("scaffold-editor-resize-frame-layer")).toBeNull();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();

    editor.destroy();
  });

  it("suppresses authoring chrome when the editor instance is read-only", () => {
    const editor = new Editor({
      editable: false,
      extensions: [StarterKit.configure({ undoRedo: false })],
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    render(
      <AuthoringDocumentChrome editable editor={editor}>
        <div data-testid="editor-content" />
      </AuthoringDocumentChrome>,
    );

    expect(screen.queryByTestId("scaffold-editor-movement-layer")).toBeNull();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();

    editor.destroy();
  });

  it("renders active surface and region menu triggers in floating chrome", async () => {
    const editor = createAuthoringEditor();
    const documentJSON = createSlideshowDocumentJSON({
      regionId: "region-a",
      surfaceId: "surface-region-menu-smoke",
      text: "Region content",
    });
    editor.commands.setContent(documentJSON);
    editor.commands.setTextSelection(findParagraphTextPosition(editor, "Region content"));
    expect(
      publishInteractionOwnerSnapshot(editor.state, null, {
        blockDefinitions: builtInBlockRegistry,
      }).owners.contextOwners.region,
    ).toMatchObject({
      id: "region-a",
      kind: InteractionTargetKind.Region,
    });

    const rendered = render(
      <AuthoringDocumentChrome editable editor={editor}>
        <EditorContent className="sc-course-document-editor__content" editor={editor} />
      </AuthoringDocumentChrome>,
    );

    const surface = await waitUntil(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-authoring-frame="surface"][data-id="surface-region-menu-smoke"]',
      );
      if (!element) throw new Error("Expected surface frame.");
      return element;
    });
    const region = await waitUntil(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-authoring-frame="region"][data-id="region-a"]',
      );
      if (!element) throw new Error("Expected region frame.");
      return element;
    });
    mockFloatingControlRect(editor.view.dom.parentElement, {
      height: 400,
      width: 600,
      x: 0,
      y: 0,
    });
    mockFloatingControlRect(surface, {
      height: 320,
      width: 520,
      x: 20,
      y: 20,
    });
    mockFloatingControlRect(region, {
      height: 220,
      width: 420,
      x: 60,
      y: 60,
    });
    editor.commands.focus();

    expect(document.body.querySelector("[data-surface-menu-trigger]")).toBeNull();
    expect(document.body.querySelector("[data-region-menu-trigger]")).toBeNull();

    const ports = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);
    expect(
      ports.activateStructuralTarget({
        id: "surface-region-menu-smoke",
        kind: InteractionTargetKind.Surface,
        pos: nodePos(editor, "surface", "surface-region-menu-smoke"),
      }),
    ).toBe(true);

    const surfaceTrigger = await waitUntil(() => {
      const element = document.body.querySelector<HTMLButtonElement>(
        '[data-scaffold-editor-floating-layer-kind="authoring"] [data-surface-menu-trigger]',
      );
      if (!element) throw new Error("Expected floating surface menu trigger.");
      return element;
    });
    expect(surface.contains(surfaceTrigger)).toBe(false);
    expect(surfaceTrigger.getAttribute(AUTHORING_ANCHOR_ATTR)).toBe(
      "surface-menu:surface-region-menu-smoke",
    );

    fireEvent.click(surfaceTrigger);

    await waitUntil(() => {
      expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toMatchObject({
        id: "surface-region-menu-smoke",
        kind: InteractionTargetKind.Surface,
      });
    });
    expect(
      getInteractionFacadeStoreForEditor(editor).getState().snapshot.owners.menuOwner.target,
    ).toMatchObject({
      id: "surface-region-menu-smoke",
      kind: InteractionTargetKind.Surface,
    });

    expect(ports.dismissInteraction()).toBe(true);

    expect(
      ports.activateStructuralTarget({
        id: "region-a",
        kind: InteractionTargetKind.Region,
        pos: nodePos(editor, "region", "region-a"),
      }),
    ).toBe(true);

    const regionTrigger = await waitUntil(() => {
      const element = document.body.querySelector<HTMLButtonElement>(
        '[data-scaffold-editor-floating-layer-kind="authoring"] [data-region-menu-trigger]',
      );
      if (!element) throw new Error("Expected floating region menu trigger.");
      return element;
    });

    expect(region.contains(regionTrigger)).toBe(false);
    expect(regionTrigger.getAttribute(AUTHORING_ANCHOR_ATTR)).toBe("region-menu:region-a");

    fireEvent.click(regionTrigger);

    await waitUntil(() => {
      expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toMatchObject({
        id: "region-a",
        kind: InteractionTargetKind.Region,
      });
    });
    expect(
      getInteractionFacadeStoreForEditor(editor).getState().snapshot.owners.menuOwner.target,
    ).toMatchObject({
      id: "region-a",
      kind: InteractionTargetKind.Region,
    });

    rendered.unmount();
    editor.destroy();
  });

  it("retains the Surface template picker in document chrome", async () => {
    const editor = createAuthoringEditor();
    editor.commands.setContent(
      createSlideshowDocumentJSON({
        regionId: "region-template-picker",
        surfaceId: "surface-template-picker",
        text: "Template picker content",
      }),
    );

    const rendered = render(
      <AuthoringDocumentChrome editable editor={editor}>
        <EditorContent className="sc-course-document-editor__content" editor={editor} />
      </AuthoringDocumentChrome>,
    );

    editor.view.dispatch(
      editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
        type: "open-template-picker",
        afterSurfaceId: "surface-template-picker",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Choose slide template" }),
    ).toBeInTheDocument();

    rendered.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    editor.destroy();
  });

  it("does not refocus a destroyed editor after template picker teardown", async () => {
    const editor = createAuthoringEditor();
    editor.commands.setContent(
      createSlideshowDocumentJSON({
        regionId: "region-template-picker-teardown",
        surfaceId: "surface-template-picker-teardown",
        text: "Template picker teardown content",
      }),
    );
    const focus = vi.spyOn(editor.view, "focus");

    const rendered = render(
      <AuthoringDocumentChrome editable editor={editor}>
        <EditorContent className="sc-course-document-editor__content" editor={editor} />
      </AuthoringDocumentChrome>,
    );
    editor.view.dispatch(
      editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
        type: "open-template-picker",
        afterSurfaceId: "surface-template-picker-teardown",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Choose slide template" }),
    ).toBeInTheDocument();

    rendered.unmount();
    editor.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(focus).not.toHaveBeenCalled();
  });
});

function createApplicationAuthoringEditor(
  application: ReturnType<typeof createScaffoldApplication>,
  content: JSONContent = createScaffoldDocumentContent({ mode: "page" }),
) {
  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: application.authoring,
    }),
    content,
  });
}

function hostBlockCapability(nodeType: string, title: string): BlockCapability {
  const createNode = () =>
    Node.create({
      name: nodeType,
      group: "block",
      atom: true,
    });

  return {
    definition: {
      nodeType,
      insert: {
        id: nodeType.replaceAll("_", "-"),
        title,
        description: `Insert ${title}`,
        icon: CircleIcon,
        category: "content",
        content: () => ({ type: nodeType }),
      },
    },
    authoringExtension: createNode(),
    runtimeExtension: createNode(),
  };
}

function hostLayoutCapability(id: string, title: string): LayoutCapability {
  return {
    definition: {
      id,
      title,
      description: `Insert ${title}`,
      icon: CircleIcon,
      createContent: () => ({
        type: "layout",
        attrs: { id: `${id}-instance`, variant: id },
        content: [
          {
            type: "section",
            attrs: { id: `${id}-section` },
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    },
    authoringView: { id, layout: HostLayoutView },
    runtimeView: { id, component: HostLayoutView },
  };
}

function HostLayoutView() {
  return null;
}

function hostSurfaceCapability(id: string): SurfaceCapability {
  return {
    definition: {
      id,
      modes: ["slideshow"],
      title: "Private Plus Surface",
      description: "A private Surface installed only in the Plus editor.",
      catalogue: {
        section: "content",
        order: 9_999,
        preview: { kind: "slot", role: "content" },
      },
      structurePolicy: {
        fixedChildren: [{ type: "paragraph" }],
        allowRootInsertion: false,
      },
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: id, settings: {} },
        content: [{ type: "paragraph" }],
      }),
    },
    authoringView: { variantId: id, component: HostSurfaceView },
    runtimeView: { variantId: id, component: HostSurfaceView },
  };
}

function HostSurfaceView() {
  return null;
}

function openSurfaceTemplatePicker(editor: Editor, afterSurfaceId: string): void {
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
        type: "open-template-picker",
        afterSurfaceId,
      }),
    );
  });
}

function readSurfaceVariants(documentJSON: JSONContent): unknown[] {
  return (documentJSON.content?.[0]?.content ?? []).map((surface) => surface.attrs?.["variant"]);
}

function createSlideshowDocumentJSON({
  regionId,
  surfaceId,
  text,
}: {
  regionId: string;
  surfaceId: string;
  text: string;
}): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected slide content surface to include its main region.");

  region.attrs = { ...region.attrs, id: regionId };
  region.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ];

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
        },
        content: [surface],
      },
    ],
  };
}

function findParagraphTextPosition(editor: Editor, text: string): number {
  let textPosition: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return true;
    if (!node.textContent.includes(text)) return true;

    textPosition = pos + 1;
    return false;
  });

  if (textPosition === null) {
    throw new Error(`Expected paragraph containing "${text}".`);
  }

  return textPosition;
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

  if (found === null) throw new Error(`Expected ${type}${id ? `:${id}` : ""}.`);
  return found;
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

async function waitUntil<T>(assertion: () => T, timeoutMs = 1000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      return assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Timed out waiting for condition.");
}
