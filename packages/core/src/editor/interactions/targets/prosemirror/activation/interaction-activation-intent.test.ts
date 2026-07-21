// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import {
  AUTHORING_FRAME_ATTR,
  AUTHORING_FRAME_EDITABLE_ATTR,
  authoringFrameAttributes,
  courseBlockAuthoringFrameAttributes,
  type AuthoringFrameKind,
} from "@/editor/interactions/dom/authoring-frame";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import { InteractionTargetKind } from "../../model/interaction-owner-state";
import {
  InteractionDomActivationIntentKind,
  resolveInteractionActivationIntentFromMouseDown as resolveInteractionActivationIntentFromMouseDownWithLookup,
} from "./interaction-activation-intent";

const BLOCK = "v2_activation_intent_block";
const DELEGATE_PARENT = "v2_activation_intent_delegate_parent";
const EMBEDDED_CHILD = "v2_activation_intent_embedded_child";

const blockDefinition = defineBlock({
  nodeType: BLOCK,
});

const delegateParentDefinition = defineBlock({
  nodeType: DELEGATE_PARENT,
  interaction: {
    embeddedChildSelection: "delegate-to-parent",
  },
});

const embeddedChildDefinition = defineBlock({
  nodeType: EMBEDDED_CHILD,
});

const testBlockRegistry = createBlockRegistry([
  blockDefinition,
  delegateParentDefinition,
  embeddedChildDefinition,
]);

const resolveInteractionActivationIntentFromMouseDown = (
  view: Parameters<typeof resolveInteractionActivationIntentFromMouseDownWithLookup>[0],
  event: Parameters<typeof resolveInteractionActivationIntentFromMouseDownWithLookup>[1],
) => resolveInteractionActivationIntentFromMouseDownWithLookup(view, event, testBlockRegistry);

