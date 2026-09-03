import { CircleIcon } from "@phosphor-icons/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { userEvent } from "vite-plus/test/browser/context";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS } from "@/composition/authoring/create-authoring-composition";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import {
  AUTHORING_FRAME_EDITABLE_ATTR,
  authoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";

import {
  SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE,
  SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_VALUE,
  SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE,
  readStructuralFragmentClipboard,
  writeStructuralFragmentClipboard,
} from "./structural-clipboard/structural-fragment-carrier";
import {
  SCAFFOLD_STRUCTURAL_FRAGMENT_MIME,
  decodeStructuralFragment,
  encodeStructuralFragment,
  type StructuralFragmentContent,
  type StructuralFragmentDecodeLimits,
} from "./structural-clipboard/structural-fragment-codec";
import { createStructuralClipboardPolicy } from "./structural-clipboard-policy";

const CoreBlockNode = clipboardNode("core_block", "div[data-core-block]");
const ContributedBlockNode = clipboardNode("contributed_block", "div[data-contributed-block]");
const UnavailableBlockNode = clipboardNode("unavailable_block", "div[data-unavailable-block]");
const LayoutNode = Node.create({
  name: "layout",
  group: "block",
  content: "block+",
  addAttributes: () => ({ variant: { default: null } }),
  renderHTML: ({ HTMLAttributes }) => ["section", HTMLAttributes, 0],
});
const CourseDocumentNode = Node.create({
  name: "courseDocument",
  group: "block",
  content: "surface+",
  addAttributes: () => ({ mode: { default: "page" } }),
  renderHTML: ({ HTMLAttributes }) => ["main", HTMLAttributes, 0],
});
const SurfaceNode = Node.create({
  name: "surface",
  group: "block",
  content: "block+",
  selectable: false,
  addAttributes: () => ({
    settings: { default: {} },
    variant: { default: null },
  }),
  renderHTML: ({ HTMLAttributes }) => ["article", HTMLAttributes, 0],
});

const coreDefinition = defineBlock({ nodeType: "core_block", title: "Core block" });
const contributedDefinition = defineBlock({
  nodeType: "contributed_block",
  title: "Contributed block",
});
const layoutDefinitions = createLayoutRegistry([
  {
    id: "core-layout",
    title: "Core layout",
    description: "Core layout",
    icon: CircleIcon,
    createContent: () => ({ type: "layout", attrs: { variant: "core-layout" } }),
  },
]);
const surfaceVariants = createSurfaceVariantRegistry([
  {
    id: "page-surface",
    modes: ["page"],
    defaultForModes: ["page"],
    title: "Page surface",
    description: "Page surface",
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, settings: {}, variant: "page-surface" },
      content: [{ type: "paragraph" }],
    }),
  },
]);
const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  delete (window as { __scaffoldClipboardScriptExecuted?: boolean })
    .__scaffoldClipboardScriptExecuted;
  vi.restoreAllMocks();
});

