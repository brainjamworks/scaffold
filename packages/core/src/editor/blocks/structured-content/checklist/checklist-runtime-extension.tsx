import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";
import { useLearnerActivityRuntime } from "@/runtime/learner-activity";

import {
  countChecklistCompleted,
  countChecklistItems,
  parseChecklistData,
  readNodeId,
} from "./ChecklistModel";
import { ChecklistSection } from "./ChecklistSurface";
import { checklistBlockDefinition } from "./checklist-definition";
import { createChecklistNode } from "./node";
import { ChecklistItemRuntimeNode } from "./checklist-item-runtime";
import { CHECKLIST_INITIAL_ACTIVITY, readChecklistActivityData } from "./runtime-shared";
import "./Checklist.css";

function ChecklistRuntimeView(props: NodeViewProps) {
  const data = parseChecklistData(props.node.attrs["data"]);
  const blockId = readNodeId(props.node);
  const total = countChecklistItems(props.node);

  const activity = useLearnerActivityRuntime({
    activityKind: "checklist",
    blockId,
    initial: CHECKLIST_INITIAL_ACTIVITY,
  });
  const checkedForBlock = readChecklistActivityData(activity.activity?.data).checked;
  const completedCount = countChecklistCompleted(props.node, checkedForBlock);
  const showProgress = data.showProgress && total > 0;
  const showReset = data.showReset && blockId !== null && completedCount > 0;

  return (
    <ChecklistSection
      progress={showProgress ? { completed: completedCount, total } : null}
      resetAction={
        showReset && blockId
          ? {
              label: "Reset checklist",
              onClick: () => {
                activity.setData({ checked: {} });
                activity.setCompleted(false);
              },
              text: "Reset",
            }
          : null
      }
    >
      <NodeViewContent />
    </ChecklistSection>
  );
}

const ChecklistRuntimeRootNode = createChecklistNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-checklist",
      definition: checklistBlockDefinition,
      view: { component: ChecklistRuntimeView },
    }),
});

export const ChecklistRuntimeExtension = Extension.create({
  name: "checklist_runtime_bundle",

  addExtensions() {
    return [ChecklistItemRuntimeNode, ChecklistRuntimeRootNode];
  },
});
