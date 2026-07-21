import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { CheckIcon as Check, TrashIcon as Trash } from "@phosphor-icons/react";
import {
  NumberedListMarkerStateSchema,
  type NumberedListData,
  type NumberedListMarkerState,
} from "@scaffold/contracts";
import type { ReactNode } from "react";

import { IconRenderer } from "@/ui/icons/IconRenderer";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { createStableId } from "@/document/model/identity/stable-ids";
import { catalogIconValue, type IconValue } from "@/schemas/media/icon";

import { normalizeNumberedListData, parseNumberedListData } from "./NumberedListModel";
import { NumberedListSection } from "./NumberedListSurface";
import { NUMBERED_LIST_ITEM_NODE, NUMBERED_LIST_NODE, numberedListItemContent } from "./content";
import "./NumberedList.css";

const HEADER_ICON_FALLBACK = catalogIconValue("list-ordered");
const MARKER_STATE_LABELS: Record<NumberedListMarkerState, string> = {
  neutral: "neutral",
  inProgress: "in progress",
  complete: "complete",
};

function headerIconClassName(interactive: boolean): string {
  return `sc-numbered-list__header-icon${
    interactive ? " sc-numbered-list__header-icon--interactive" : ""
  }`;
}

function markerClassName(state: NumberedListMarkerState): string {
  return `sc-numbered-list__marker sc-numbered-list__marker--${state}`;
}

function renderMarkerContent(state: NumberedListMarkerState, index: number) {
  if (state === "complete") {
    return <Check size={16} weight="bold" aria-hidden />;
  }

  if (state === "inProgress") {
    return <span className="sc-numbered-list__marker-dot" aria-hidden />;
  }

  return index;
}

function readMarkerState(node: NodeViewProps["node"]): NumberedListMarkerState {
  const parsed = NumberedListMarkerStateSchema.safeParse(node.attrs["status"]);
  return parsed.success ? parsed.data : "neutral";
}

function nextMarkerState(current: NumberedListMarkerState): NumberedListMarkerState {
  if (current === "neutral") return "inProgress";
  if (current === "inProgress") return "complete";
  return "neutral";
}

export interface NumberedListAddControlProps {
  className: string;
  label: string;
  onClick: () => void;
}

export type NumberedListAddControlRenderer = (props: NumberedListAddControlProps) => ReactNode;

export interface NumberedListViewProps extends NodeViewProps {
  renderAddControl?: NumberedListAddControlRenderer;
}

export function NumberedListView(props: NumberedListViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const data = parseNumberedListData(props.node.attrs["data"]);

  const addItem = () => {
    const pos = readNodePos(props);
    if (!isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== NUMBERED_LIST_NODE) return;

    props.editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, {
        type: NUMBERED_LIST_ITEM_NODE,
        attrs: {
          id: createStableId(),
          status: "neutral",
        },
        content: numberedListItemContent(),
      })
      .run();
  };
  const addGhost = editable
    ? (props.renderAddControl?.({
        className: "sc-numbered-list__add",
        label: "Add item",
        onClick: addItem,
      }) ?? null)
    : null;

  return (
    <NumberedListSection showTitle={data.showTitle} addGhost={addGhost}>
      <NodeViewContent />
    </NumberedListSection>
  );
}

export interface NumberedListIconControlProps {
  className: string;
  fallbackValue: IconValue;
  value: IconValue | null;
  onValueChange: (icon: IconValue | null) => void;
}

export type NumberedListIconControlRenderer = (props: NumberedListIconControlProps) => ReactNode;

export interface NumberedListTitleNodeViewProps extends NodeViewProps {
  renderIconControl?: NumberedListIconControlRenderer;
}

