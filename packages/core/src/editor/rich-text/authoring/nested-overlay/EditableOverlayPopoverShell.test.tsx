// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Editor, Node, type Extensions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import userEvent from "@testing-library/user-event";
import { createRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { Button } from "@/ui/components/Button/Button";
import type { RichTextBubbleMenuProps } from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";
import type { ScaffoldRichTextDocument } from "@/schemas/rich-text";

import {
  EditableOverlayPopover,
  EditableOverlayPopoverArrow,
  EditableOverlayPopoverContent,
  EditableOverlayPopoverPager,
  EditableOverlayPopoverTextAction,
} from "./EditableOverlayPopoverShell";

const nestedRichTextBubbleMenuMock = vi.hoisted(() => ({
  props: [] as RichTextBubbleMenuProps[],
}));

vi.mock("@/editor/shell/bubbles/rich-text/RichTextBubbleMenu", async () => {
  const React = await import("react");
  const { createPortal } = await import("react-dom");

  return {
    RichTextBubbleMenu(props: RichTextBubbleMenuProps) {
      nestedRichTextBubbleMenuMock.props.push(props);
      const appendTarget = props.appendTo?.();
      return appendTarget
        ? createPortal(
            React.createElement("div", {
              "data-plugin-key": props.pluginKey,
              "data-testid": "rich-text-bubble-menu",
            }),
            appendTarget,
          )
        : null;
    },
  };
});

const TestOverlayAttrNode = Node.create({
  name: "test_overlay_attr",
  group: "block",
  content: "block*",
  addAttributes() {
    return {
      document: {
        default: null,
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-test-overlay-attr]" }];
  },
  renderHTML() {
    return ["div", { "data-test-overlay-attr": "" }, 0];
  },
});

const TestOverlayContentNode = Node.create({
  name: "test_overlay_content",
  group: "block",
  content: "block+",
  parseHTML() {
    return [{ tag: "div[data-test-overlay-content]" }];
  },
  renderHTML() {
    return ["div", { "data-test-overlay-content": "" }, 0];
  },
});

const outerEditors: Editor[] = [];

afterEach(() => {
  cleanup();
  nestedRichTextBubbleMenuMock.props.length = 0;
  while (outerEditors.length > 0) {
    const editor = outerEditors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
});

describe("EditableOverlayPopoverShell", () => {
  it("renders a labelled editor popover shell with consumer-owned slots", () => {
    renderOpenPopover(
      <EditableOverlayPopover.Content
        title="Hint 1"
        description="A short nudge learners can reveal before submitting."
        icon={<span>?</span>}
        meta="1 of 2"
        tone="hint"
        headerActions={
          <EditableOverlayPopoverPager aria-label="Hint navigation">
            <button type="button" aria-label="Previous hint" disabled>
              Previous
            </button>
            <button type="button" aria-label="Next hint">
              Next
            </button>
          </EditableOverlayPopoverPager>
        }
        footerStart={
          <EditableOverlayPopover.TextAction tone="danger">
            Delete hint
          </EditableOverlayPopover.TextAction>
        }
        footerEnd={
          <>
            <EditableOverlayPopover.TextAction>Add hint</EditableOverlayPopover.TextAction>
            <Button variant="secondary" size="sm">
              Done
            </Button>
          </>
        }
      >
        <div role="textbox" contentEditable>
          Nested editor mount
        </div>
      </EditableOverlayPopover.Content>,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Hint 1",
      description: "A short nudge learners can reveal before submitting.",
    });
    const nestedEditor = screen.getByRole("textbox");
    const surface = dialog.querySelector("[data-scaffold-popover-surface]");

    expect(dialog.getAttribute("contenteditable")).toBe("false");
    expect(surface).toBeInstanceOf(HTMLElement);
    expect(surface?.getAttribute("data-tone")).toBe("hint");
    expect(nestedEditor.getAttribute("contenteditable")).toBe("true");
    expect(screen.getByRole("button", { name: "Next hint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete hint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add hint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("lets explicit aria label and description props override generated ids", () => {
    renderOpenPopover(
      <>
        <span id="external-overlay-title">External overlay label</span>
        <span id="external-overlay-description">External overlay description</span>
        <EditableOverlayPopoverContent
          title="Internal title"
          description="Internal description"
          aria-labelledby="external-overlay-title"
          aria-describedby="external-overlay-description"
        >
          Body
        </EditableOverlayPopoverContent>
      </>,
    );

    expect(
      screen.getByRole("dialog", {
        name: "External overlay label",
        description: "External overlay description",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Internal title")).toBeInTheDocument();
    expect(screen.getByText("Internal description")).toBeInTheDocument();
  });

  it("lets aria-label override the generated title reference", () => {
    renderOpenPopover(
      <EditableOverlayPopoverContent title="Internal title" aria-label="Explicit overlay label">
        Body
      </EditableOverlayPopoverContent>,
    );

    expect(screen.getByRole("dialog", { name: "Explicit overlay label" })).toBeInTheDocument();
    expect(screen.getByText("Internal title")).toBeInTheDocument();
  });

  it("passes floating content props through with editor authoring defaults", async () => {
    const onOpenAutoFocus = vi.fn();
    const onCloseAutoFocus = vi.fn();

    renderOpenPopover(
      <EditableOverlayPopoverContent
        title="Feedback"
        align="end"
        side="top"
        sideOffset={12}
        collisionPadding={16}
        className="custom-popover-class"
        data-testid="overlay-shell"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        Nested feedback editor
      </EditableOverlayPopoverContent>,
    );

    const dialog = screen.getByTestId("overlay-shell");
    expect(dialog.getAttribute("contenteditable")).toBe("false");
    expect(dialog.getAttribute("data-authoring-chrome")).toBe("popover");
    expect(dialog.classList.contains("custom-popover-class")).toBe(true);
    expect(dialog.querySelector("[data-scaffold-popover-surface]")).toBeInstanceOf(HTMLElement);
    await waitFor(() => {
      expect(onOpenAutoFocus).toHaveBeenCalledTimes(1);
    });
    expect(onCloseAutoFocus).not.toHaveBeenCalled();
  });

  it("keeps text actions transparent and button-like without taking over persistence", async () => {
    const onClick = vi.fn();

    render(
      <>
        <EditableOverlayPopoverTextAction onClick={onClick}>
          Add hint
        </EditableOverlayPopoverTextAction>
        <EditableOverlayPopoverTextAction tone="danger">
          Delete hint
        </EditableOverlayPopoverTextAction>
      </>,
    );

    const addAction = screen.getByRole("button", { name: "Add hint" });
    const deleteAction = screen.getByRole("button", { name: "Delete hint" });

    await userEvent.click(addAction);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(addAction.getAttribute("type")).toBe("button");
    expect(addAction.className).toContain("sc-popover-surface__text-action");
    expect(deleteAction.getAttribute("data-tone")).toBe("danger");
  });

  it("exposes a namespace compatible with the editor floating popover", () => {
    expect(EditableOverlayPopover.Root).toBeDefined();
    expect(EditableOverlayPopover.Trigger).toBeDefined();
    expect(EditableOverlayPopoverArrow).toBeDefined();
    expect(EditableOverlayPopover.Arrow).toBe(EditableOverlayPopoverArrow);
    expect(EditableOverlayPopover.Anchor).toBeDefined();
    expect(EditableOverlayPopover.Portal).toBeDefined();
    expect(EditableOverlayPopover.Close).toBeDefined();
    expect(EditableOverlayPopover.Content).toBe(EditableOverlayPopoverContent);
    expect(EditableOverlayPopover.Shell).toBeDefined();
    expect(EditableOverlayPopover.Shell).not.toBe(EditableOverlayPopoverContent);
    expect(EditableOverlayPopover.TextAction).toBe(EditableOverlayPopoverTextAction);
    expect(EditableOverlayPopover.Pager).toBe(EditableOverlayPopoverPager);
  });
});

describe("EditableOverlayPopover editor composer", () => {
  it("follows controlled open state and forwards the floating content ref", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));
    const extensions = makeNestedExtensions();
    const contentRef = createRef<HTMLDivElement>();
    const target = {
      kind: "attr" as const,
      read: () => attrDocument(outerEditor),
      write: (nextDocument: ScaffoldRichTextDocument) =>
        writeAttrDocument(outerEditor, nextDocument),
    };
    const renderPopover = (open: boolean) => (
      <EditableOverlayPopover.Root open={open}>
        <EditableOverlayPopover.Trigger>Feedback</EditableOverlayPopover.Trigger>
        <EditableOverlayPopover.Portal>
          <EditableOverlayPopover.Content
            ref={contentRef}
            title="Feedback"
            editor={{
              ariaLabel: "Feedback editor",
              bubbleMenuPluginKey: "feedback-editor-lifecycle-bubble",
              extensions,
              outerEditor,
              target,
            }}
          />
        </EditableOverlayPopover.Portal>
      </EditableOverlayPopover.Root>
    );
    const { rerender } = render(renderPopover(true));

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBeDefined();
    });
    const initialEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
    if (!initialEditor) throw new Error("Expected nested editor");

    expect(contentRef.current?.getAttribute("role")).toBe("dialog");
    expect(contentRef.current?.querySelector("h2")?.textContent).toBe("Feedback");

    rerender(renderPopover(false));

    await waitFor(() => {
      expect(initialEditor.isDestroyed).toBe(true);
    });
    expect(contentRef.current).toBeNull();

    rerender(renderPopover(true));

    await waitFor(() => {
      const reopenedEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
      expect(reopenedEditor).toBeDefined();
      expect(reopenedEditor).not.toBe(initialEditor);
      expect(reopenedEditor?.isDestroyed).toBe(false);
    });
    expect(contentRef.current?.getAttribute("role")).toBe("dialog");
    expect(contentRef.current?.querySelector("h2")?.textContent).toBe("Feedback");
  });

  it("mounts an attr target with editor DOM semantics and a body-scoped bubble host", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));
    const write = vi.fn((nextDocument: ScaffoldRichTextDocument) => {
      writeAttrDocument(outerEditor, nextDocument);
    });

    renderOpenPopover(
      <EditableOverlayPopover.Content
        title="Feedback"
        editor={{
          ariaLabel: "Feedback editor",
          bubbleMenuPluginKey: "feedback-editor-bubble",
          className: "custom-editor-class",
          extensions: makeNestedExtensions(),
          fieldKey: "choice:a:feedback",
          mountClassName: "custom-editor-mount",
          outerEditor,
          placeholder: "Add feedback",
          target: {
            kind: "attr",
            read: () => attrDocument(outerEditor),
            write,
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBeDefined();
    });

    const nestedEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
    if (!nestedEditor) throw new Error("Expected nested editor");

    expect(nestedEditor.isFocused).toBe(true);
    expect(nestedEditor.view.dom.getAttribute("aria-label")).toBe("Feedback editor");
    expect(nestedEditor.view.dom.getAttribute("data-placeholder")).toBe("Add feedback");
    expect(nestedEditor.view.dom.getAttribute("data-attr-rich-text-field")).toBe(
      "choice:a:feedback",
    );
    expect(nestedEditor.view.dom.classList.contains("custom-editor-class")).toBe(true);
    const dialog = nestedEditor.view.dom.closest<HTMLElement>('[data-authoring-chrome="popover"]');
    if (!dialog) throw new Error("Expected editable overlay dialog");
    expect(dialog.querySelector(".custom-editor-mount")?.contains(nestedEditor.view.dom)).toBe(
      true,
    );
    const bubbleMenu = screen.getByTestId("rich-text-bubble-menu");
    expect(bubbleMenu.getAttribute("data-plugin-key")).toBe("feedback-editor-bubble");
    expect(dialog.querySelector('[data-slot="popover-surface-body"]')?.contains(bubbleMenu)).toBe(
      true,
    );

    nestedEditor.commands.setTextSelection("feedback".length + 1);
    nestedEditor.commands.insertContent(" saved");

    expect(write).toHaveBeenLastCalledWith(richTextDoc("feedback saved"));
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback saved"));
  });

  it("honors consumer-cancelled open autofocus", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));
    const focusTargetRef = createRef<HTMLButtonElement>();
    const onOpenAutoFocus = vi.fn((event: Event) => {
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
      focusTargetRef.current?.focus();
    });

    renderOpenPopover(
      <EditableOverlayPopover.Content
        title="Feedback"
        headerActions={
          <button ref={focusTargetRef} type="button">
            Keep focus here
          </button>
        }
        onOpenAutoFocus={onOpenAutoFocus}
        editor={{
          ariaLabel: "Feedback editor",
          bubbleMenuPluginKey: "feedback-custom-focus-bubble",
          extensions: makeNestedExtensions(),
          outerEditor,
          target: {
            kind: "attr",
            read: () => attrDocument(outerEditor),
            write: (nextDocument) => writeAttrDocument(outerEditor, nextDocument),
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBeDefined();
    });
    expect(onOpenAutoFocus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(focusTargetRef.current);
  });

  it("resyncs a stable attr target through syncKey without echoing a write", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("before"));
    const extensions = makeNestedExtensions();
    const write = vi.fn((nextDocument: ScaffoldRichTextDocument) => {
      writeAttrDocument(outerEditor, nextDocument);
    });
    const target = {
      kind: "attr" as const,
      read: () => attrDocument(outerEditor),
      write,
    };
    const renderContent = (syncKey: string) => (
      <EditableOverlayPopover.Content
        title="Feedback"
        editor={{
          ariaLabel: "Feedback editor",
          bubbleMenuPluginKey: "feedback-editor-sync-bubble",
          extensions,
          outerEditor,
          syncKey,
          target,
        }}
      />
    );
    const { rerender } = render(openPopover(renderContent("before")));

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor?.getText()).toBe("before");
    });
    const initialEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;

    writeAttrDocument(outerEditor, richTextDoc("outside"));
    rerender(openPopover(renderContent("outside")));

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor?.getText()).toBe("outside");
    });
    expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBe(initialEditor);
    expect(write).not.toHaveBeenCalled();
  });

  it("routes attr-target undo and redo through the outer editor history", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));
    const extensions = makeNestedExtensions();
    const target = {
      kind: "attr" as const,
      read: () => attrDocument(outerEditor),
      write: (nextDocument: ScaffoldRichTextDocument) =>
        writeAttrDocument(outerEditor, nextDocument),
    };
    const renderContent = (syncKey: string) =>
      openPopover(
        <EditableOverlayPopover.Content
          title="Feedback"
          editor={{
            ariaLabel: "Feedback editor",
            bubbleMenuPluginKey: "feedback-editor-history-bubble",
            extensions,
            outerEditor,
            syncKey,
            target,
          }}
        />,
      );
    const { rerender } = render(renderContent("feedback"));

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBeDefined();
    });
    const nestedEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
    if (!nestedEditor) throw new Error("Expected nested editor");

    nestedEditor.commands.setTextSelection("feedback".length + 1);
    nestedEditor.commands.insertContent(" saved");
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback saved"));
    rerender(renderContent("feedback saved"));
    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBe(nestedEditor);
    });

    nestedEditor.view.dom.focus();
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback"));
    rerender(renderContent("feedback"));
    await waitFor(() => {
      expect(nestedEditor.getText()).toBe("feedback");
    });
    expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBe(nestedEditor);

    nestedEditor.view.dom.focus();
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback saved"));
    rerender(renderContent("feedback saved"));
    await waitFor(() => {
      expect(nestedEditor.getText()).toBe("feedback saved");
    });
    expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBe(nestedEditor);
  });

  it("destroys its nested editor when the composed content unmounts", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));
    const { unmount } = renderOpenPopover(
      <EditableOverlayPopover.Content
        title="Feedback"
        editor={{
          ariaLabel: "Feedback editor",
          bubbleMenuPluginKey: "feedback-editor-cleanup-bubble",
          extensions: makeNestedExtensions(),
          outerEditor,
          target: {
            kind: "attr",
            read: () => attrDocument(outerEditor),
            write: (nextDocument) => writeAttrDocument(outerEditor, nextDocument),
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBeDefined();
    });
    const nestedEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
    if (!nestedEditor) throw new Error("Expected nested editor");

    unmount();

    expect(nestedEditor.isDestroyed).toBe(true);
  });

  it("mounts a content target through the same editor configuration", async () => {
    const outerEditor = makeContentOuterEditor("hint");
    const targetPos = findNodePos(outerEditor, "test_overlay_content");
    const targetNode = outerEditor.state.doc.nodeAt(targetPos);
    if (!targetNode) throw new Error("Missing content target");

    renderOpenPopover(
      <EditableOverlayPopover.Content
        title="Hint 1"
        editor={{
          ariaLabel: "Hint 1 editor",
          bubbleMenuPluginKey: "hint-editor-bubble",
          extensions: makeNestedExtensions(),
          outerEditor,
          target: {
            kind: "content",
            getPos: () => targetPos,
            node: targetNode,
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor?.getText()).toBe("hint");
    });
    const nestedEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
    if (!nestedEditor) throw new Error("Expected nested editor");

    nestedEditor.commands.setTextSelection("hint".length + 1);
    nestedEditor.commands.insertContent(" text");

    expect(outerEditor.state.doc.nodeAt(targetPos)?.textContent).toBe("hint text");
  });

  it("resyncs a stable content target from the live outer node without echoing", async () => {
    const outerEditor = makeContentOuterEditor("hint");
    const targetPos = findNodePos(outerEditor, "test_overlay_content");
    const targetNode = outerEditor.state.doc.nodeAt(targetPos);
    if (!targetNode) throw new Error("Missing content target");

    const extensions = makeNestedExtensions();
    const target = {
      kind: "content" as const,
      getPos: () => targetPos,
      node: targetNode,
    };
    const renderContent = (syncKey: string) => (
      <EditableOverlayPopover.Content
        title="Hint 1"
        editor={{
          ariaLabel: "Hint 1 editor",
          bubbleMenuPluginKey: "hint-editor-sync-bubble",
          extensions,
          outerEditor,
          syncKey,
          target,
        }}
      />
    );
    const outerTransaction = vi.fn();
    outerEditor.on("transaction", outerTransaction);
    const { rerender } = render(openPopover(renderContent("hint")));

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor?.getText()).toBe("hint");
    });
    const initialEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;

    outerEditor.commands.setContent(contentOuterDoc("outside"));
    const transactionCountAfterExternalChange = outerTransaction.mock.calls.length;
    rerender(openPopover(renderContent("outside")));

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor?.getText()).toBe("outside");
    });
    expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBe(initialEditor);
    expect(outerTransaction).toHaveBeenCalledTimes(transactionCountAfterExternalChange);
  });
});

