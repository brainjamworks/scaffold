// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Editor, Node, type Extensions, type JSONContent } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { NestedRichTextEditorTarget } from "@/editor/prosemirror/nested-rich-text-editor";
import type { ScaffoldRichTextDocument } from "@/schemas/rich-text";

import {
  useNestedRichTextEditor,
  type UseNestedRichTextEditorResult,
} from "./use-nested-rich-text-editor";

const TestOverlayContentNode = Node.create({
  name: "test_overlay_content",
  group: "block",
  content: "block+",
  addAttributes() {
    return {
      id: {
        default: null,
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-test-overlay-content]" }];
  },
  renderHTML() {
    return ["div", { "data-test-overlay-content": "" }, 0];
  },
});

const TestOverlayAttrNode = Node.create({
  name: "test_overlay_attr",
  group: "block",
  content: "block*",
  parseHTML() {
    return [{ tag: "div[data-test-overlay-attr]" }];
  },
  renderHTML() {
    return ["div", { "data-test-overlay-attr": "" }, 0];
  },
});

const outerEditors: Editor[] = [];

afterEach(() => {
  cleanup();
  while (outerEditors.length > 0) {
    const editor = outerEditors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
  vi.restoreAllMocks();
});

describe("useNestedRichTextEditor", () => {
  it("creates a detached content-target editor and exposes stable lifecycle operations", async () => {
    const outerEditor = makeTrackedEditor(outerDoc("hint"));
    const target = contentTarget(outerEditor);
    const extensions = makeExtensions();
    const latest: { current: UseNestedRichTextEditorResult | null } = { current: null };

    const { rerender } = render(
      <NestedRichTextHookHarness
        extensions={extensions}
        outerEditor={outerEditor}
        renderEditorContent={false}
        target={target}
        onResult={(result) => {
          latest.current = result;
        }}
      />,
    );

    await waitFor(() => {
      expect(latest.current?.editor).toEqual(expect.objectContaining({ isEditable: true }));
    });

    const mountedEditor = latest.current?.editor;
    if (!mountedEditor) throw new Error("Expected mounted editor");

    expect(screen.getByTestId("editor-state").textContent).toBe("hint");
    expect(screen.getByTestId("harness").contains(mountedEditor.view.dom)).toBe(false);
    expect(latest.current?.editor).toBe(mountedEditor);

    const firstAppendBubbleMenuTo = latest.current?.appendBubbleMenuTo;
    const firstSyncFromTarget = latest.current?.syncFromTarget;
    expect("destroy" in (latest.current ?? {})).toBe(false);

    rerender(
      <NestedRichTextHookHarness
        extensions={extensions}
        outerEditor={outerEditor}
        renderEditorContent={false}
        target={target}
        onResult={(result) => {
          latest.current = result;
        }}
      />,
    );

    expect(latest.current?.appendBubbleMenuTo).toBe(firstAppendBubbleMenuTo);
    expect(latest.current?.syncFromTarget).toBe(firstSyncFromTarget);
  });

  it("destroys the current editor when closed and when the target changes", async () => {
    const outerEditor = makeTrackedEditor(outerAttrDoc());
    const extensions = makeExtensions();
    const firstTarget = attrTarget(() => richTextDoc("first"));
    const secondTarget = attrTarget(() => richTextDoc("second"));
    const latest: { current: UseNestedRichTextEditorResult | null } = { current: null };

    const { rerender } = render(
      <NestedRichTextHookHarness
        extensions={extensions}
        outerEditor={outerEditor}
        target={firstTarget}
        onResult={(result) => {
          latest.current = result;
        }}
      />,
    );

    await waitFor(() => {
      expect(latest.current?.editor).toEqual(expect.objectContaining({ isEditable: true }));
    });

    const firstEditor = latest.current?.editor;
    if (!firstEditor) throw new Error("Expected first editor");

    rerender(
      <NestedRichTextHookHarness
        extensions={extensions}
        outerEditor={outerEditor}
        target={firstTarget}
        open={false}
        onResult={(result) => {
          latest.current = result;
        }}
      />,
    );

    await waitFor(() => {
      expect(latest.current?.editor).toBe(null);
    });
    expect(firstEditor.isDestroyed).toBe(true);

    rerender(
      <NestedRichTextHookHarness
        extensions={extensions}
        outerEditor={outerEditor}
        target={secondTarget}
        onResult={(result) => {
          latest.current = result;
        }}
      />,
    );

    await waitFor(() => {
      const nextEditor = latest.current?.editor;
      expect(nextEditor?.getText()).toBe("second");
    });

    const secondEditor = latest.current?.editor;
    if (!secondEditor) throw new Error("Expected second editor");

    rerender(
      <NestedRichTextHookHarness
        extensions={extensions}
        outerEditor={outerEditor}
        target={firstTarget}
        onResult={(result) => {
          latest.current = result;
        }}
      />,
    );

    await waitFor(() => {
      expect(secondEditor.isDestroyed).toBe(true);
      expect(latest.current?.editor?.getText()).toBe("first");
    });
  });

  it("delegates sync requests to the mounted controller", async () => {
    const outerEditor = makeTrackedEditor(outerAttrDoc());
    const extensions = makeExtensions();
    let currentDoc = richTextDoc("before");
    const latest: { current: UseNestedRichTextEditorResult | null } = { current: null };

    render(
      <NestedRichTextHookHarness
        extensions={extensions}
        outerEditor={outerEditor}
        target={attrTarget(() => currentDoc)}
        onResult={(result) => {
          latest.current = result;
        }}
      />,
    );

    await waitFor(() => {
      expect(latest.current?.editor?.getText()).toBe("before");
    });

    currentDoc = richTextDoc("after");

    act(() => {
      latest.current?.syncFromTarget({ kind: "attr" });
    });

    expect(latest.current?.editor?.getText()).toBe("after");
  });

  it("forwards mapping failures from the active controller", async () => {
    const outerEditor = makeTrackedEditor(outerDoc("hint"));
    const target = contentTarget(outerEditor);
    const onMappingFailure = vi.fn();
    const latest: { current: UseNestedRichTextEditorResult | null } = { current: null };

    render(
      <NestedRichTextHookHarness
        extensions={makeExtensions()}
        onMappingFailure={onMappingFailure}
        onResult={(result) => {
          latest.current = result;
        }}
        outerEditor={outerEditor}
        target={{
          ...target,
          getPos: () => undefined,
        }}
      />,
    );

    await waitFor(() => expect(latest.current?.editor).toBeDefined());
    act(() => {
      latest.current?.editor?.commands.insertContent(" blocked");
    });

    expect(onMappingFailure).toHaveBeenCalledWith({
      reason: "stalePosition",
      status: "failed",
    });
    expect(latest.current?.editor?.getText()).toBe("hint");
  });

  it("returns a stable editor-parent bubble append target", async () => {
    const outerEditor = makeTrackedEditor(outerAttrDoc());
    const extensions = makeExtensions();
    const latest: { current: UseNestedRichTextEditorResult | null } = { current: null };

    render(
      <NestedRichTextHookHarness
        extensions={extensions}
        outerEditor={outerEditor}
        target={attrTarget(() => richTextDoc("feedback"))}
        onResult={(result) => {
          latest.current = result;
        }}
      />,
    );

    await waitFor(() => {
      expect(latest.current?.editor).toBeDefined();
    });

    expect(latest.current?.appendBubbleMenuTo()).toBe(screen.getByTestId("editor-mount"));
  });

  it("detaches React NodeViews before destroying editors on target replacement and close", async () => {
    const lifecycle = createReactNodeViewLifecycle();
    const extensions = makeExtensions({ additionalExtensions: [lifecycle.extension] });
    const outerEditor = makeTrackedEditor(outerLifecycleDoc(["first", "second"]), {
      additionalExtensions: [lifecycle.extension],
    });
    const firstTarget = contentTargetById(outerEditor, "first");
    const secondTarget = contentTargetById(outerEditor, "second");
    const observedEditors: Editor[] = [];
    const destroySnapshots = new Map<Editor, { contentComponent: unknown; portalCount: number }>();
    const destroySpies = new Map<Editor, EditorDestroySpy>();
    const observeResult = (result: UseNestedRichTextEditorResult) => {
      const currentEditor = result.editor;
      if (!currentEditor || observedEditors.includes(currentEditor)) return;

      observedEditors.push(currentEditor);
      destroySpies.set(currentEditor, spyOnEditorDestroy(currentEditor));
      currentEditor.on("destroy", () => {
        destroySnapshots.set(currentEditor, {
          contentComponent: editorContentComponent(currentEditor),
          portalCount: document.querySelectorAll("[data-testid='nested-lifecycle-node-view']")
            .length,
        });
        lifecycle.events.push(`destroy:${lifecycle.labelFor(currentEditor)}`);
      });
    };
    const renderHarness = (open: boolean, target: NestedRichTextEditorTarget) => (
      <NestedRichTextHookHarness
        extensions={extensions}
        onResult={observeResult}
        open={open}
        outerEditor={outerEditor}
        target={target}
      />
    );
    const { rerender } = render(renderHarness(true, firstTarget));

    await screen.findByText("first", { selector: "[data-testid='nested-lifecycle-node-view']" });
    const firstEditor = observedEditors.at(-1);
    if (!firstEditor) throw new Error("Expected first lifecycle editor");
    expect(editorContentComponent(firstEditor)).toBeDefined();

    rerender(renderHarness(true, secondTarget));

    await screen.findByText("second", { selector: "[data-testid='nested-lifecycle-node-view']" });
    const secondEditor = observedEditors.at(-1);
    if (!secondEditor || secondEditor === firstEditor) {
      throw new Error("Expected replacement lifecycle editor");
    }

    expect(destroySnapshots.get(firstEditor)).toEqual({
      contentComponent: null,
      portalCount: 0,
    });
    expect(lifecycle.events.indexOf(`unmount:${lifecycle.labelFor(firstEditor)}`)).toBeLessThan(
      lifecycle.events.indexOf(`destroy:${lifecycle.labelFor(firstEditor)}`),
    );
    expect(observedEditors.filter((editor) => !editor.isDestroyed)).toEqual([secondEditor]);
    expect(observedEditors.filter((editor) => editorContentComponent(editor) !== null)).toEqual([
      secondEditor,
    ]);
    expect(screen.getAllByTestId("nested-lifecycle-node-view")).toHaveLength(1);

    rerender(renderHarness(false, secondTarget));

    await waitFor(() => expect(secondEditor.isDestroyed).toBe(true));
    expect(destroySnapshots.get(secondEditor)).toEqual({
      contentComponent: null,
      portalCount: 0,
    });
    expect(lifecycle.events.indexOf(`unmount:${lifecycle.labelFor(secondEditor)}`)).toBeLessThan(
      lifecycle.events.indexOf(`destroy:${lifecycle.labelFor(secondEditor)}`),
    );
    expect(destroySpies.get(firstEditor)).toHaveBeenCalledTimes(1);
    expect(destroySpies.get(secondEditor)).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("nested-lifecycle-node-view")).toBe(null);
  });

  it("destroys every controller across StrictMode, rapid close and reopen, and unmount", async () => {
    const lifecycle = createReactNodeViewLifecycle();
    const extensions = makeExtensions({ additionalExtensions: [lifecycle.extension] });
    const outerEditor = makeTrackedEditor(outerLifecycleDoc(["strict"]), {
      additionalExtensions: [lifecycle.extension],
    });
    const target = contentTargetById(outerEditor, "strict");
    const observedEditors: Editor[] = [];
    const destroySpies = new Map<Editor, EditorDestroySpy>();
    const observeResult = (result: UseNestedRichTextEditorResult) => {
      const editor = result.editor;
      if (!editor || observedEditors.includes(editor)) return;
      observedEditors.push(editor);
      destroySpies.set(editor, spyOnEditorDestroy(editor));
    };
    const renderHarness = (open: boolean) => (
      <StrictMode>
        <NestedRichTextHookHarness
          extensions={extensions}
          onResult={observeResult}
          open={open}
          outerEditor={outerEditor}
          target={target}
        />
      </StrictMode>
    );
    const { rerender, unmount } = render(renderHarness(true));

    await screen.findByText("strict", { selector: "[data-testid='nested-lifecycle-node-view']" });
    const beforeClose = observedEditors.at(-1);
    if (!beforeClose) throw new Error("Expected editor before close");

    rerender(renderHarness(false));
    await waitFor(() => expect(beforeClose.isDestroyed).toBe(true));

    rerender(renderHarness(true));
    await screen.findByText("strict", { selector: "[data-testid='nested-lifecycle-node-view']" });
    const reopenedEditor = observedEditors.at(-1);
    if (!reopenedEditor) throw new Error("Expected reopened editor");
    expect(reopenedEditor).not.toBe(beforeClose);
    expect(observedEditors.filter((editor) => !editor.isDestroyed)).toEqual([reopenedEditor]);
    expect(observedEditors.filter((editor) => editorContentComponent(editor) !== null)).toEqual([
      reopenedEditor,
    ]);
    expect(screen.getAllByTestId("nested-lifecycle-node-view")).toHaveLength(1);

    unmount();

    expect(reopenedEditor.isDestroyed).toBe(true);
    expect(observedEditors.length).toBeGreaterThanOrEqual(2);
    expect(observedEditors.every((editor) => editor.isDestroyed)).toBe(true);
    expect(
      observedEditors.every((editor) => destroySpies.get(editor)?.mock.calls.length === 1),
    ).toBe(true);
    expect(observedEditors.every((editor) => editorContentComponent(editor) === null)).toBe(true);
    expect(document.querySelectorAll("[data-testid='nested-lifecycle-node-view']")).toHaveLength(0);
  });
});

interface NestedRichTextHookHarnessProps {
  editable?: boolean;
  extensions: Extensions;
  onMappingFailure?: NonNullable<Parameters<typeof useNestedRichTextEditor>[0]["onMappingFailure"]>;
  onResult?: (result: UseNestedRichTextEditorResult) => void;
  open?: boolean;
  outerEditor: Editor;
  renderEditorContent?: boolean;
  target: NestedRichTextEditorTarget | null;
}

function NestedRichTextHookHarness({
  editable,
  extensions,
  onMappingFailure,
  onResult,
  open,
  outerEditor,
  renderEditorContent = true,
  target,
}: NestedRichTextHookHarnessProps) {
  const result = useNestedRichTextEditor({
    extensions,
    outerEditor,
    target,
    ...(editable !== undefined ? { editable } : {}),
    ...(open !== undefined ? { open } : {}),
    ...(onMappingFailure ? { onMappingFailure } : {}),
  });

  useEffect(() => {
    onResult?.(result);
  }, [onResult, result]);

  return (
    <section data-testid="harness">
      <output data-testid="editor-state">{result.editor?.getText() ?? "none"}</output>
      {renderEditorContent ? (
        <EditorContent data-testid="editor-mount" editor={result.editor} />
      ) : null}
    </section>
  );
}

function makeExtensions({
  additionalExtensions = [],
  undoRedo = false,
}: { additionalExtensions?: Extensions; undoRedo?: boolean } = {}): Extensions {
  return [
    StarterKit.configure({ undoRedo: undoRedo ? {} : false }),
    TestOverlayContentNode,
    TestOverlayAttrNode,
    ...additionalExtensions,
  ];
}

function makeTrackedEditor(
  content?: JSONContent,
  options: { additionalExtensions?: Extensions; undoRedo?: boolean } = {},
) {
  const editor = new Editor({
    extensions: makeExtensions(options),
    ...(content ? { content } : {}),
  });
  outerEditors.push(editor);
  return editor;
}

function outerDoc(fieldText: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "before" }],
      },
      {
        type: "test_overlay_content",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: fieldText }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "after" }],
      },
    ],
  };
}

function outerAttrDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "test_overlay_attr",
        content: [{ type: "paragraph" }],
      },
    ],
  };
}

function outerLifecycleDoc(ids: string[]): JSONContent {
  return {
    type: "doc",
    content: ids.map((id) => ({
      type: "test_overlay_content",
      attrs: { id },
      content: [
        {
          type: "paragraph",
          content: [{ type: "test_react_lifecycle", attrs: { id } }],
        },
      ],
    })),
  };
}

function contentTarget(editor: Editor): Extract<NestedRichTextEditorTarget, { kind: "content" }> {
  const fieldPos = findNodePos(editor, "test_overlay_content");
  const fieldNode = editor.state.doc.nodeAt(fieldPos);
  if (!fieldNode) throw new Error("Missing content target node");

  return {
    kind: "content",
    getPos: () => fieldPos,
    node: fieldNode,
  };
}

function contentTargetById(
  editor: Editor,
  id: string,
): Extract<NestedRichTextEditorTarget, { kind: "content" }> {
  let target: Extract<NestedRichTextEditorTarget, { kind: "content" }> | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "test_overlay_content" || node.attrs["id"] !== id) return true;
    target = {
      kind: "content",
      getPos: () => pos,
      node,
    };
    return false;
  });
  if (!target) throw new Error(`Missing lifecycle target ${id}`);
  return target;
}

