import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { ReactNode } from "react";
import { ComparisonDataSchema, type ComparisonData } from "@scaffold/contracts";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { COMPARISON_NODE, emptyComparisonData } from "./content";

import "./Comparison.css";

interface ComparisonSurfaceProps {
  children: ReactNode;
  comparisonId: string;
  options: ComparisonData;
  trailing?: ReactNode;
}

export function ComparisonView(props: NodeViewProps) {
  return (
    <ComparisonSurface
      comparisonId={readComparisonId(props.node.attrs["id"])}
      options={parseComparisonData(props.node.attrs["data"])}
    >
      <NodeViewContent />
    </ComparisonSurface>
  );
}

export function ComparisonRowView() {
  return (
    <ComparisonRow>
      <NodeViewContent />
    </ComparisonRow>
  );
}

export function ComparisonCellView(props: NodeViewProps) {
  const side = props.node.attrs["side"] === "right" ? "right" : "left";
  const label = useEditorState({
    editor: props.editor,
    selector: () => readCellComparisonContext(props).options[`${side}Label`],
  });
  const comparisonId = useEditorState({
    editor: props.editor,
    selector: () => readCellComparisonContext(props).comparisonId,
  });

  return (
    <NodeViewWrapper
      as="div"
      role="cell"
      aria-labelledby={comparisonHeaderId(comparisonId, side)}
      data-node="comparison-cell"
      data-comparison-side={side}
      className={`sc-course-comparison__cell sc-course-comparison__cell--${side}`}
    >
      <span contentEditable={false} aria-hidden className="sc-course-comparison__cell-label">
        {label}
      </span>
      <ComparisonCell>
        <NodeViewContent />
      </ComparisonCell>
    </NodeViewWrapper>
  );
}

export function ComparisonSurface({
  children,
  comparisonId,
  options,
  trailing,
}: ComparisonSurfaceProps) {
  return (
    <div
      role="table"
      aria-label={`${options.leftLabel} compared with ${options.rightLabel}`}
      className="sc-course-comparison__surface"
    >
      <div role="rowgroup" contentEditable={false} className="sc-course-comparison__header">
        <div role="row" className="sc-course-comparison__header-row">
          <span
            id={comparisonHeaderId(comparisonId, "left")}
            role="columnheader"
            className="sc-course-comparison__header-cell"
          >
            {options.leftLabel}
          </span>
          <span
            id={comparisonHeaderId(comparisonId, "right")}
            role="columnheader"
            className="sc-course-comparison__header-cell"
          >
            {options.rightLabel}
          </span>
        </div>
      </div>
      <div role="rowgroup" className="sc-course-comparison__body">
        {children}
      </div>
      {trailing ?? null}
    </div>
  );
}

export function ComparisonRow({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <NodeViewWrapper
      as="div"
      role="row"
      data-node="comparison-row"
      className="sc-course-comparison__row"
    >
      {children}
      {trailing ?? null}
    </NodeViewWrapper>
  );
}

export function ComparisonCell({ children }: { children: ReactNode }) {
  return <div className="sc-course-comparison__cell-content">{children}</div>;
}

export function parseComparisonData(value: unknown): ComparisonData {
  const parsed = ComparisonDataSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyComparisonData();
}

export function comparisonHeaderId(comparisonId: string, side: "left" | "right"): string {
  const safeId = comparisonId.replace(/[^0-9A-Z_a-z-]/g, "-") || "comparison";
  return `sc-course-comparison-${safeId}-${side}-header`;
}

function readCellComparisonContext(props: NodeViewProps): {
  comparisonId: string;
  options: ComparisonData;
} {
  const pos = readNodePos(props);
  if (pos !== null) {
    try {
      const $pos = props.editor.state.doc.resolve(pos);
      for (let depth = $pos.depth; depth >= 0; depth -= 1) {
        const ancestor = $pos.node(depth);
        if (ancestor.type.name === COMPARISON_NODE) {
          return {
            comparisonId: readComparisonId(ancestor.attrs["id"]),
            options: parseComparisonData(ancestor.attrs["data"]),
          };
        }
      }
    } catch {
      // Fall through to schema defaults for malformed or detached node views.
    }
  }

  return { comparisonId: "comparison", options: emptyComparisonData() };
}

function readNodePos(props: NodeViewProps): number | null {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return null;
    return typeof pos === "number" ? pos : null;
  } catch {
    return null;
  }
}

function readComparisonId(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "comparison";
}
