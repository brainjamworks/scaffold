import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { CheckIcon as Check } from "@phosphor-icons/react";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { useLearnerActivityRuntime } from "@/runtime/learner-activity";

import { CHECKLIST_ITEM_NODE, CHECKLIST_NODE } from "./content";
import {
  CHECKLIST_INITIAL_ACTIVITY,
  readChecklistActivityData,
  readNodeId,
} from "./runtime-shared";

export function ChecklistItemRuntimeNodeView(props: NodeViewProps) {
  const itemId = readNodeId(props.node);
  const blockId = readParentBlockId(props);
  const siblingIds = readSiblingIds(props);

  const activity = useLearnerActivityRuntime({
    activityKind: "checklist",
    blockId,
    initial: CHECKLIST_INITIAL_ACTIVITY,
  });
  const checkedMap = readChecklistActivityData(activity.activity?.data).checked;
  const checked = itemId ? Boolean(checkedMap[itemId]) : false;

  const handleToggle = () => {
    if (!blockId || !itemId) return;
    const nextChecked = {
      ...checkedMap,
      [itemId]: !checked,
    };
    const completed = siblingIds.length > 0 && siblingIds.every((id) => nextChecked[id]);
    activity.setData({ checked: nextChecked });
    activity.setCompleted(completed);
  };

  return (
    <NodeViewWrapper
      data-node="checklist-item"
      data-checked={checked ? "true" : "false"}
      role="listitem"
      className="sc-checklist-item"
    >
      <div className="sc-checklist-item__shell">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          contentEditable={false}
          onClick={handleToggle}
          onMouseDown={(event) => event.preventDefault()}
          className="sc-checklist-item__checkbox"
          aria-label={checked ? "Mark item as not complete" : "Mark item as complete"}
        >
          {checked ? <Check size={12} weight="bold" aria-hidden /> : null}
        </button>
        <div className="sc-checklist-item__text">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const ChecklistItemRuntimeNode = Node.create({
  name: CHECKLIST_ITEM_NODE,
  ...fieldContainerSpec(),

  addAttributes() {
    return {
      id: stableNodeIdAttribute(),
    };
  },

  parseHTML() {
    return [{ tag: 'li[data-node="checklist-item"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, {
        "data-node": "checklist-item",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChecklistItemRuntimeNodeView);
  },
});

function readNodePos(props: NodeViewProps): number | undefined {
  try {
    return props.getPos();
  } catch {
    return undefined;
  }
}

function readParentBlockId(props: NodeViewProps): string | null {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return null;
  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name !== CHECKLIST_NODE) continue;
    const id = parent.attrs["id"];
    return typeof id === "string" && id.length > 0 ? id : null;
  }
  return null;
}

function readSiblingIds(props: NodeViewProps): string[] {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return [];
  const $pos = props.editor.state.doc.resolve(pos);
  const ids: string[] = [];
  $pos.parent.forEach((child) => {
    if (child.type.name !== CHECKLIST_ITEM_NODE) return;
    const id = child.attrs["id"];
    if (typeof id === "string" && id.length > 0) ids.push(id);
  });
  return ids;
}
