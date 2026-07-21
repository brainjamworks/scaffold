import { InlineMath } from "@tiptap/extension-mathematics";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import katex from "katex";
import { lazy, useMemo, Suspense, useState, type MouseEvent as ReactMouseEvent } from "react";

import { selectNodeAt } from "@/editor/selection/selection-commands";
import { setTextSelectionNearInTransaction } from "@/editor/selection/selection-transactions";
import { sanitizeRenderedStaticRichTextHtml } from "@/editor/rich-text/static/sanitize-html";
import { cn } from "@/lib/cn";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { KATEX_OPTIONS } from "@/editor/rich-text/math/model/katex-options";
import "./math-inline.css";

const LazyMathInlineEditor = lazy(async () => {
  const mod = await import("./MathInlineEditor");
  return { default: mod.MathInlineEditor };
});

/**
 * Inline math node — Tiptap's official InlineMath. Belongs to Tiptap's
 * default `inline` group out of the box, so it flows wherever paragraph
 * is allowed (which is every content group via ExtendedParagraph).
 *
 * Extended with an authoring NodeView so inline math is edited in-place
 * using MathLive rather than through a detached modal.
 *
 * Attrs (owned by the extension): `latex: string`.
 * Default node name: `inlineMath`.
 */

function selectNode(props: ReactNodeViewProps, pos: number) {
  selectNodeAt(props.editor, pos, { scrollIntoView: false });
}

function moveSelectionAfterNode(props: ReactNodeViewProps, pos: number) {
  const after = pos + props.node.nodeSize;
  const tr = props.editor.state.tr;
  if (!setTextSelectionNearInTransaction(tr, after)) return;
  props.editor.view.dispatch(tr);
  props.editor.view.focus();
}

function renderKatexMarkup(latex: string): string {
  try {
    return sanitizeRenderedStaticRichTextHtml(
      katex.renderToString(latex || "\\placeholder{}", KATEX_OPTIONS),
    );
  } catch {
    return escapeHtmlText(latex);
  }
}

function escapeHtmlText(text: string): string {
  if (typeof document === "undefined") return text;
  const element = document.createElement("span");
  element.textContent = text;
  return element.innerHTML;
}

function MathInlineNodeView(props: ReactNodeViewProps) {
  const [focused, setFocused] = useState(false);
  const latex = String(props.node.attrs["latex"] ?? "");
  const pos = typeof props.getPos === "function" ? safeGetPos(props.getPos) : undefined;
  const editable = props.editor.isEditable;
  const editing = editable && (props.selected || focused);
  const katexMarkup = useMemo(() => renderKatexMarkup(latex), [latex]);

  const handleStaticMouseDown = (event: ReactMouseEvent) => {
    if (!editable || typeof pos !== "number") return;
    event.preventDefault();
    selectNode(props, pos);
  };

  const staticMath = (
    <span
      className={cn("tiptap-mathematics-render", editable && "tiptap-mathematics-render--editable")}
      onMouseDown={handleStaticMouseDown}
      dangerouslySetInnerHTML={{ __html: katexMarkup }}
    />
  );

  return (
    <NodeViewWrapper
      as="span"
      data-type="inline-math"
      data-latex={latex}
      contentEditable={false}
      className={cn("sc-inline-math", editing && "sc-inline-math--editing")}
    >
      {editing ? (
        <Suspense fallback={staticMath}>
          <LazyMathInlineEditor
            latex={latex}
            nodeViewProps={props}
            onExit={() => {
              if (typeof pos !== "number") return;
              moveSelectionAfterNode(props, pos);
            }}
            onFocusChange={setFocused}
          />
        </Suspense>
      ) : (
        staticMath
      )}
    </NodeViewWrapper>
  );
}

export const MathInlineNode = InlineMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MathInlineNodeView, { as: "span" });
  },
});