describe("structural clipboard in a real browser", () => {
  it("copies and pastes the nearest mounted Block without chrome state through the system shortcut lifecycle", async () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({ generateID });
    setTextCaret(editor, "para-alpha-a");
    editor.view.focus();
    const setClipboardData = vi.spyOn(DataTransfer.prototype, "setData");

    await userEvent.copy();

    expect(setClipboardData.mock.calls).toContainEqual(["text/plain", "Block: Core block"]);

    const pastedTypes: string[] = [];
    document.addEventListener(
      "paste",
      (event) => {
        pastedTypes.push(...Array.from((event as ClipboardEvent).clipboardData?.types ?? []));
      },
      { capture: true, once: true },
    );
    setTextCaret(editor, "para-bravo-b");
    editor.view.focus();
    generateID.mockClear();
    const beforeCount = editor.state.doc.childCount;

    await userEvent.paste();

    expect(editor.state.doc.childCount).toBe(beforeCount + 1);
    expect(pastedTypes).toContain("text/html");
    expect(generateID).not.toHaveBeenCalled();
    const inserted = nodeAfter(editor, "core-block-b");
    expect(inserted?.type.name).toBe("core_block");
    expect(inserted?.attrs["id"]).not.toBe("core-block-a");
    expect(idsInJson(inserted?.toJSON() ?? {})).not.toContain("para-alpha-a");
  });

  it("captures structural Copy and Paste before an isolated NodeView DOM event", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({ generateID });
    selectNode(editor, "core-block-a");
    const sourceEditable = editableFrameFor(editor, "core-block-a");
    sourceEditable.addEventListener("copy", (event) => event.stopPropagation(), { once: true });
    const clipboard = new DataTransfer();
    const copyEvent = new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    });

    sourceEditable.dispatchEvent(copyEvent);

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(clipboard.getData("text/plain")).toBe("Block: Core block");
    expect(clipboard.types).toContain(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME);

    selectNode(editor, "core-block-b");
    const destinationEditable = editableFrameFor(editor, "core-block-b");
    destinationEditable.addEventListener("paste", (event) => event.stopPropagation(), {
      once: true,
    });
    generateID.mockClear();
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    });

    destinationEditable.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(nodeAfter(editor, "core-block-b")?.type.name).toBe("core_block");
    expect(generateID).not.toHaveBeenCalled();
  });

  it("copies an active Block and pastes it at the exact empty Surface insertion row", async () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({
      generateID,
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { id: "course-doc01", mode: "page" },
            content: [
              {
                type: "surface",
                attrs: { id: "surface00001", settings: {}, variant: "page-surface" },
                content: [
                  block("core_block", "core-block-a", "para-alpha-a", "Alpha text"),
                  { type: "paragraph", attrs: { id: "empty-row001" } },
                ],
              },
            ],
          },
        ],
      },
    });
    activateBlockWithTextCaret(editor, "core-block-a", "para-alpha-a");
    editor.view.focus();

    await userEvent.copy();

    const emptyRowPos = nodePosition(editor, "empty-row001");
    const emptyRow = editor.view.nodeDOM(emptyRowPos);
    if (!(emptyRow instanceof HTMLElement)) throw new Error("Missing empty insertion row");
    emptyRow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, emptyRowPos + 1)),
    );
    editor.view.focus();
    generateID.mockClear();

    await userEvent.paste();

    const destinationSurface = editor.state.doc.firstChild?.firstChild;
    const copiedBlocks: JSONContent[] = [];
    destinationSurface?.forEach((child) => {
      if (child.type.name === "core_block") copiedBlocks.push(child.toJSON());
    });
    expect(copiedBlocks).toHaveLength(2);
    expect(copiedBlocks[1]?.attrs?.["id"]).not.toBe("core-block-a");
    expect(idsInJson(copiedBlocks[1] ?? {})).not.toContain("para-alpha-a");
    expect(generateID).not.toHaveBeenCalled();
  });

  it("copies a mounted Block and pastes it after the list containing the empty caret", async () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({
      generateID,
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { id: "course-doc01", mode: "page" },
            content: [
              {
                type: "surface",
                attrs: { id: "surface00001", settings: {}, variant: "page-surface" },
                content: [
                  block("core_block", "core-block-a", "para-alpha-a", "Alpha text"),
                  {
                    type: "bulletList",
                    attrs: { id: "list-root001" },
                    content: [
                      {
                        type: "listItem",
                        attrs: { id: "list-item001" },
                        content: [{ type: "paragraph", attrs: { id: "target-par01" } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    setTextCaret(editor, "para-alpha-a");
    editor.view.focus();

    await userEvent.copy();

    setTextCaret(editor, "target-par01");
    editor.view.focus();
    generateID.mockClear();

    await userEvent.paste();

    const destinationSurface = editor.state.doc.firstChild?.firstChild;
    expect(destinationSurface?.childCount).toBe(3);
    expect(destinationSurface?.child(1).type.name).toBe("bulletList");
    expect(destinationSurface?.child(2).type.name).toBe("core_block");
    expect(destinationSurface?.child(2).attrs["id"]).not.toBe("core-block-a");
    expect(generateID).not.toHaveBeenCalled();
  });

  it.each([
    ["custom MIME", false],
    ["mandatory inert HTML after custom MIME is stripped", true],
  ] as const)("pastes through %s with one clone and no UniqueID remap", (_label, stripCustom) => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({ generateID });
    const clipboard = new DataTransfer();
    const encodedFragment = encodedCoreBlock();
    writeStructuralFragmentClipboard(
      clipboard,
      {
        encodedFragment,
        readableText: "Block: Core block",
      },
      AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS,
    );
    if (stripCustom) clipboard.clearData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME);
    selectNode(editor, "core-block-b");
    generateID.mockClear();

    const event = dispatchPaste(editor, clipboard);

    expect(event.defaultPrevented).toBe(true);
    expect(nodeAfter(editor, "core-block-b")?.type.name).toBe("core_block");
    expect(generateID).not.toHaveBeenCalled();
    expect(clipboard.getData("text/plain")).toBe("Block: Core block");
    expect(clipboard.getData("text/plain")).not.toContain(encodedFragment);
    expect(clipboard.getData("text/html")).not.toContain(encodedFragment);
  });

  it("leaves ordinary rich-text copy, paste and identity maintenance to Tiptap", async () => {
    const editor = makeEditor();
    const alpha = textRange(editor, "Alpha text", 0, 5);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, alpha.from, alpha.to)),
    );
    editor.view.focus();

    await userEvent.copy();

    const target = textRange(editor, "Target", 6, 6);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target.from, target.to)),
    );
    editor.view.focus();
    const beforeCount = editor.state.doc.childCount;

    await userEvent.paste();

    expect(editor.state.doc.childCount).toBe(beforeCount);
    expect(editor.state.doc.textContent).toContain("TargetAlpha");
  });

  it("treats hostile HTML as detached data and never as live structural truth", () => {
    const clipboard = new DataTransfer();
    writeStructuralFragmentClipboard(
      clipboard,
      {
        encodedFragment: encodedCoreBlock(),
        readableText: '<img src=x onerror="window.__scaffoldClipboardScriptExecuted=true">',
      },
      AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS,
    );
    clipboard.clearData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME);
    clipboard.setData(
      "text/html",
      `<script id="hostile-clipboard-script">window.__scaffoldClipboardScriptExecuted=true</script>${clipboard.getData("text/html")}<div id="hostile-clipboard-visible" onclick="window.__scaffoldClipboardScriptExecuted=true">visible</div>`,
    );

    expect(
      readStructuralFragmentClipboard(clipboard, AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS),
    ).toMatchObject({ status: "ok" });
    expect(
      (window as { __scaffoldClipboardScriptExecuted?: boolean }).__scaffoldClipboardScriptExecuted,
    ).toBeUndefined();
    expect(document.querySelector("#hostile-clipboard-script")).toBeNull();
    expect(document.querySelector("#hostile-clipboard-visible")).toBeNull();
  });

  it.each([
    ["malformed Base64", markerClipboard("%%%"), "malformed_base64"],
    ["invalid UTF-8", markerClipboard("/w=="), "invalid_payload_utf8"],
    ["duplicate marker", duplicateMarkerClipboard(), "duplicate_html_marker"],
    ["version skew", versionSkewClipboard(), "unsupported_protocol_version"],
  ] as const)("silently classifies %s as invalid", (_label, clipboard, reason) => {
    expect(
      readStructuralFragmentClipboard(clipboard, AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS),
    ).toEqual({ status: "invalid", reason });
  });

  it("gives malformed custom MIME precedence over a valid HTML fallback", () => {
    const clipboard = new DataTransfer();
    writeStructuralFragmentClipboard(
      clipboard,
      {
        encodedFragment: encodedCoreBlock(),
        readableText: "Block: Core block",
      },
      AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS,
    );
    clipboard.setData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME, "{");

    expect(
      readStructuralFragmentClipboard(clipboard, AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS),
    ).toEqual({ status: "invalid", reason: "malformed_json" });
  });

  it.each([
    ["an unavailable nested compatibility item", unavailableLayoutFragment(), undefined],
    [
      "a failed mounted-owner clone",
      contributedFragment(),
      () => {
        throw new Error("owner repair failed");
      },
    ],
  ] as const)("refuses %s atomically", (_label, encodedFragment, identityRewrite) => {
    const editor = makeEditor({ identityRewrite });
    selectNode(editor, "core-block-b");
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const clipboard = new DataTransfer();
    clipboard.setData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME, encodedFragment);

    const event = dispatchPaste(editor, clipboard);

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses failed placement before cloning or mutation", () => {
    const identityRewrite = vi.fn();
    const editor = makeEditor({ identityRewrite });
    const destination = textRange(editor, "Target", 0, 6);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, destination.from, destination.to),
      ),
    );
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const clipboard = new DataTransfer();
    clipboard.setData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME, encodedCoreBlock());

    const event = dispatchPaste(editor, clipboard);

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
    expect(identityRewrite).not.toHaveBeenCalled();
  });
});

