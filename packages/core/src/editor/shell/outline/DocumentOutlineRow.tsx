import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef } from "react";

import type { SemanticItem } from "@/document/model/semantic-document";
import { iconXs } from "@/ui/tokens/icon-sizes";

import type { DocumentOutlineRowViewport } from "./DocumentOutline";

export interface DocumentOutlineRowProps {
  readonly expanded: boolean;
  readonly focused: boolean;
  readonly item: SemanticItem;
  readonly level: number;
  readonly selected: boolean;
  readonly viewport: DocumentOutlineRowViewport;
  readonly onActivate: (item: SemanticItem) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>, item: SemanticItem) => void;
  readonly onToggle: (item: SemanticItem, expanded: boolean) => void;
}

export function DocumentOutlineRow({
  expanded,
  focused,
  item,
  level,
  selected,
  viewport,
  onActivate,
  onKeyDown,
  onToggle,
}: DocumentOutlineRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const hasChildren = item.children.length > 0;

  useEffect(() => {
    const row = rowRef.current;
    return row ? viewport.register(item.id, row) : undefined;
  }, [item.id, viewport]);

  useEffect(() => {
    if (selected) viewport.reveal(item.id);
  }, [item.id, selected, viewport]);

  return (
    <div
      ref={rowRef}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-label={item.summary ? `${item.label}, ${item.summary}` : item.label}
      aria-level={level}
      aria-selected={selected}
      className="sc-document-outline-row"
      data-kind={item.kind}
      role="treeitem"
      tabIndex={focused ? 0 : -1}
      onClick={() => onActivate(item)}
      onKeyDown={(event) => onKeyDown(event, item)}
    >
      <span
        aria-hidden="true"
        className="sc-document-outline-indent"
        style={{ "--sc-document-outline-level": level } as React.CSSProperties}
      />
      {hasChildren ? (
        <button
          aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
          className="sc-document-outline-disclosure"
          tabIndex={-1}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(item, !expanded);
          }}
        >
          <CaretRight aria-hidden size={iconXs} weight="bold" />
        </button>
      ) : (
        <span aria-hidden="true" className="sc-document-outline-disclosure-placeholder" />
      )}
      <span className="sc-document-outline-row-copy">
        <span className="sc-document-outline-row-label">{item.label}</span>
        {item.summary ? (
          <span className="sc-document-outline-row-summary">{item.summary}</span>
        ) : null}
      </span>
    </div>
  );
}