export function NumberedListTitleNodeView(props: NumberedListTitleNodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const data = useEditorState({
    editor: props.editor,
    selector: () => resolveNumberedListData(props),
  });
  const isEmpty = isFieldContentEmpty(props.node);
  const updateData = (patch: Partial<NumberedListData>) => {
    updateParentNumberedListData(props, { ...data, ...patch });
  };

  if (!data.showTitle || (!editable && isEmpty)) {
    return (
      <NodeViewWrapper
        data-slot="numbered-list-title"
        aria-hidden
        className="sc-numbered-list__suppressed"
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-slot="numbered-list-title" className="sc-numbered-list__title">
      {data.showIcon ? (
        editable && props.renderIconControl ? (
          props.renderIconControl({
            className: headerIconClassName(true),
            value: data.icon,
            fallbackValue: HEADER_ICON_FALLBACK,
            onValueChange: (icon) => updateData({ icon }),
          })
        ) : (
          <span contentEditable={false} aria-hidden className={headerIconClassName(false)}>
            <IconRenderer
              value={data.icon}
              fallbackValue={HEADER_ICON_FALLBACK}
              className="sc-numbered-list__header-icon-glyph"
            />
          </span>
        )
      ) : null}
      <div className="sc-numbered-list__title-content">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}

export function NumberedListItemNodeView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const { count, index } = readNumberedListItemPosition(props);
  const markerState = readMarkerState(props.node);
  const canDelete = editable && count > 1;

  const cycleMarkerState = () => {
    if (!editable) return;
    props.updateAttributes({ status: nextMarkerState(markerState) });
  };

  const deleteItem = () => {
    const pos = readNodePos(props);
    if (!canDelete || !isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== NUMBERED_LIST_ITEM_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper
      data-node="numbered-list-item"
      role="listitem"
      className="sc-numbered-list__item"
    >
      <div className="sc-numbered-list__item-shell">
        {editable ? (
          <button
            type="button"
            contentEditable={false}
            data-status={markerState}
            aria-label={`Set item ${index} status. Current: ${MARKER_STATE_LABELS[markerState]}.`}
            onClick={cycleMarkerState}
            onMouseDown={(event) => event.preventDefault()}
            className={markerClassName(markerState)}
          >
            {renderMarkerContent(markerState, index)}
          </button>
        ) : (
          <span
            contentEditable={false}
            aria-hidden
            data-status={markerState}
            className={markerClassName(markerState)}
          >
            {renderMarkerContent(markerState, index)}
          </span>
        )}
        <div className="sc-numbered-list__item-content">
          <NodeViewContent />
        </div>
        {editable ? (
          <button
            type="button"
            contentEditable={false}
            disabled={!canDelete}
            aria-label={`Delete numbered list item ${index}`}
            onClick={deleteItem}
            className="sc-numbered-list__delete"
          >
            <Trash size={14} aria-hidden />
          </button>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}

function readNodePos(props: NodeViewProps): number | undefined {
  try {
    return props.getPos();
  } catch {
    return undefined;
  }
}

function resolveNumberedListData(props: NodeViewProps) {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) {
    return parseNumberedListData(undefined);
  }

  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name === NUMBERED_LIST_NODE) {
      return parseNumberedListData(parent.attrs["data"]);
    }
  }

  return parseNumberedListData(undefined);
}

function updateParentNumberedListData(props: NodeViewProps, next: Partial<NumberedListData>) {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return;

  let parsed: NumberedListData;
  try {
    parsed = normalizeNumberedListData(next);
  } catch {
    return;
  }

  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name !== NUMBERED_LIST_NODE) continue;

    const parentPos = depth === 0 ? 0 : $pos.before(depth);
    const tr = props.editor.state.tr.setNodeMarkup(parentPos, undefined, {
      ...parent.attrs,
      data: parsed,
    });
    props.editor.view.dispatch(tr);
    return;
  }
}

function readNumberedListItemPosition(props: NodeViewProps): {
  count: number;
  index: number;
} {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return { count: 1, index: 1 };

  const $pos = props.editor.state.doc.resolve(pos);
  const parent = $pos.parent;
  const parentStart = $pos.start();
  let count = 0;
  let index = 1;

  parent.forEach((child, offset) => {
    if (child.type.name !== NUMBERED_LIST_ITEM_NODE) return;
    count += 1;
    if (parentStart + offset <= pos) {
      index = count;
    }
  });

  return { count: Math.max(count, 1), index };
}