describe("qualified production structural clipboard limits in a real browser", () => {
  const carrierLimits = AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS;
  const fragmentLimits = carrierLimits.fragmentDecodeLimits;

  it("accepts the exact one-megabyte fragment and rejects the next byte", () => {
    const exact = encodedAtByteLength(fragmentLimits.maxEncodedBytes);
    const over = `${exact.slice(0, -2)}a"}`;

    expect(utf8Bytes(exact)).toBe(fragmentLimits.maxEncodedBytes);
    expect(utf8Bytes(over)).toBe(fragmentLimits.maxEncodedBytes + 1);
    expect(decodeStructuralFragment(exact, fragmentLimits)).toMatchObject({ status: "ok" });
    expect(decodeStructuralFragment(over, fragmentLimits)).toEqual({
      status: "invalid",
      reason: "encoded_bytes_exceeded",
    });

    const clipboard = new DataTransfer();
    writeStructuralFragmentClipboard(
      clipboard,
      {
        encodedFragment: exact,
        readableText: "Block: maximum supported fragment",
      },
      carrierLimits,
    );
    clipboard.clearData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME);
    expect(utf8Bytes(clipboard.getData("text/html"))).toBeLessThan(carrierLimits.maxCarrierBytes);
    expect(readStructuralFragmentClipboard(clipboard, carrierLimits)).toMatchObject({
      status: "ok",
    });
  });

  it("applies the exact carrier byte gate before detached HTML parsing", () => {
    const clipboard = new DataTransfer();
    const exactHtml = `<p>${"a".repeat(carrierLimits.maxCarrierBytes - 7)}</p>`;
    clipboard.setData("text/html", exactHtml);

    expect(utf8Bytes(exactHtml)).toBe(carrierLimits.maxCarrierBytes);
    expect(readStructuralFragmentClipboard(clipboard, carrierLimits)).toEqual({
      status: "absent",
    });

    clipboard.setData("text/html", `${exactHtml}a`);
    expect(readStructuralFragmentClipboard(clipboard, carrierLimits)).toEqual({
      status: "invalid",
      reason: "carrier_bytes_exceeded",
    });
  });

  it("accepts and rejects immediately around the configured depth and value limits", () => {
    const exactDepth = encodedWithMaximumDepth(fragmentLimits.maxNestingDepth);
    const overDepth = encodedWithMaximumDepth(fragmentLimits.maxNestingDepth + 1);
    expect(decodeStructuralFragment(exactDepth, fragmentLimits)).toMatchObject({ status: "ok" });
    expect(decodeStructuralFragment(overDepth, fragmentLimits)).toEqual({
      status: "invalid",
      reason: "nesting_depth_exceeded",
    });

    const emptyValues = encodeStructuralFragment({
      rootKind: "block",
      content: { type: "example_block", values: [] },
    });
    const fixedValues = countVisitedValues(JSON.parse(emptyValues));
    const exactValues = encodeStructuralFragment({
      rootKind: "block",
      content: {
        type: "example_block",
        values: new Array(fragmentLimits.maxVisitedValues - fixedValues).fill(null),
      },
    });
    const overValues = exactValues.replace("]}", ",null]}");

    expect(countVisitedValues(JSON.parse(exactValues))).toBe(fragmentLimits.maxVisitedValues);
    expect(decodeStructuralFragment(exactValues, fragmentLimits)).toMatchObject({ status: "ok" });
    expect(decodeStructuralFragment(overValues, fragmentLimits)).toEqual({
      status: "invalid",
      reason: "visited_values_exceeded",
    });
  });

  it("enforces the configured array, object and UTF-8 string boundaries", () => {
    const collectionLimits: StructuralFragmentDecodeLimits = {
      ...fragmentLimits,
      maxEncodedBytes: 5_000_000,
      maxVisitedValues: 250_000,
    };
    const exactArray = encodeStructuralFragment({
      rootKind: "block",
      content: {
        type: "example_block",
        values: new Array(fragmentLimits.maxArrayLength).fill(null),
      },
    });
    const overArray = exactArray.replace("]}", ",null]}");
    expect(decodeStructuralFragment(exactArray, collectionLimits)).toMatchObject({ status: "ok" });
    expect(decodeStructuralFragment(overArray, collectionLimits)).toEqual({
      status: "invalid",
      reason: "array_length_exceeded",
    });

    const content: Record<string, null | string> = { type: "example_block" };
    for (let index = 1; index < fragmentLimits.maxObjectPropertyCount; index += 1) {
      content[`p${index}`] = null;
    }
    const exactObject = encodeStructuralFragment({
      rootKind: "block",
      content: content as StructuralFragmentContent,
    });
    expect(decodeStructuralFragment(exactObject, collectionLimits)).toMatchObject({ status: "ok" });
    content[`p${fragmentLimits.maxObjectPropertyCount}`] = null;
    expect(
      decodeStructuralFragment(
        encodeStructuralFragment({
          rootKind: "block",
          content: content as StructuralFragmentContent,
        }),
        collectionLimits,
      ),
    ).toEqual({ status: "invalid", reason: "object_property_count_exceeded" });

    const exactString = encodeStructuralFragment({
      rootKind: "block",
      content: { type: "a".repeat(fragmentLimits.maxStringBytes) },
    });
    const overString = encodeStructuralFragment({
      rootKind: "block",
      content: { type: "a".repeat(fragmentLimits.maxStringBytes + 1) },
    });
    expect(decodeStructuralFragment(exactString, fragmentLimits)).toMatchObject({ status: "ok" });
    expect(decodeStructuralFragment(overString, fragmentLimits)).toEqual({
      status: "invalid",
      reason: "string_bytes_exceeded",
    });
  });
});

