// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import {
  AUTHORING_FRAME_ATTR,
  authoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import {
  authoringInteractionRootAttributes,
  resolveAuthoringInteractionRoot,
} from "@/editor/interactions/dom/authoring-root";
import { registerOverlayHostOwner } from "@/editor/interactions/dom/overlay-ownership";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  findInteractionFacadeStoreForEditor,
  getInteractionFacadeStoreForEditor,
  type ScaffoldInteractionOwnerStorage,
} from "./facade/interaction-facade-storage";
import {
  InteractionChromeSlotReason,
  type InteractionTargetRef,
} from "../model/interaction-owner-state";
import {
  EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
  interactionOwnerPluginKey,
  setInteractionOwnerCommandMeta,
} from "./state/interaction-owner-plugin-state";
import { InteractionOwnerCommandKind } from "./state/interaction-owner-command-model";
import { createScaffoldInteractionOwnerExtension } from "./interaction-owner-extension";

const BLOCK = "v2_owner_extension_block";
const reactMountedEditors = new Set<Editor>();

const testBlockRegistry = createBlockRegistry([defineBlock({ nodeType: BLOCK })]);

const TestBlockNode = Node.create({
  name: BLOCK,
  group: "block",
  content: "paragraph+",
  defining: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "section[data-v2-owner-extension-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      {
        ...HTMLAttributes,
        ...authoringFrameAttributes({
          frameKind: "block",
          id: node.attrs["id"],
          nodeType: BLOCK,
        }),
        "data-v2-owner-extension-block": "",
      },
      0,
    ];
  },
});

const TestCellNode = Node.create({
  name: "cell",
  group: "block",
  content: `(paragraph | ${BLOCK})+`,
  defining: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-v2-owner-extension-cell]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        ...authoringFrameAttributes({
          frameKind: "cell",
          id: node.attrs["id"],
          nodeType: "cell",
        }),
        "data-v2-owner-extension-cell": "",
      },
      0,
    ];
  },
});

function makeEditor(options: { content?: JSONContent } = {}): Editor {
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  const element = document.createElement("div");
  ownerRoot.appendChild(element);
  document.body.appendChild(ownerRoot);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestBlockNode,
      TestCellNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
    ],
    content: options.content ?? {
      type: "doc",
      content: [
        {
          type: "cell",
          attrs: { id: "cell-a" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Cell text" }],
            },
          ],
        },
        { type: "paragraph" },
      ],
    },
  });
}

function makeEditorWithoutInteractionOwner(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [StarterKit.configure({ undoRedo: false })],
  });
}

function makeReactMountedEditor(options: { content?: JSONContent } = {}): {
  editor: Editor;
  initialRoot: Element;
  ownerRoot: HTMLElement;
} {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestBlockNode,
      TestCellNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
    ],
    content: options.content ?? {
      type: "doc",
      content: [
        {
          type: "cell",
          attrs: { id: "cell-a" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Cell text" }],
            },
          ],
        },
        { type: "paragraph" },
      ],
    },
  });
  reactMountedEditors.add(editor);
  const initialRoot = resolveAuthoringInteractionRoot(editor.view.dom);
  const rendered = render(
    createElement(
      "div",
      authoringInteractionRootAttributes(),
      createElement(EditorContent, { editor }),
    ),
  );
  const ownerRoot = rendered.container.querySelector<HTMLElement>(
    "[data-authoring-interaction-root]",
  );
  if (!ownerRoot) throw new Error("missing mounted authoring interaction root");

  return { editor, initialRoot, ownerRoot };
}

function editorFacade(editor: Editor) {
  return getInteractionFacadeStoreForEditor(editor);
}

afterEach(() => {
  for (const editor of reactMountedEditors) {
    if (!editor.isDestroyed) editor.destroy();
  }
  reactMountedEditors.clear();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const CELL_REF: InteractionTargetRef = { id: "cell-a", kind: "cell" };

function cellFrameElement(editor: Editor): Element {
  const found = editor.view.dom.querySelector(`[${AUTHORING_FRAME_ATTR}="cell"][data-id="cell-a"]`);
  if (!found) throw new Error("missing cell frame element");
  return found;
}

function blockDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "cell",
        attrs: { id: "cell-a" },
        content: [
          {
            type: BLOCK,
            attrs: { id: "block-a" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Block text" }],
              },
            ],
          },
        ],
      },
      { type: "paragraph" },
    ],
  };
}

