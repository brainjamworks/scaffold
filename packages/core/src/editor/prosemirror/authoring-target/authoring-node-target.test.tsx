// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createAuthoringNodeTarget, useAuthoringNodeTarget } from ".";

const AuthoringTargetNode = Node.create({
  name: "authoring_target",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      id: { default: null },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-authoring-target]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-authoring-target": "" }];
  },
});

const OtherTargetNode = Node.create({
  name: "other_authoring_target",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-other-authoring-target]" }];
  },
  renderHTML() {
    return ["div", { "data-other-authoring-target": "" }];
  },
});

const editors: Editor[] = [];
let latestProbeTarget: ReturnType<typeof useAuthoringNodeTarget> = null;

afterEach(() => {
  latestProbeTarget = null;
  cleanup();
  while (editors.length > 0) {
    const editor = editors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
  vi.restoreAllMocks();
});

describe("createAuthoringNodeTarget", () => {
  it("reads the target node and position from the latest editor state", () => {
    const editor = makeEditor([authoringTarget("target-a", "before")]);
    const target = createAuthoringNodeTarget(editor, targetRef("target-a"));

    const paragraph = editor.state.schema.nodes["paragraph"]?.create();
    if (!paragraph) throw new Error("Expected the paragraph node type");
    editor.view.dispatch(editor.state.tr.insert(0, paragraph));

    const moved = target.read();
    if (!moved) throw new Error("Expected a resolved authoring target");
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(moved.pos, undefined, {
        ...moved.node.attrs,
        label: "after",
      }),
    );

    expect(target.status).toBe("ready");
    expect(target.read()).toEqual(
      expect.objectContaining({
        pos: paragraph.nodeSize,
        node: expect.objectContaining({ attrs: expect.objectContaining({ label: "after" }) }),
      }),
    );
  });

  it("dispatches exactly once after a successful checked mutation", () => {
    const editor = makeEditor([authoringTarget("target-a", "before")]);
    const target = createAuthoringNodeTarget(editor, targetRef("target-a"));
    const transactionListener = vi.fn();
    editor.on("transaction", transactionListener);

    const result = target.transact((tr, resolved) => ({
      ok: true,
      tr: updateLabel(tr, resolved.pos, resolved.node.attrs, "after"),
    }));

    expect(result.ok).toBe(true);
    expect(transactionListener).toHaveBeenCalledTimes(1);
    expect(target.read()?.node.attrs["label"]).toBe("after");
  });

  it("passes through a checked mutation failure without dispatching", () => {
    const editor = makeEditor([authoringTarget("target-a", "before")]);
    const target = createAuthoringNodeTarget(editor, targetRef("target-a"));
    const transactionListener = vi.fn();
    editor.on("transaction", transactionListener);
    const failure = {
      ok: false as const,
      issue: { code: "feature_rejected", message: "Feature mutation rejected." },
    };

    expect(target.transact(() => failure)).toBe(failure);
    expect(transactionListener).not.toHaveBeenCalled();
  });

  it("does not invoke or dispatch a mutation when the target is missing", () => {
    const editor = makeEditor([authoringTarget("target-a", "before")]);
    const target = createAuthoringNodeTarget(editor, targetRef("missing"));
    const mutation = vi.fn();
    const transactionListener = vi.fn();
    editor.on("transaction", transactionListener);

    expect(target.status).toBe("missing");
    expect(target.read()).toBe(null);
    expect(target.transact(mutation)).toEqual({
      ok: false,
      issue: {
        code: "missing_authoring_target",
        message: "The authoring target no longer exists.",
      },
    });
    expect(mutation).not.toHaveBeenCalled();
    expect(transactionListener).not.toHaveBeenCalled();
  });

  it("does not invoke or dispatch a mutation when the target identity is invalid", () => {
    const editor = makeEditor([
      authoringTarget("target-a", "first"),
      authoringTarget("target-a", "second"),
    ]);
    const target = createAuthoringNodeTarget(editor, targetRef("target-a"));
    const mutation = vi.fn();
    const transactionListener = vi.fn();
    editor.on("transaction", transactionListener);

    expect(target.status).toBe("invalid");
    expect(target.read()).toBe(null);
    expect(target.transact(mutation)).toEqual({
      ok: false,
      issue: {
        code: "invalid_authoring_target",
        message: "The authoring target identity is invalid.",
      },
    });
    expect(mutation).not.toHaveBeenCalled();
    expect(transactionListener).not.toHaveBeenCalled();
  });

  it("fails reads and mutations closed after the editor is destroyed", () => {
    const editor = makeEditor([authoringTarget("target-a", "before")]);
    const target = createAuthoringNodeTarget(editor, targetRef("target-a"));
    const mutation = vi.fn();

    editor.destroy();

    expect(target.read()).toBe(null);
    expect(target.transact(mutation)).toEqual({
      ok: false,
      issue: {
        code: "destroyed_authoring_editor",
        message: "The authoring editor has been destroyed.",
      },
    });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("rejects a single stable identity with the wrong node type", () => {
    const editor = makeEditor([otherTarget("target-a")]);
    const target = createAuthoringNodeTarget(editor, targetRef("target-a"));

    expect(target.status).toBe("invalid");
    expect(target.read()).toBe(null);
  });
});

describe("useAuthoringNodeTarget", () => {
  it("keeps one handle while transactions rerender consumers and reads stay current", () => {
    const editor = makeEditor([authoringTarget("target-a", "before")]);

    render(<AuthoringTargetProbe editor={editor} targetRef={targetRef("target-a")} />);
    const initialTarget = probeTarget();

    const resolved = resolveTarget(editor, "target-a");
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(resolved.pos, undefined, {
          ...resolved.node.attrs,
          label: "after",
        }),
      );
    });

    expect(probeTarget()).toBe(initialTarget);
    expect(initialTarget?.read()?.node.attrs["label"]).toBe("after");
    expect(probeValue()).toBe("ready:0:after");
  });

  it("follows movement, attr changes, deletion, and undo while remaining mounted", () => {
    const editor = makeEditor([authoringTarget("target-a", "before")], true);

    render(<AuthoringTargetProbe editor={editor} targetRef={targetRef("target-a")} />);

    expect(probeValue()).toBe("ready:0:before");

    const paragraph = editor.state.schema.nodes["paragraph"]?.create();
    if (!paragraph) throw new Error("Expected the paragraph node type");
    act(() => {
      editor.view.dispatch(editor.state.tr.insert(0, paragraph));
    });
    expect(probeValue()).toBe(`ready:${paragraph.nodeSize}:before`);

    const moved = resolveTarget(editor, "target-a");
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(moved.pos, undefined, {
          ...moved.node.attrs,
          label: "after",
        }),
      );
    });
    expect(probeValue()).toBe(`ready:${paragraph.nodeSize}:after`);

    const changed = resolveTarget(editor, "target-a");
    act(() => {
      editor.view.dispatch(
        editor.state.tr.delete(changed.pos, changed.pos + changed.node.nodeSize),
      );
    });
    expect(probeValue()).toBe("missing::");

    act(() => {
      expect(editor.commands.undo()).toBe(true);
    });
    expect(probeValue()).toBe("ready:0:before");
  });

  it("returns null when the stable reference is inactive", () => {
    const editor = makeEditor([authoringTarget("target-a", "before")]);

    render(<AuthoringTargetProbe editor={editor} targetRef={null} />);

    expect(probeValue()).toBe("inactive");
  });

  it("cleans up transaction listeners when the ref or editor changes and on unmount", () => {
    const firstEditor = makeEditor([
      authoringTarget("target-a", "first"),
      authoringTarget("target-b", "second"),
    ]);
    const secondEditor = makeEditor([authoringTarget("target-c", "third")]);
    const firstOn = vi.spyOn(firstEditor, "on");
    const firstOff = vi.spyOn(firstEditor, "off");
    const secondOn = vi.spyOn(secondEditor, "on");
    const secondOff = vi.spyOn(secondEditor, "off");

    const rendered = render(
      <AuthoringTargetProbe editor={firstEditor} targetRef={targetRef("target-a")} />,
    );
    expect(firstOn).toHaveBeenCalledTimes(1);

    const firstTarget = probeTarget();
    rendered.rerender(
      <AuthoringTargetProbe editor={firstEditor} targetRef={targetRef("target-a")} />,
    );
    expect(probeTarget()).toBe(firstTarget);
    expect(firstOff).not.toHaveBeenCalled();
    expect(firstOn).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <AuthoringTargetProbe editor={firstEditor} targetRef={targetRef("target-b")} />,
    );
    expect(probeTarget()).not.toBe(firstTarget);
    expect(firstOff).toHaveBeenCalledTimes(1);
    expect(firstOn).toHaveBeenCalledTimes(2);

    rendered.rerender(<AuthoringTargetProbe editor={firstEditor} targetRef={null} />);
    expect(probeTarget()).toBe(null);
    expect(firstOff).toHaveBeenCalledTimes(2);

    rendered.rerender(
      <AuthoringTargetProbe editor={secondEditor} targetRef={targetRef("target-c")} />,
    );
    expect(secondOn).toHaveBeenCalledTimes(1);

    rendered.unmount();
    expect(secondOff).toHaveBeenCalledTimes(1);
  });
});