function makeEditor(
  input: {
    readonly content?: JSONContent;
    readonly identityRewrite?: (() => JSONContent) | undefined;
    readonly generateID?: (() => string) | undefined;
  } = {},
): Editor {
  const capabilities = resolveScaffoldCapabilities({
    blockCapabilities: [
      { definition: coreDefinition },
      {
        definition: contributedDefinition,
        ...(input.identityRewrite
          ? {
              identityRewrites: [
                { nodeType: contributedDefinition.nodeType, rewrite: input.identityRewrite },
              ],
            }
          : {}),
      },
    ],
    layoutDefinitions: layoutDefinitions.definitions,
    surfaceDefinitions: surfaceVariants.definitions,
  });
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [
      createScaffoldCapabilitiesStorageExtension(capabilities),
      StarterKit.configure({ undoRedo: false }),
      CoreBlockNode,
      ContributedBlockNode,
      UnavailableBlockNode,
      LayoutNode,
      CourseDocumentNode,
      SurfaceNode,
      UniqueID.configure({
        attributeName: "id",
        types: "all",
        generateID: input.generateID ?? (() => createEmbeddedNodeId()),
      }),
      createScaffoldInteractionOwnerExtension(capabilities.blocks.registry),
      createStructuralClipboardPolicy({
        blockDefinitions: capabilities.blocks.registry,
        identityRewrites: capabilities.contentIdentity.rewrites,
        carrierLimits: AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS,
        layoutDefinitions: capabilities.layouts.registry,
        surfaceVariants: capabilities.surfaces.registry,
      }),
    ],
    content: input.content ?? {
      type: "doc",
      content: [
        block("core_block", "core-block-a", "para-alpha-a", "Alpha text"),
        block("core_block", "core-block-b", "para-bravo-b", "Bravo text"),
        {
          type: "paragraph",
          attrs: { id: "paste-target" },
          content: [{ type: "text", text: "Target" }],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function clipboardNode(name: string, tag: string) {
  return Node.create({
    name,
    group: "block",
    content: "paragraph+",
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes, node }) => [
      tag.slice(0, tag.indexOf("[")),
      {
        ...HTMLAttributes,
        ...authoringFrameAttributes({
          frameKind: "block",
          id: node.attrs["id"],
          nodeType: name,
        }),
      },
      ["div", { [AUTHORING_FRAME_EDITABLE_ATTR]: "" }, 0],
    ],
  });
}

function block(type: string, id: string, paragraphId: string, text: string): JSONContent {
  return {
    type,
    attrs: { id },
    content: [
      {
        type: "paragraph",
        attrs: { id: paragraphId },
        content: [{ type: "text", text }],
      },
    ],
  };
}

function encodedCoreBlock(): string {
  return encodeStructuralFragment({
    rootKind: "block",
    content: block(
      "core_block",
      "source-blk01",
      "source-par01",
      "Copied block",
    ) as StructuralFragmentContent,
  });
}

function contributedFragment(): string {
  return encodeStructuralFragment({
    rootKind: "block",
    content: block(
      "contributed_block",
      "source-blk01",
      "source-par01",
      "Contributed block",
    ) as StructuralFragmentContent,
  });
}

function unavailableLayoutFragment(): string {
  return encodeStructuralFragment({
    rootKind: "layout",
    content: {
      type: "layout",
      attrs: { id: "source-lay01", variant: "core-layout" },
      content: [block("unavailable_block", "source-blk01", "source-par01", "Unavailable")],
    } as StructuralFragmentContent,
  });
}

function dispatchPaste(editor: Editor, clipboardData: DataTransfer): ClipboardEvent {
  const event = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData,
  });
  editor.view.dom.dispatchEvent(event);
  return event;
}