function textPos(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText || !node.text?.includes(text)) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`missing text "${text}"`);
  return found;
}

function nodePosById(editor: Editor, id: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`missing node "${id}"`);
  return found;
}

function dispatchMouseDown(target: Element): void {
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
}

function pluginState(editor: Editor) {
  const state = interactionOwnerPluginKey.getState(editor.state);
  if (!state) throw new Error("missing interaction owner plugin state");
  return state;
}

describe("ScaffoldInteractionOwnerExtension", () => {
  it("provides one isolated editor-local facade store per installed editor", () => {
    const firstEditor = makeEditor();
    const secondEditor = makeEditor();

    const firstStore = getInteractionFacadeStoreForEditor(firstEditor);
    const firstStorage = (
      firstEditor.storage as unknown as {
        scaffoldInteractionOwner: ScaffoldInteractionOwnerStorage;
      }
    ).scaffoldInteractionOwner;

    expect(firstStore).toBe(firstStorage.facadeStore);
    expect(getInteractionFacadeStoreForEditor(firstEditor)).toBe(firstStore);
    expect(getInteractionFacadeStoreForEditor(secondEditor)).not.toBe(firstStore);

    firstEditor.destroy();
    secondEditor.destroy();
  });

  it("fails when the interaction-owner extension is not installed", () => {
    const editor = makeEditorWithoutInteractionOwner();

    expect(findInteractionFacadeStoreForEditor(editor)).toBeNull();
    expect(() => getInteractionFacadeStoreForEditor(editor)).toThrowError(
      "Scaffold interaction-owner extension is not installed for this editor",
    );

    editor.destroy();
  });

  it("installs empty interaction owner plugin state", () => {
    const editor = makeEditor();

    expect(interactionOwnerPluginKey.getState(editor.state)).toEqual(
      EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
    );

    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: CELL_REF,
      }),
    );

    expect(interactionOwnerPluginKey.getState(editor.state)?.explicitOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("installs v2 DOM activation handlers", () => {
    const editor = makeEditor();
    const plugin = editor.state.plugins.find(
      (candidate) => candidate.spec.key === interactionOwnerPluginKey,
    );

    expect(plugin).toBeDefined();
    expect(plugin?.props.handleDOMEvents?.keydown).toBeTypeOf("function");

    // Activation listens on view.dom directly (capture) so NodeView
    // stopEvent cannot swallow structural whitespace mousedowns. The
    // behavior tests below dispatch real events through that listener.
    const event = new MouseEvent("mousedown", { bubbles: true });
    cellFrameElement(editor).dispatchEvent(event);
    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("publishes active chrome after EditorContent reparents the editor", () => {
    const { editor, initialRoot, ownerRoot } = makeReactMountedEditor({ content: blockDocument() });
    const facade = editorFacade(editor);

    expect(ownerRoot).not.toBe(initialRoot);
    expect(ownerRoot.contains(editor.view.dom)).toBe(true);

    editor.view.dom.focus();
    editor.view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    editor.commands.setNodeSelection(nodePosById(editor, "block-a"));

    expect(facade.getState().snapshot.chromeSlots.movementHandle).toMatchObject({
      target: { id: "block-a", kind: "block" },
      visible: true,
    });
    editor.destroy();
  });

  it("moves owner Escape dismissal when EditorContent reparents the editor", () => {
    const { editor, ownerRoot } = makeReactMountedEditor();
    dispatchMouseDown(cellFrameElement(editor));
    expect(pluginState(editor).explicitOwner).not.toBeNull();
    const control = document.createElement("button");
    ownerRoot.append(control);

    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    control.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    editor.destroy();
  });

  it("routes owner Escape dismissal from a registered sibling overlay host", () => {
    const { editor, ownerRoot } = makeReactMountedEditor();
    dispatchMouseDown(cellFrameElement(editor));
    expect(pluginState(editor).explicitOwner).not.toBeNull();
    const host = document.createElement("div");
    const control = document.createElement("button");
    host.append(control);
    ownerRoot.parentElement?.append(host);
    const unregisterHost = registerOverlayHostOwner(ownerRoot, host);

    control.focus();
    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    control.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    expect(document.activeElement).toBe(editor.view.dom);

    unregisterHost();
    editor.destroy();
  });

  it("lets a registered-host child consume Escape before its interaction owner", () => {
    const { editor, ownerRoot } = makeReactMountedEditor();
    dispatchMouseDown(cellFrameElement(editor));
    const host = document.createElement("div");
    const childTrigger = document.createElement("button");
    const childContent = document.createElement("div");
    childContent.tabIndex = -1;
    host.append(childTrigger, childContent);
    ownerRoot.parentElement?.append(host);
    const unregisterHost = registerOverlayHostOwner(ownerRoot, host);
    let childOpen = true;
    childContent.addEventListener("keydown", (event) => {
      if (!childOpen || event.key !== "Escape") return;
      event.preventDefault();
      childOpen = false;
      childContent.remove();
      childTrigger.focus();
    });

    childContent.focus();
    const firstEscape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    childContent.dispatchEvent(firstEscape);

    expect(firstEscape.defaultPrevented).toBe(true);
    expect(pluginState(editor).explicitOwner).not.toBeNull();
    expect(document.activeElement).toBe(childTrigger);

    const secondEscape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    childTrigger.dispatchEvent(secondEscape);

    expect(secondEscape.defaultPrevented).toBe(true);
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    expect(document.activeElement).toBe(editor.view.dom);

    unregisterHost();
    editor.destroy();
  });

  it("does not route a sibling host Escape to another editor", () => {
    const first = makeReactMountedEditor();
    const second = makeReactMountedEditor();
    for (const editor of [first.editor, second.editor]) {
      editor.view.dispatch(
        setInteractionOwnerCommandMeta(editor.state.tr, {
          kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
          target: CELL_REF,
        }),
      );
    }
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    const firstControl = document.createElement("button");
    const secondControl = document.createElement("button");
    firstHost.append(firstControl);
    secondHost.append(secondControl);
    first.ownerRoot.parentElement?.append(firstHost);
    second.ownerRoot.parentElement?.append(secondHost);
    const unregisterFirstHost = registerOverlayHostOwner(first.ownerRoot, firstHost);
    const unregisterSecondHost = registerOverlayHostOwner(second.ownerRoot, secondHost);

    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    firstControl.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(pluginState(first.editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    expect(pluginState(second.editor).explicitOwner).not.toBeNull();
    expect(document.activeElement).toBe(first.editor.view.dom);

    unregisterFirstHost();
    unregisterSecondHost();
    first.editor.destroy();
    second.editor.destroy();
  });

  it("removes registered-host Escape listeners on unregister and destroy", () => {
    const { editor, ownerRoot } = makeReactMountedEditor();
    const unregisteredHost = document.createElement("div");
    const destroyedHost = document.createElement("div");
    ownerRoot.parentElement?.append(unregisteredHost, destroyedHost);
    const unregisteredRemoveSpy = vi.spyOn(unregisteredHost, "removeEventListener");
    const destroyedRemoveSpy = vi.spyOn(destroyedHost, "removeEventListener");
    const unregisterHost = registerOverlayHostOwner(ownerRoot, unregisteredHost);
    registerOverlayHostOwner(ownerRoot, destroyedHost);

    unregisterHost();
    editor.destroy();

    expect(unregisteredRemoveSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(destroyedRemoveSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("preserves owners inside the current root after EditorContent reparents the editor", () => {
    const { editor, ownerRoot } = makeReactMountedEditor();
    dispatchMouseDown(cellFrameElement(editor));
    expect(pluginState(editor).explicitOwner).not.toBeNull();
    const chrome = document.createElement("div");
    for (const [name, value] of Object.entries(authoringChromeAttributes("popover"))) {
      chrome.setAttribute(name, value);
    }
    ownerRoot.append(chrome);

    dispatchMouseDown(chrome);

    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("removes owner listeners from the current root after EditorContent reparents the editor", () => {
    const { editor, ownerRoot } = makeReactMountedEditor();
    const ownerRemoveSpy = vi.spyOn(ownerRoot, "removeEventListener");

    editor.destroy();

    expect(ownerRemoveSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("sets the structural explicit owner from an editor-local mousedown", () => {
    const editor = makeEditor();

    dispatchMouseDown(cellFrameElement(editor));

    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("dismisses v2 owners on Escape while owner state is present", () => {
    const editor = makeEditor();
    dispatchMouseDown(cellFrameElement(editor));
    expect(pluginState(editor).explicitOwner).not.toBeNull();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    editor.view.dom.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    editor.destroy();
  });

  it("lets a child consume the first Escape and dismisses the parent on the second", () => {
    const editor = makeEditor();
    dispatchMouseDown(cellFrameElement(editor));
    const ownerRoot = resolveAuthoringInteractionRoot(editor.view.dom);
    const childTrigger = document.createElement("button");
    const childContent = document.createElement("div");
    childContent.tabIndex = -1;
    ownerRoot.append(childTrigger, childContent);
    childContent.focus();

    let childOpen = true;
    const dismissChild = (event: KeyboardEvent) => {
      if (!childOpen || event.key !== "Escape") return;
      event.preventDefault();
      childOpen = false;
      childContent.remove();
      childTrigger.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", dismissChild, { capture: true });

    const firstEscape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    childContent.dispatchEvent(firstEscape);

    expect(firstEscape.defaultPrevented).toBe(true);
    expect(pluginState(editor).explicitOwner).not.toBeNull();
    expect(document.activeElement).toBe(childTrigger);

    const secondEscape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    childTrigger.dispatchEvent(secondEscape);

    expect(secondEscape.defaultPrevented).toBe(true);
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);

    document.removeEventListener("keydown", dismissChild, { capture: true });
    editor.destroy();
  });

  it("focuses the owning editor fallback after parent dismissal removes its focused control", () => {
    const editor = makeEditor();
    dispatchMouseDown(cellFrameElement(editor));
    const ownerRoot = resolveAuthoringInteractionRoot(editor.view.dom);
    const parentControl = document.createElement("button");
    ownerRoot.append(parentControl);
    parentControl.focus();

    const unsubscribe = editorFacade(editor).subscribe((state) => {
      if (state.snapshot.owners.explicitOwner.target === null) {
        parentControl.remove();
      }
    });
    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    parentControl.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(parentControl.isConnected).toBe(false);
    expect(document.activeElement).toBe(editor.view.dom);

    unsubscribe();
    editor.destroy();
  });

  it("ignores Escape when no interaction owner state is present", () => {
    const editor = makeEditor();
    const before = editor.state;

    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      }),
    );

    expect(editor.state).toBe(before);
    editor.destroy();
  });

  it("clears v2 owners on document mousedown outside the editor", () => {
    const editor = makeEditor();
    dispatchMouseDown(cellFrameElement(editor));
    expect(pluginState(editor).explicitOwner).not.toBeNull();

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    dispatchMouseDown(outside);

    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    editor.destroy();
  });

  it("preserves v2 owners for outside pointers on authoring chrome", () => {
    const editor = makeEditor();
    dispatchMouseDown(cellFrameElement(editor));
    expect(pluginState(editor).explicitOwner).not.toBeNull();
    const ownerRoot = resolveAuthoringInteractionRoot(editor.view.dom);

    const chrome = document.createElement("div");
    for (const [name, value] of Object.entries(authoringChromeAttributes("popover"))) {
      chrome.setAttribute(name, value);
    }
    ownerRoot.appendChild(chrome);
    dispatchMouseDown(chrome);

    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("preserves v2 owners for descendants of this editor's registered host", () => {
    const editor = makeEditor();
    dispatchMouseDown(cellFrameElement(editor));
    const ownerRoot = resolveAuthoringInteractionRoot(editor.view.dom);
    const host = document.createElement("div");
    const hostTarget = document.createElement("button");
    host.append(hostTarget);
    document.body.append(host);
    const unregister = registerOverlayHostOwner(ownerRoot, host);

    dispatchMouseDown(hostTarget);

    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });

    unregister();
    editor.destroy();
  });

  it("does not preserve v2 owners for a sibling editor's dialog lookalike", () => {
    const firstEditor = makeEditor();
    const secondEditor = makeEditor();
    dispatchMouseDown(cellFrameElement(firstEditor));
    const siblingDialog = document.createElement("div");
    siblingDialog.setAttribute("role", "dialog");
    secondEditor.view.dom.append(siblingDialog);

    dispatchMouseDown(siblingDialog);

    expect(pluginState(firstEditor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);

    firstEditor.destroy();
    secondEditor.destroy();
  });

  it("coalesces focusout synchronization and cancels pending work on destroy", () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    editor.view.dom.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    editor.view.dom.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    const focusSyncCallIndexes = setTimeoutSpy.mock.calls.flatMap(([callback], index) =>
      typeof callback === "function" && callback.name === "syncAuthoringChromeSessionFromFocus"
        ? [index]
        : [],
    );
    expect(focusSyncCallIndexes).toHaveLength(1);
    const timerHandle = setTimeoutSpy.mock.results[focusSyncCallIndexes[0] ?? -1]?.value;

    editor.destroy();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerHandle);
  });

  it("removes every owner and document listener on destroy", () => {
    const editor = makeEditor();
    const ownerRoot = resolveAuthoringInteractionRoot(editor.view.dom);
    const ownerRemoveSpy = vi.spyOn(ownerRoot, "removeEventListener");
    const documentRemoveSpy = vi.spyOn(document, "removeEventListener");

    editor.destroy();

    expect(ownerRemoveSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    for (const type of ["mousedown", "pointerdown", "focusin", "focusout"]) {
      expect(documentRemoveSpy).toHaveBeenCalledWith(type, expect.any(Function), true);
    }
  });

  it("normalizes owner state when the document changes", () => {
    const editor = makeEditor();

    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.OpenMenu,
        target: CELL_REF,
      }),
    );

    let cellPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (cellPos >= 0) return false;
      if (node.type.name === "cell") {
        cellPos = pos;
        return false;
      }
      return true;
    });
    const cellNode = editor.state.doc.nodeAt(cellPos);
    if (!cellNode) throw new Error("cell not found");

    editor.view.dispatch(editor.state.tr.delete(cellPos, cellPos + cellNode.nodeSize));

    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toBeNull();
    editor.destroy();
  });

  it("rejects direct targeted command meta for targets outside the document", () => {
    const editor = makeEditor();

    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.OpenMenu,
        target: { id: "missing-cell", kind: "cell" },
      }),
    );

    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toBeNull();
    editor.destroy();
  });

  it("publishes snapshots to the editor-owned facade after owner meta changes", () => {
    const editor = makeEditor();
    const facade = editorFacade(editor);

    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: CELL_REF,
      }),
    );

    const snapshot = facade.getState().snapshot;
    expect(snapshot.owners.explicitOwner.target).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("publishes snapshots to the editor-owned facade after DOM activation", () => {
    const editor = makeEditor();
    const facade = editorFacade(editor);

    dispatchMouseDown(cellFrameElement(editor));

    const snapshot = facade.getState().snapshot;
    expect(snapshot.owners.explicitOwner.target).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("publishes selected block bubble slots to the editor-owned facade", () => {
    const editor = makeEditor({ content: blockDocument() });
    const facade = editorFacade(editor);
    editor.view.dom.focus();
    editor.view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    editor.commands.setNodeSelection(nodePosById(editor, "block-a"));

    expect(facade.getState().snapshot.owners.selectionOwner.target).toMatchObject({
      id: "block-a",
      kind: "block",
    });
    expect(facade.getState().snapshot.chromeSlots.blockBubble).toMatchObject({
      target: { id: "block-a", kind: "block" },
      visible: true,
    });
    editor.destroy();
  });

  it("preserves open menus on editor-local authoring chrome mousedown", () => {
    const editor = makeEditor();
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.OpenMenu,
        target: CELL_REF,
      }),
    );
    const trigger = document.createElement("button");
    for (const [name, value] of Object.entries(
      authoringChromeAttributes(AuthoringChromeKind.Trigger),
    )) {
      trigger.setAttribute(name, value);
    }
    cellFrameElement(editor).append(trigger);

    dispatchMouseDown(trigger);

    expect(pluginState(editor).menuOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("activates block context from a button mousedown without blocking the click", () => {
    const editor = makeEditor({ content: blockDocument() });
    const facade = editorFacade(editor);
    const blockFrame = editor.view.dom.querySelector(
      `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-a"]`,
    );
    if (!blockFrame) throw new Error("missing block frame element");

    const button = document.createElement("button");
    blockFrame.appendChild(button);
    const clicks: string[] = [];
    button.addEventListener("click", () => clicks.push("click"));

    const mousedown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(mousedown);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(mousedown.defaultPrevented).toBe(false);
    expect(clicks).toEqual(["click"]);
    expect(pluginState(editor).contextOwner).toMatchObject({
      id: "block-a",
      kind: "block",
    });
    expect(pluginState(editor).explicitOwner).toBeNull();
    expect(facade.getState().snapshot.owners.contextOwner.target).toMatchObject({
      id: "block-a",
      kind: "block",
    });
    editor.destroy();
  });

  it("clears the context owner on outside pointers", () => {
    const editor = makeEditor({ content: blockDocument() });
    const blockFrame = editor.view.dom.querySelector(
      `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-a"]`,
    );
    if (!blockFrame) throw new Error("missing block frame element");
    const button = document.createElement("button");
    blockFrame.appendChild(button);
    dispatchMouseDown(button);
    expect(pluginState(editor).contextOwner).not.toBeNull();

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    dispatchMouseDown(outside);

    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    editor.destroy();
  });

  it("clears the context owner from editor-local clicks outside authored frames", () => {
    const editor = makeEditor({ content: blockDocument() });
    const blockFrame = editor.view.dom.querySelector(
      `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-a"]`,
    );
    if (!blockFrame) throw new Error("missing block frame element");
    const button = document.createElement("button");
    blockFrame.appendChild(button);
    dispatchMouseDown(button);
    expect(pluginState(editor).contextOwner).toMatchObject({
      id: "block-a",
      kind: "block",
    });

    const editorGutter = document.createElement("section");
    editor.view.dom.appendChild(editorGutter);
    dispatchMouseDown(editorGutter);

    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    editor.destroy();
  });

  it("hides caret-owned block chrome after editor-local clicks outside authored frames", () => {
    const editor = makeEditor({ content: blockDocument() });
    const facade = editorFacade(editor);
    const caretPos = textPos(editor, "Block text") + 2;

    editor.commands.setTextSelection(caretPos);
    editor.view.dom.focus();
    editor.view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(facade.getState().snapshot.chromeSlots.blockBubble.visible).toBe(true);
    expect(facade.getState().snapshot.chromeSlots.movementHandle.visible).toBe(true);

    const editorGutter = document.createElement("section");
    editor.view.dom.appendChild(editorGutter);
    dispatchMouseDown(editorGutter);

    expect(editor.state.selection.from).toBe(caretPos);
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    expect(facade.getState().snapshot.chromeSlots.blockBubble).toMatchObject({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      visible: false,
    });
    expect(facade.getState().snapshot.chromeSlots.movementHandle).toMatchObject({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      visible: false,
    });
    editor.destroy();
  });

  it("hides caret-owned block chrome after outside pointers without clearing text selection", () => {
    const editor = makeEditor({ content: blockDocument() });
    const facade = editorFacade(editor);
    const caretPos = textPos(editor, "Block text") + 2;

    editor.commands.setTextSelection(caretPos);
    expect(facade.getState().snapshot.selection.range.from).toBe(caretPos);
    expect(facade.getState().snapshot.chromeSlots.blockBubble).toMatchObject({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      visible: false,
    });

    editor.view.dom.focus();
    editor.view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(facade.getState().snapshot.chromeSlots.blockBubble.visible).toBe(true);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    dispatchMouseDown(outside);

    expect(editor.state.selection.from).toBe(caretPos);
    expect(facade.getState().snapshot.selection.range.from).toBe(caretPos);
    expect(facade.getState().snapshot.chromeSlots.blockBubble).toMatchObject({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      visible: false,
    });
    editor.destroy();
  });

  it("wires facade command ports that dispatch v2 meta", () => {
    const editor = makeEditor();
    const facade = editorFacade(editor);

    expect(facade.getState().commands.openMenu(CELL_REF)).toBe(true);
    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    expect(facade.getState().snapshot.owners.menuOwner.target).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("rejects facade commands for targets outside the document", () => {
    const editor = makeEditor();
    const facade = editorFacade(editor);

    expect(facade.getState().commands.openMenu({ id: "missing-cell", kind: "cell" })).toBe(false);
    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toBeNull();
    expect(facade.getState().snapshot.owners.menuOwner.target).toBeNull();
    editor.destroy();
  });
});
