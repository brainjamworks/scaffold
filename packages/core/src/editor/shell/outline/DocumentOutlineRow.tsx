import {
  CaretRightIcon as CaretRight,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef } from "react";

import type { SemanticItem } from "@/document/model/semantic-document";
import type { SurfaceDestination } from "@/document/model/course-structure";
import { MAX_SEMANTIC_LABEL_LENGTH } from "@/document/model/semantic-document/semantic-labels";
import { Input } from "@/ui/components/Input/Input";
import { iconXs } from "@/ui/tokens/icon-sizes";

import type { DocumentOutlineRowViewport } from "./SemanticSubtreeOutline";
import { DocumentOutlineRowActions } from "./DocumentOutlineRowActions";
import {
  CourseOutlineSurfaceDragHandle,
  CourseOutlineSurfaceDropTarget,
} from "./CourseOutlineSurfaceDragSession";

export interface DocumentOutlineRowProps {
  readonly draft: string;
  readonly editing: boolean;
  readonly expanded: boolean;
  readonly focused: boolean;
  readonly item: SemanticItem;
  readonly level: number;
  readonly renameAvailable: boolean;
  readonly rowActions?: React.ComponentProps<typeof DocumentOutlineRowActions>;
  readonly surfaceDrag?: {
    readonly destinations: readonly SurfaceDestination[];
    readonly handle: boolean;
  };
  readonly selected: boolean;
  readonly viewport: DocumentOutlineRowViewport;
  readonly onActivate: (item: SemanticItem) => void;
  readonly onCancelRename: (item: SemanticItem) => void;
  readonly onCommitRename: (item: SemanticItem) => void;
  readonly onDraftChange: (value: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>, item: SemanticItem) => void;
  readonly onRename: (item: SemanticItem) => void;
  readonly onToggle: (item: SemanticItem, expanded: boolean) => void;
}

export function DocumentOutlineRow({
  draft,
  editing,
  expanded,
  focused,
  item,
  level,
  renameAvailable,
  rowActions,
  surfaceDrag,
  selected,
  viewport,
  onActivate,
  onCancelRename,
  onCommitRename,
  onDraftChange,
  onKeyDown,
  onRename,
  onToggle,
}: DocumentOutlineRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasChildren = item.children.length > 0;
  const expandable = hasChildren || item.kind === "course-section";

  useEffect(() => {
    const row = rowRef.current;
    return row ? viewport.register(item.id, row) : undefined;
  }, [item.id, viewport]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  return (
    <div
      ref={rowRef}
      aria-expanded={expandable ? expanded : undefined}
      aria-label={item.summary ? `${item.label}, ${item.summary}` : item.label}
      aria-level={level}
      aria-selected={selected}
      className="sc-document-outline-row"
      data-kind={item.kind}
      role="treeitem"
      style={{ "--sc-document-outline-level": level } as React.CSSProperties}
      tabIndex={!editing && focused ? 0 : -1}
      onClick={() => {
        if (!editing) onActivate(item);
      }}
      onKeyDown={(event) => onKeyDown(event, item)}
    >
      <span
        aria-hidden="true"
        className="sc-document-outline-indent"
      />
      {expandable ? (
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
        {editing ? (
          <Input
            ref={inputRef}
            aria-label={`Rename ${item.label}`}
            className="sc-document-outline-rename-input"
            maxLength={MAX_SEMANTIC_LABEL_LENGTH}
            value={draft}
            onBlur={() => onCommitRename(item)}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitRename(item);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onCancelRename(item);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <>
            <span className="sc-document-outline-row-label">{item.label}</span>
            {item.summary ? (
              <span className="sc-document-outline-row-summary">{item.summary}</span>
            ) : null}
          </>
        )}
      </span>
      {surfaceDrag?.handle ? (
        <CourseOutlineSurfaceDragHandle label={item.label} surfaceId={item.id} />
      ) : null}
      {renameAvailable && !editing ? (
        <button
          aria-label={`Rename ${item.label}`}
          className="sc-document-outline-rename"
          tabIndex={-1}
          title="Rename outline item (F2)"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRename(item);
          }}
        >
          <PencilSimple aria-hidden size={iconXs} />
        </button>
      ) : null}
      {rowActions && !editing ? <DocumentOutlineRowActions {...rowActions} /> : null}
      {surfaceDrag?.destinations.map((destination) => (
        <CourseOutlineSurfaceDropTarget
          key={JSON.stringify(destination)}
          destination={destination}
          label={item.label}
        />
      ))}
    </div>
  );
}