function selectNode(editor: Editor, id: string): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePosition(editor, id))),
  );
}

function editableFrameFor(editor: Editor, id: string): HTMLElement {
  const frame = editor.view.dom.querySelector(`[data-authoring-frame][data-id="${id}"]`);
  const editable = frame?.querySelector(`[${AUTHORING_FRAME_EDITABLE_ATTR}]`);
  if (!(editable instanceof HTMLElement)) throw new Error(`Missing editable frame for ${id}`);
  return editable;
}

function activateBlockWithTextCaret(editor: Editor, blockId: string, paragraphId: string): void {
  const frame = editor.view.dom.querySelector(`[data-authoring-frame][data-id="${blockId}"]`);
  const editable = frame?.querySelector(`[${AUTHORING_FRAME_EDITABLE_ATTR}]`);
  if (!editable) throw new Error(`Missing editable frame for ${blockId}`);

  editable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  setTextCaret(editor, paragraphId);
}

function setTextCaret(editor: Editor, paragraphId: string): void {
  const paragraphPos = nodePosition(editor, paragraphId);
  const paragraph = editor.state.doc.nodeAt(paragraphPos);
  if (!paragraph) throw new Error(`Missing paragraph ${paragraphId}`);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, paragraphPos + paragraph.nodeSize - 1),
    ),
  );

  expect(editor.state.selection).toBeInstanceOf(TextSelection);
  expect(editor.state.selection.empty).toBe(true);
}

