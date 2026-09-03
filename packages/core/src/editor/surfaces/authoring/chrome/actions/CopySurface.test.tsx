// @vitest-environment happy-dom

import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { createStructuralClipboardPolicy } from "@/document/authoring/structural-clipboard-policy";
import type { StructuralFragmentCarrierLimits } from "@/document/authoring/structural-clipboard";
import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { SCAFFOLD_STRUCTURAL_FRAGMENT_MIME } from "@/document/authoring/structural-clipboard";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { defineBlock } from "@/editor/blocks/block-definition";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { CopySurface } from "./CopySurface";

const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});
const TestBlockNode = Node.create({
  name: "test_block",
  group: "block",
  content: "paragraph+",
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
});
const testBlockDefinition = defineBlock({ nodeType: "test_block", title: "Test block" });
const UnavailableBlockNode = Node.create({
  name: "unavailable_block",
  group: "block",
  atom: true,
  addAttributes: () => ({ capabilityId: { default: null }, original: { default: null } }),
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
});
const pageSurfaceDefinition = {
  id: "test-page",
  modes: ["page"] as const,
  defaultForModes: ["page"] as const,
  title: "Test page",
  description: "Test page",
  createSurface: ({ surfaceId }: { surfaceId: string }) => ({
    type: "surface",
    attrs: { id: surfaceId, settings: {}, variant: "test-page" },
    content: [],
  }),
};
const slideshowSurfaceDefinition = {
  id: "test-slide",
  modes: ["slideshow"] as const,
  defaultForModes: ["slideshow"] as const,
  title: "Test slide",
  description: "Test slide",
  createSurface: ({ surfaceId }: { surfaceId: string }) => ({
    type: "surface",
    attrs: { id: surfaceId, settings: {}, variant: "test-slide" },
    content: [],
  }),
};
const carrierLimits: StructuralFragmentCarrierLimits = {
  maxCarrierBytes: 128_000,
  fragmentDecodeLimits: {
    maxEncodedBytes: 64_000,
    maxNestingDepth: 32,
    maxVisitedValues: 4_000,
    maxArrayLength: 1_000,
    maxObjectPropertyCount: 100,
    maxStringBytes: 32_000,
  },
};

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.view.dom.remove();
    editor.destroy();
  }
  Reflect.deleteProperty(document, "execCommand");
});

describe("CopySurface", () => {
  it("enables copying an addressed mounted Surface in slideshow mode", () => {
    const editor = createEditor("slideshow");

    renderAction(editor);

    expect(screen.getByRole("button", { name: "Copy slide" })).toHaveProperty("disabled", false);
  });

  it("disables copying a Surface in page mode", () => {
    const editor = createEditor("page");

    renderAction(editor);

    expect(screen.getByRole("button", { name: "Copy slide" })).toHaveProperty("disabled", true);
  });

  it("copies the addressed Surface with unchanged JSON and IDs during the click gesture", () => {
    const editor = createEditor("slideshow");
    setCursorInside(editor, "paragraph001");
    const before = editor.getJSON();
    const clipboard = installSynchronousCopyEvent(editor);
    const dispatch = vi.spyOn(editor.view, "dispatch");
    renderAction(editor);

    fireEvent.click(screen.getByRole("button", { name: "Copy slide" }));

    expect(clipboard.execCommand).toHaveBeenCalledOnce();
    expect(clipboard.execCommand).toHaveBeenCalledWith("copy");
    expect(clipboard.downstreamCopyHandler).not.toHaveBeenCalled();
    const envelope = JSON.parse(clipboard.written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME] ?? "null");
    expect(envelope).toMatchObject({
      rootKind: "surface",
      content: {
        type: "surface",
        attrs: { id: "surface00001", variant: "test-slide" },
        content: [
          {
            type: "test_block",
            attrs: { id: "nestedblock1" },
            content: [{ attrs: { id: "paragraph001" } }],
          },
        ],
      },
    });
    expect(clipboard.event?.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0]?.[0].docChanged).toBe(false);
    expect(clipboard.written["text/plain"]).toBe("Surface: Test slide");
    expect(clipboard.written["text/plain"]).not.toContain('{"');
    expect(editor.getJSON()).toEqual(before);
  });

  it("refuses to copy a Surface containing unavailable compatibility content", () => {
    const editor = createEditor("slideshow", true);
    const before = editor.getJSON();
    const clipboard = installSynchronousCopyEvent(editor);
    renderAction(editor);
    const button = screen.getByRole("button", { name: "Copy slide" });

    expect(button).toHaveProperty("disabled", false);
    fireEvent.click(button);

    expect(clipboard.execCommand).not.toHaveBeenCalled();
    expect(clipboard.written).toEqual({});
    expect(editor.getJSON()).toEqual(before);
  });
});

