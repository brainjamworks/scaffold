import type { DocumentTreeItem } from "@/document/model/document-tree";
import {
  useInteractionDragSource,
  type InteractionDragSourceResult,
} from "@/editor/interactions/drag/react/use-interaction-drag-source";
import { useState, type FormEvent } from "react";
import {
  CourseOutlineSurfaceDragHandle,
  type CourseOutlineSurfaceDragData,
} from "../CourseOutlineSurfaceDragSession";
import { SurfaceActions } from "./SurfaceActions";

interface SurfaceCardProps {
  readonly item: DocumentTreeItem;
  readonly selected: boolean;
  readonly registerSelectionControl: (element: HTMLButtonElement | null) => void;
  readonly onSelect: (item: DocumentTreeItem) => void;
  readonly onShowStructure: (item: DocumentTreeItem) => void;
  readonly onDelete?: (item: DocumentTreeItem) => void;
  readonly onDuplicate?: (item: DocumentTreeItem) => void;
  readonly onRename?: (item: DocumentTreeItem, value: string) => boolean;
  readonly onSettings?: (item: DocumentTreeItem) => void;
  readonly draggable?: boolean;
}

export function SurfaceCard(props: SurfaceCardProps) {
  return props.draggable ? <DraggableSurfaceCard {...props} /> : <SurfaceCardContent {...props} />;
}

function DraggableSurfaceCard(props: SurfaceCardProps) {
  const drag = useInteractionDragSource<CourseOutlineSurfaceDragData>({
    data: { surfaceId: props.item.id, label: props.item.label },
    id: `course-outline-surface:${props.item.id}`,
    keyboardAxis: "vertical",
    label: `Move Surface ${props.item.label}`,
  });
  return <SurfaceCardContent {...props} drag={drag} />;
}

function SurfaceCardContent({
  item,
  selected,
  registerSelectionControl,
  onSelect,
  onShowStructure,
  onDelete,
  onDuplicate,
  onRename,
  onSettings,
  drag,
}: SurfaceCardProps & {
  readonly drag?: InteractionDragSourceResult;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || !onRename?.(item, value)) return;
    setEditing(false);
  };

  return (
    <article
      ref={drag?.sourceRef}
      className="sc-document-navigator-surface-card"
      data-document-navigator-surface-card-id={item.id}
      data-course-outline-motion-id={`surface:${item.id}`}
      data-interaction-drag-placeholder={drag?.isPlaceholder ? "" : undefined}
      data-selected={selected ? "true" : undefined}
    >
      {drag ? (
        <CourseOutlineSurfaceDragHandle
          handleRef={drag.handleRef}
          isDragging={drag.isDragging}
          label={item.label}
          surfaceId={item.id}
        />
      ) : null}
      <button
        ref={registerSelectionControl}
        aria-label={`Select Surface ${item.label}`}
        aria-pressed={selected}
        className="sc-document-navigator-surface-card-selection"
        type="button"
        onClick={() => onSelect(item)}
      >
        <span
          aria-hidden="true"
          className="sc-document-navigator-surface-placeholder"
          data-testid="document-navigator-surface-placeholder"
        />
      </button>
      <div className="sc-document-navigator-surface-meta">
        {editing ? (
          <form className="sc-document-navigator-surface-rename" onSubmit={submitRename}>
            <label
              className="sc-document-outline-status--visually-hidden"
              htmlFor={`surface-name-${item.id}`}
            >
              Surface name
            </label>
            <input
              id={`surface-name-${item.id}`}
              autoFocus
              maxLength={200}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setDraft(item.label);
                  setEditing(false);
                }
              }}
            />
            <button type="submit">Save</button>
          </form>
        ) : (
          <span className="sc-document-navigator-surface-label" title={item.label}>
            {item.label}
          </span>
        )}
      </div>
      <SurfaceActions
        item={item}
        {...(onDelete ? { onDelete } : {})}
        {...(onDuplicate ? { onDuplicate } : {})}
        {...(onRename
          ? {
              onRename: () => {
                setDraft(item.label);
                setEditing(true);
              },
            }
          : {})}
        {...(onSettings ? { onSettings } : {})}
        onShowStructure={onShowStructure}
      />
    </article>
  );
}