function nodePosition(editor: Editor, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Missing node ${id}`);
  return found;
}

function nodeAfter(editor: Editor, id: string) {
  for (let index = 0; index < editor.state.doc.childCount - 1; index += 1) {
    if (editor.state.doc.child(index).attrs["id"] === id) {
      return editor.state.doc.child(index + 1);
    }
  }
  return null;
}

function idsInJson(content: JSONContent): string[] {
  const ids: string[] = [];
  const pending = [content];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const id = current.attrs?.["id"];
    if (typeof id === "string") ids.push(id);
    for (const child of current.content ?? []) pending.push(child);
  }
  return ids;
}

function textRange(editor: Editor, text: string, fromOffset: number, toOffset: number) {
  const range = { from: -1, to: -1 };
  let found = false;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || node.text !== text) return true;
    range.from = pos + fromOffset;
    range.to = pos + toOffset;
    found = true;
    return false;
  });
  if (!found) throw new Error(`Missing text ${text}`);
  return range;
}

function markerClipboard(payload: string): DataTransfer {
  const clipboard = new DataTransfer();
  clipboard.setData("text/html", markerHtml(payload));
  return clipboard;
}

function duplicateMarkerClipboard(): DataTransfer {
  const clipboard = markerClipboard(btoa(encodedCoreBlock()));
  const html = clipboard.getData("text/html");
  clipboard.setData("text/html", `${html}${html}`);
  return clipboard;
}

function versionSkewClipboard(): DataTransfer {
  const clipboard = new DataTransfer();
  const envelope = JSON.parse(encodedCoreBlock()) as Record<string, unknown>;
  envelope["version"] = 2;
  clipboard.setData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME, JSON.stringify(envelope));
  return clipboard;
}

function markerHtml(payload: string): string {
  return `<template ${SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE}="${SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_VALUE}" ${SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE}="${payload}"></template><p>Readable fallback</p>`;
}

function encodedAtByteLength(targetBytes: number): string {
  const chunks = new Array(10).fill("a".repeat(90_000)) as string[];
  const input = {
    rootKind: "block" as const,
    content: { type: "example_block", chunks, tail: "" },
  };
  const base = encodeStructuralFragment(input);
  const remaining = targetBytes - utf8Bytes(base);
  if (remaining < 0 || remaining > 100_000) {
    throw new Error(`Cannot construct ${targetBytes} bytes within the configured string bound`);
  }
  input.content.tail = "b".repeat(remaining);
  return encodeStructuralFragment(input);
}

function encodedWithMaximumDepth(targetDepth: number): string {
  let content: StructuralFragmentContent = { type: "example_block", nested: "leaf" };
  while (
    maximumDepth(JSON.parse(encodeStructuralFragment({ rootKind: "block", content }))) < targetDepth
  ) {
    content = { type: "example_block", nested: content };
  }
  return encodeStructuralFragment({ rootKind: "block", content });
}

function maximumDepth(root: unknown): number {
  let maximum = 0;
  const pending = [{ value: root, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    maximum = Math.max(maximum, current.depth);
    if (current.value === null || typeof current.value !== "object") continue;
    for (const child of Object.values(current.value)) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return maximum;
}

function countVisitedValues(root: unknown): number {
  let count = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    count += 1;
    if (current === null || typeof current !== "object") continue;
    for (const child of Object.values(current)) pending.push(child);
  }
  return count;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