function createReactNodeViewLifecycle() {
  const events: string[] = [];
  const labels = new WeakMap<Editor, string>();
  let nextLabel = 1;
  const labelFor = (editor: Editor) => {
    const current = labels.get(editor);
    if (current) return current;
    const label = `editor-${nextLabel++}`;
    labels.set(editor, label);
    return label;
  };

  function LifecycleNodeView({ editor, node }: NodeViewProps) {
    const label = labelFor(editor);
    const id = String(node.attrs["id"]);
    useEffect(() => {
      events.push(`mount:${label}`);
      return () => {
        events.push(`unmount:${label}`);
      };
    }, [label]);
    return (
      <NodeViewWrapper as="span" data-testid="nested-lifecycle-node-view">
        {id}
      </NodeViewWrapper>
    );
  }

  const extension = Node.create({
    name: "test_react_lifecycle",
    group: "inline",
    inline: true,
    atom: true,
    addAttributes() {
      return {
        id: {
          default: null,
        },
      };
    },
    parseHTML() {
      return [{ tag: "span[data-test-react-lifecycle]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["span", { ...HTMLAttributes, "data-test-react-lifecycle": "" }];
    },
    addNodeView() {
      return ReactNodeViewRenderer(LifecycleNodeView);
    },
  });

  return { events, extension, labelFor };
}

function editorContentComponent(editor: Editor): unknown {
  return Reflect.get(editor, "contentComponent");
}

function spyOnEditorDestroy(editor: Editor) {
  return vi.spyOn(editor, "destroy");
}

type EditorDestroySpy = ReturnType<typeof spyOnEditorDestroy>;

function attrTarget(read: () => ScaffoldRichTextDocument): NestedRichTextEditorTarget {
  return {
    kind: "attr",
    read,
    write: vi.fn(),
  };
}

function richTextDoc(text: string): ScaffoldRichTextDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function findNodePos(editor: Editor, typeName: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Missing ${typeName}`);
  return found;
}
