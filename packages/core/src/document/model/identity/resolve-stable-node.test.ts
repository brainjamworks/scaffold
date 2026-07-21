// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { resolveStableNode } from "./resolve-stable-node";

const StableTarget = Node.create({
  name: "stable_target",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-stable-target]" }];
  },
  renderHTML() {
    return ["div", { "data-stable-target": "" }];
  },
});

const OtherTarget = Node.create({
  name: "other_target",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-other-target]" }];
  },
  renderHTML() {
    return ["div", { "data-other-target": "" }];
  },
});

const editors: Editor[] = [];

afterEach(() => {
  while (editors.length > 0) {
    const editor = editors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
});

describe("resolveStableNode", () => {
  it("resolves one node with the expected stable identity", () => {
    const editor = makeEditor([stableTarget("target-a")]);

    const result = resolveStableNode(editor.state.doc, {
      id: "target-a",
      nodeType: "stable_target",
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected a ready resolution");
    expect(result.node.type.name).toBe("stable_target");
    expect(result.node.attrs["id"]).toBe("target-a");
    expect(result.pos).toBe(0);
  });

  it("reports a missing stable identity", () => {
    const editor = makeEditor([stableTarget("target-a")]);

    expect(
      resolveStableNode(editor.state.doc, {
        id: "missing",
        nodeType: "stable_target",
      }),
    ).toEqual({ status: "missing" });
  });

  it("rejects a stable identity owned by the wrong node type", () => {
    const editor = makeEditor([otherTarget("target-a")]);

    expect(
      resolveStableNode(editor.state.doc, {
        id: "target-a",
        nodeType: "stable_target",
      }),
    ).toEqual({ status: "invalid", reason: "wrong_node_type" });
  });

  it("rejects duplicate stable identities", () => {
    const editor = makeEditor([stableTarget("target-a"), stableTarget("target-a")]);

    expect(
      resolveStableNode(editor.state.doc, {
        id: "target-a",
        nodeType: "stable_target",
      }),
    ).toEqual({ status: "invalid", reason: "duplicate_id" });
  });

  it("recalculates the current position after content is inserted before the node", () => {
    const editor = makeEditor([stableTarget("target-a")]);
    const identity = { id: "target-a", nodeType: "stable_target" };

    expect(resolveReadyPosition(editor, identity)).toBe(0);

    const paragraph = editor.state.schema.nodes["paragraph"]?.create();
    if (!paragraph) throw new Error("Expected the paragraph node type");
    editor.view.dispatch(editor.state.tr.insert(0, paragraph));

    expect(resolveReadyPosition(editor, identity)).toBe(paragraph.nodeSize);
  });
});

function makeEditor(content: JSONContent[]): Editor {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), StableTarget, OtherTarget],
    content: { type: "doc", content },
  });
  editors.push(editor);
  return editor;
}

function stableTarget(id: string): JSONContent {
  return { type: "stable_target", attrs: { id } };
}

function otherTarget(id: string): JSONContent {
  return { type: "other_target", attrs: { id } };
}

function resolveReadyPosition(editor: Editor, identity: { id: string; nodeType: string }): number {
  const result = resolveStableNode(editor.state.doc, identity);
  if (result.status !== "ready") throw new Error("Expected a ready resolution");
  return result.pos;
}