function framedNode(name: string, content: string, frameKind: AuthoringFrameKind | null) {
  return Node.create({
    name,
    content,
    defining: true,
    group: "block",

    addAttributes() {
      return {
        id: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-activation-intent-${name}]` }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const frameAttributes =
        frameKind === null
          ? {}
          : frameKind === "block"
            ? courseBlockAuthoringFrameAttributes({
                blockId: node.attrs["id"],
                nodeType: name,
              })
            : authoringFrameAttributes({
                frameKind,
                id: node.attrs["id"],
                nodeType: frameKind,
              });
      return [
        "div",
        {
          ...HTMLAttributes,
          ...frameAttributes,
          [`data-v2-activation-intent-${name}`]: "",
        },
        0,
      ];
    },
  });
}

const TestSurfaceNode = framedNode("surface", "region+", "surface");
const TestRegionNode = framedNode("region", "(layout | grid | paragraph)+", "region");
const TestLayoutNode = framedNode("layout", "section+", "layout");
const TestSectionNode = framedNode(
  "section",
  `(grid | paragraph | ${BLOCK} | ${DELEGATE_PARENT})+`,
  "section",
);
const TestGridNode = framedNode("grid", "cell+", "grid");
const TestCellNode = framedNode("cell", "paragraph+", "cell");
const TestBlockNode = framedNode(BLOCK, "paragraph+", "block");
const TestDelegateParentNode = framedNode(DELEGATE_PARENT, `${EMBEDDED_CHILD}+`, "block");
const TestEmbeddedChildNode = framedNode(EMBEDDED_CHILD, "paragraph+", "block");

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function fullContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "surface",
        attrs: { id: "surface-a" },
        content: [
          {
            type: "region",
            attrs: { id: "region-a" },
            content: [
              {
                type: "layout",
                attrs: { id: "layout-a" },
                content: [
                  {
                    type: "section",
                    attrs: { id: "section-a" },
                    content: [
                      {
                        type: "grid",
                        attrs: { id: "grid-a" },
                        content: [
                          {
                            type: "cell",
                            attrs: { id: "cell-a" },
                            content: [paragraph("cell text")],
                          },
                        ],
                      },
                      {
                        type: BLOCK,
                        attrs: { id: "block-a" },
                        content: [paragraph("block text")],
                      },
                      {
                        type: DELEGATE_PARENT,
                        attrs: { id: "parent-a" },
                        content: [
                          {
                            type: EMBEDDED_CHILD,
                            attrs: { id: "child-a" },
                            content: [paragraph("child text")],
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
  };
}

function makeEditor(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestSurfaceNode,
      TestRegionNode,
      TestLayoutNode,
      TestSectionNode,
      TestGridNode,
      TestCellNode,
      TestBlockNode,
      TestDelegateParentNode,
      TestEmbeddedChildNode,
    ],
    content: fullContent(),
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

function frameElement(editor: Editor, id: string): Element {
  const found = editor.view.dom.querySelector(`[${AUTHORING_FRAME_ATTR}][data-id="${id}"]`);
  if (!found) throw new Error(`missing frame element ${id}`);
  return found;
}

function mouseDown(target: EventTarget | null, overrides: Partial<MouseEvent> = {}): MouseEvent {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target,
    ...overrides,
  } as unknown as MouseEvent;
}

function nodePosById(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.attrs["id"] === id) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing node ${id}`);
  return found;
}

describe("resolveInteractionActivationIntentFromMouseDown", () => {
  it("classifies non-primary and modified mouse downs as ignored interactive", () => {
    const editor = makeEditor();
    const cellFrame = frameElement(editor, "cell-a");

    expect(
      resolveInteractionActivationIntentFromMouseDown(
        editor.view,
        mouseDown(cellFrame, { button: 2 }),
      ),
    ).toEqual({ kind: InteractionDomActivationIntentKind.IgnoredInteractive });

    expect(
      resolveInteractionActivationIntentFromMouseDown(
        editor.view,
        mouseDown(cellFrame, { metaKey: true }),
      ),
    ).toEqual({ kind: InteractionDomActivationIntentKind.IgnoredInteractive });
    editor.destroy();
  });

  it("classifies targets outside the editor root as outside-editor", () => {
    const editor = makeEditor();
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    expect(
      resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(outside)),
    ).toEqual({ kind: InteractionDomActivationIntentKind.OutsideEditor });

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(null))).toEqual({
      kind: InteractionDomActivationIntentKind.OutsideEditor,
    });
    editor.destroy();
  });

  it("classifies non-trigger authoring chrome with a resolvable frame as explicit chrome for the owner target", () => {
    const editor = makeEditor();
    const cellFrame = frameElement(editor, "cell-a");
    const chrome = document.createElement("div");
    for (const [name, value] of Object.entries(
      authoringChromeAttributes(AuthoringChromeKind.Handle),
    )) {
      chrome.setAttribute(name, value);
    }
    cellFrame.appendChild(chrome);

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(chrome))).toEqual(
      {
        kind: InteractionDomActivationIntentKind.ExplicitChrome,
        target: {
          id: "cell-a",
          kind: InteractionTargetKind.Cell,
          pos: nodePosById(editor, "cell-a"),
        },
      },
    );
    editor.destroy();
  });

  it("ignores trigger authoring chrome so click handlers own trigger behavior", () => {
    const editor = makeEditor();
    const cellFrame = frameElement(editor, "cell-a");
    const chrome = document.createElement("div");
    for (const [name, value] of Object.entries(
      authoringChromeAttributes(AuthoringChromeKind.Trigger),
    )) {
      chrome.setAttribute(name, value);
    }
    cellFrame.appendChild(chrome);

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(chrome))).toEqual(
      { kind: InteractionDomActivationIntentKind.IgnoredInteractive },
    );
    editor.destroy();
  });

  it("delegates explicit non-trigger chrome on a managed embedded child to the owning parent", () => {
    const editor = makeEditor();
    const childFrame = frameElement(editor, "child-a");
    const chrome = document.createElement("div");
    for (const [name, value] of Object.entries(
      authoringChromeAttributes(AuthoringChromeKind.Handle),
    )) {
      chrome.setAttribute(name, value);
    }
    childFrame.appendChild(chrome);

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(chrome))).toEqual(
      {
        kind: InteractionDomActivationIntentKind.ExplicitChrome,
        target: {
          id: "parent-a",
          kind: InteractionTargetKind.Block,
          pos: nodePosById(editor, "parent-a"),
        },
      },
    );
    editor.destroy();
  });

  it("classifies authoring chrome without a resolvable frame as ignored interactive", () => {
    const editor = makeEditor();
    const chrome = document.createElement("div");
    for (const [name, value] of Object.entries(
      authoringChromeAttributes(AuthoringChromeKind.Handle),
    )) {
      chrome.setAttribute(name, value);
    }
    editor.view.dom.appendChild(chrome);

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(chrome))).toEqual(
      { kind: InteractionDomActivationIntentKind.IgnoredInteractive },
    );
    editor.destroy();
  });

  it("classifies ignored interactive descendants without falling through to frame activation", () => {
    const editor = makeEditor();
    const blockFrame = frameElement(editor, "block-a");
    const button = document.createElement("button");
    blockFrame.appendChild(button);

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(button))).toEqual(
      { kind: InteractionDomActivationIntentKind.IgnoredInteractive },
    );
    editor.destroy();
  });

  it("classifies authored editable content targets", () => {
    const editor = makeEditor();
    const blockFrame = frameElement(editor, "block-a");
    const editable = document.createElement("div");
    editable.setAttribute(AUTHORING_FRAME_EDITABLE_ATTR, "");
    const text = document.createElement("span");
    editable.appendChild(text);
    blockFrame.appendChild(editable);

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(text))).toEqual({
      kind: InteractionDomActivationIntentKind.AuthoredEditableContent,
    });
    editor.destroy();
  });

  it("classifies block shell descendants wrapped by parent node-view content as object-shell", () => {
    const editor = makeEditor();
    const sectionFrame = frameElement(editor, "section-a");
    const parentContent = document.createElement("div");
    parentContent.setAttribute("data-node-view-content-react", "");
    const blockFrame = document.createElement("section");
    for (const [name, value] of Object.entries(
      courseBlockAuthoringFrameAttributes({
        blockId: "block-a",
        nodeType: BLOCK,
      }),
    )) {
      blockFrame.setAttribute(name, value);
    }
    const shell = document.createElement("section");
    shell.setAttribute("data-assessment-shell", "");
    const field = document.createElement("div");
    field.setAttribute("data-node-view-content", "");
    const fieldText = document.createElement("span");
    fieldText.textContent = "Actual editable field";
    field.appendChild(fieldText);
    blockFrame.append(shell, field);
    parentContent.appendChild(blockFrame);
    sectionFrame.appendChild(parentContent);

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(shell))).toEqual({
      kind: InteractionDomActivationIntentKind.ObjectShell,
      target: {
        id: "block-a",
        kind: InteractionTargetKind.Block,
        pos: nodePosById(editor, "block-a"),
      },
    });
    expect(
      resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(fieldText)),
    ).toEqual({
      kind: InteractionDomActivationIntentKind.AuthoredEditableContent,
    });
    editor.destroy();
  });

  it("classifies block frame shells as object-shell with the raw block target", () => {
    const editor = makeEditor();
    const blockFrame = frameElement(editor, "block-a");

    expect(
      resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(blockFrame)),
    ).toEqual({
      kind: InteractionDomActivationIntentKind.ObjectShell,
      target: {
        id: "block-a",
        kind: InteractionTargetKind.Block,
        pos: nodePosById(editor, "block-a"),
      },
    });
    editor.destroy();
  });

  it("keeps the raw child target for managed embedded block shells", () => {
    const editor = makeEditor();
    const childFrame = frameElement(editor, "child-a");

    expect(
      resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(childFrame)),
    ).toEqual({
      kind: InteractionDomActivationIntentKind.ObjectShell,
      target: {
        id: "child-a",
        kind: InteractionTargetKind.Block,
        pos: nodePosById(editor, "child-a"),
      },
    });
    editor.destroy();
  });

  it("classifies structural frames as blank structural space with the owner target", () => {
    const editor = makeEditor();

    for (const [id, kind] of [
      ["cell-a", InteractionTargetKind.Cell],
      ["grid-a", InteractionTargetKind.Grid],
      ["layout-a", InteractionTargetKind.Layout],
      ["region-a", InteractionTargetKind.Region],
      ["section-a", InteractionTargetKind.Section],
      ["surface-a", InteractionTargetKind.Surface],
    ] as const) {
      expect(
        resolveInteractionActivationIntentFromMouseDown(
          editor.view,
          mouseDown(frameElement(editor, id)),
        ),
      ).toEqual({
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: {
          id,
          kind,
          pos: nodePosById(editor, id),
        },
      });
    }
    editor.destroy();
  });

  it("classifies stale or mismatched frame descriptors as ignored interactive", () => {
    const editor = makeEditor();
    const cellFrame = frameElement(editor, "cell-a");

    const staleFrame = document.createElement("div");
    staleFrame.setAttribute(AUTHORING_FRAME_ATTR, "grid");
    staleFrame.setAttribute("data-id", "grid-gone");
    cellFrame.appendChild(staleFrame);

    expect(
      resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(staleFrame)),
    ).toEqual({ kind: InteractionDomActivationIntentKind.IgnoredInteractive });

    const idlessFrame = document.createElement("div");
    idlessFrame.setAttribute(AUTHORING_FRAME_ATTR, "grid");
    cellFrame.appendChild(idlessFrame);

    expect(
      resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(idlessFrame)),
    ).toEqual({ kind: InteractionDomActivationIntentKind.IgnoredInteractive });
    editor.destroy();
  });

  it("classifies editor-local plain content with no frame ancestor as outside-editor", () => {
    const editor = makeEditor();
    const loose = document.createElement("div");
    editor.view.dom.appendChild(loose);

    expect(resolveInteractionActivationIntentFromMouseDown(editor.view, mouseDown(loose))).toEqual({
      kind: InteractionDomActivationIntentKind.OutsideEditor,
    });
    editor.destroy();
  });
});