function openPopover(content: ReactNode): ReactNode {
  return (
    <EditableOverlayPopover.Root defaultOpen>
      <EditableOverlayPopover.Trigger aria-label="Open overlay" />
      <EditableOverlayPopover.Portal>{content}</EditableOverlayPopover.Portal>
    </EditableOverlayPopover.Root>
  );
}

function renderOpenPopover(content: ReactNode) {
  return render(openPopover(content));
}

function makeNestedExtensions(): Extensions {
  return [StarterKit.configure({ undoRedo: false })];
}

function makeOuterEditor(document: ScaffoldRichTextDocument): Editor {
  const editor = new Editor({
    extensions: [StarterKit, TestOverlayAttrNode],
    content: outerAttrDoc(document),
  });
  outerEditors.push(editor);
  return editor;
}

function makeContentOuterEditor(text: string): Editor {
  const editor = new Editor({
    extensions: [StarterKit, TestOverlayContentNode],
    content: contentOuterDoc(text),
  });
  outerEditors.push(editor);
  return editor;
}

function contentOuterDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "test_overlay_content",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      },
    ],
  };
}

function outerAttrDoc(document: ScaffoldRichTextDocument): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "test_overlay_attr",
        attrs: { document },
        content: [{ type: "paragraph" }],
      },
    ],
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

function attrDocument(editor: Editor): ScaffoldRichTextDocument | null | undefined {
  const pos = findNodePos(editor, "test_overlay_attr");
  return editor.state.doc.nodeAt(pos)?.attrs["document"] as
    | ScaffoldRichTextDocument
    | null
    | undefined;
}

function writeAttrDocument(editor: Editor, document: ScaffoldRichTextDocument): void {
  const pos = findNodePos(editor, "test_overlay_attr");
  const node = editor.state.doc.nodeAt(pos);
  if (!node) throw new Error("Missing attr target");

  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      document,
    }),
  );
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