function makeEditor(content: JSONContent[], withHistory = false): Editor {
  const editor = new Editor({
    extensions: [
      withHistory ? StarterKit : StarterKit.configure({ undoRedo: false }),
      AuthoringTargetNode,
      OtherTargetNode,
    ],
    content: { type: "doc", content },
  });
  editors.push(editor);
  return editor;
}

function authoringTarget(id: string, label: string): JSONContent {
  return { type: "authoring_target", attrs: { id, label } };
}

function otherTarget(id: string): JSONContent {
  return { type: "other_authoring_target", attrs: { id } };
}

function targetRef(id: string) {
  return { id, nodeType: "authoring_target" };
}

function updateLabel(
  tr: Transaction,
  pos: number,
  attrs: Readonly<Record<string, unknown>>,
  label: string,
): Transaction {
  return tr.setNodeMarkup(pos, undefined, { ...attrs, label });
}

function AuthoringTargetProbe({
  editor,
  targetRef: ref,
}: {
  editor: Editor;
  targetRef: ReturnType<typeof targetRef> | null;
}) {
  const target = useAuthoringNodeTarget(editor, ref);
  latestProbeTarget = target;
  const resolved = target?.read();
  const value = target
    ? `${target.status}:${resolved?.pos ?? ""}:${resolved?.node.attrs["label"] ?? ""}`
    : "inactive";
  return <output data-testid="authoring-target-probe">{value}</output>;
}

function probeValue(): string {
  return screen.getByTestId("authoring-target-probe").textContent ?? "";
}

function probeTarget(): ReturnType<typeof useAuthoringNodeTarget> {
  return latestProbeTarget;
}

function resolveTarget(editor: Editor, id: string) {
  const resolved = createAuthoringNodeTarget(editor, targetRef(id)).read();
  if (!resolved) throw new Error("Expected a resolved authoring target");
  return resolved;
}