function renderAction(editor: Editor) {
  return render(
    <TooltipProvider>
      <CopySurface editor={editor} label="Copy slide" surfaceId="surface00001" />
    </TooltipProvider>,
  );
}

function createEditor(mode: "page" | "slideshow", unavailable = false): Editor {
  const capabilities = resolveScaffoldCapabilities({
    blockCapabilities: [{ definition: testBlockDefinition }],
    layoutDefinitions: [],
    surfaceDefinitions: [pageSurfaceDefinition, slideshowSurfaceDefinition],
  });
  const editor = new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(capabilities),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      TestArrangementNode,
      TestBlockNode,
      UnavailableBlockNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createStructuralClipboardPolicy({
        blockDefinitions: capabilities.blocks.registry,
        identityRewrites: capabilities.contentIdentity.rewrites,
        carrierLimits,
        layoutDefinitions: capabilities.layouts.registry,
        surfaceVariants: capabilities.surfaces.registry,
      }),
    ],
    content: courseDocumentJson(mode, unavailable),
  });
  document.body.append(editor.view.dom);
  editors.push(editor);
  return editor;
}

function courseDocumentJson(mode: "page" | "slideshow", unavailable: boolean): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode },
        content: [
          {
            type: "surface",
            attrs: {
              id: "surface00001",
              settings: {},
              variant: mode === "slideshow" ? "test-slide" : "test-page",
            },
            content: unavailable
              ? [
                  {
                    type: "unavailable_block",
                    attrs: {
                      id: "unavail-blk1",
                      capabilityId: "plus-block",
                      original: { type: "plus_block", attrs: { id: "unavail-blk1" } },
                    },
                  },
                ]
              : [
                  {
                    type: "test_block",
                    attrs: { id: "nestedblock1" },
                    content: [
                      {
                        type: "paragraph",
                        attrs: { id: "paragraph001" },
                        content: [{ type: "text", text: "Surface content" }],
                      },
                    ],
                  },
                ],
          },
        ],
      },
    ],
  };
}

function setCursorInside(editor: Editor, paragraphId: string): void {
  let paragraphPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== paragraphId) return true;
    paragraphPos = pos;
    return false;
  });
  if (paragraphPos === null) throw new Error(`Missing paragraph ${paragraphId}`);
  editor.commands.setTextSelection(paragraphPos + 1);
}

function installSynchronousCopyEvent(editor: Editor): {
  readonly execCommand: ReturnType<typeof vi.fn>;
  readonly downstreamCopyHandler: ReturnType<typeof vi.fn>;
  readonly written: Record<string, string>;
  event: Event | null;
} {
  const result = {
    execCommand: vi.fn(),
    downstreamCopyHandler: vi.fn(),
    written: {} as Record<string, string>,
    event: null as Event | null,
  };
  result.execCommand.mockImplementation((command: string) => {
    if (command !== "copy") return false;
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        clearData: () => {
          for (const key of Object.keys(result.written)) delete result.written[key];
        },
        getData: (format: string) => result.written[format] ?? "",
        setData: (format: string, value: string) => {
          result.written[format] = value;
        },
        get types() {
          return Object.keys(result.written);
        },
      },
    });
    result.event = event;
    editor.view.dom.dispatchEvent(event);
    return true;
  });
  Object.defineProperty(editor.view.dom.ownerDocument, "execCommand", {
    configurable: true,
    value: result.execCommand,
  });
  editor.view.dom.addEventListener("copy", result.downstreamCopyHandler);
  return result;
}
