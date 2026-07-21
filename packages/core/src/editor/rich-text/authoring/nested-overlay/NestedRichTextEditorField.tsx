import { useCallback, useEffect } from "react";
import type { Editor, Extensions } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";

import type { NestedRichTextEditorTarget } from "@/editor/prosemirror/nested-rich-text-editor";
import { cn } from "@/lib/cn";

import { NestedRichTextBubbleMenuHost } from "./NestedRichTextBubbleMenuHost";
import { useNestedRichTextEditor } from "./use-nested-rich-text-editor";

import "./nested-rich-text-editor-field.css";

export interface NestedRichTextEditorFieldConfig {
  ariaLabel: string;
  ariaLabelledBy?: string;
  bubbleMenuPluginKey: string;
  extensions: Extensions;
  outerEditor: Editor;
  target: NestedRichTextEditorTarget | null | undefined;
  className?: string;
  fieldKey?: string;
  mountClassName?: string;
  placeholder?: string;
  syncKey?: unknown;
}

export interface NestedRichTextEditorFieldProps extends NestedRichTextEditorFieldConfig {
  ariaMultiline?: boolean;
  autoFocus?: boolean;
  bubbleMenuAppendTo?: () => HTMLElement | null;
}

export function NestedRichTextEditorField({
  ariaLabel,
  ariaLabelledBy,
  ariaMultiline = false,
  autoFocus = false,
  bubbleMenuAppendTo,
  bubbleMenuPluginKey,
  className,
  extensions,
  fieldKey,
  mountClassName,
  outerEditor,
  placeholder,
  syncKey,
  target,
}: NestedRichTextEditorFieldProps) {
  const {
    appendBubbleMenuTo: appendBubbleMenuToFallback,
    editor,
    syncFromTarget,
  } = useNestedRichTextEditor({
    editable: true,
    extensions,
    outerEditor,
    target,
  });
  const appendBubbleMenuTo = useCallback(
    () => bubbleMenuAppendTo?.() ?? appendBubbleMenuToFallback(),
    [appendBubbleMenuToFallback, bubbleMenuAppendTo],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed || !target) return;

    if (target.kind === "attr") {
      syncFromTarget({ kind: "attr" });
      return;
    }

    const node = resolveLiveContentTargetNode(outerEditor, target);
    if (node) syncFromTarget({ kind: "content", node });
  }, [editor, outerEditor, syncFromTarget, syncKey, target]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const editorDom = editor.view.dom;
    const editorClassNames = className?.split(/\s+/).filter(Boolean) ?? [];
    editorDom.setAttribute("aria-label", ariaLabel);
    if (ariaLabelledBy) {
      editorDom.setAttribute("aria-labelledby", ariaLabelledBy);
    }
    if (ariaMultiline) {
      editorDom.setAttribute("aria-multiline", "true");
    }
    editorDom.setAttribute("data-placeholder", placeholder ?? "");
    if (fieldKey) {
      editorDom.setAttribute("data-attr-rich-text-field", fieldKey);
    }
    editorDom.classList.add("sc-nested-rich-text-editor-field__editor", ...editorClassNames);

    return () => {
      editorDom.removeAttribute("aria-label");
      editorDom.removeAttribute("aria-labelledby");
      editorDom.removeAttribute("aria-multiline");
      editorDom.removeAttribute("data-placeholder");
      editorDom.removeAttribute("data-attr-rich-text-field");
      editorDom.classList.remove("sc-nested-rich-text-editor-field__editor", ...editorClassNames);
    };
  }, [ariaLabel, ariaLabelledBy, ariaMultiline, className, editor, fieldKey, placeholder]);

  useEffect(() => {
    if (!autoFocus || !editor || editor.isDestroyed) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!editor.isDestroyed) editor.commands.focus("end");
    });

    return () => {
      cancelled = true;
    };
  }, [autoFocus, editor]);

  return (
    <>
      <EditorContent
        editor={editor}
        className={cn("sc-nested-rich-text-editor-field", mountClassName)}
        data-scaffold-nested-rich-text-editor-field=""
      />
      <NestedRichTextBubbleMenuHost
        appendTo={appendBubbleMenuTo}
        editor={editor}
        pluginKey={bubbleMenuPluginKey}
      />
    </>
  );
}

function resolveLiveContentTargetNode(
  outerEditor: Editor,
  target: Extract<NestedRichTextEditorTarget, { kind: "content" }>,
) {
  try {
    const pos = target.getPos();
    return typeof pos === "number" ? outerEditor.state.doc.nodeAt(pos) : null;
  } catch {
    return null;
  }
}
