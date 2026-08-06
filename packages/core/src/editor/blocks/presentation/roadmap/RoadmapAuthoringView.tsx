import { PlusIcon as Plus } from "@phosphor-icons/react";
import { type NodeViewProps } from "@tiptap/react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { createStableId } from "@/document/model/identity/stable-ids";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { ROADMAP_MILESTONE_NODE, ROADMAP_NODE, roadmapMilestoneContent } from "./content";
import { RoadmapView } from "./Roadmap";
import { readNodePos } from "./roadmap-view-helpers";

export function RoadmapAuthoringView(props: NodeViewProps) {
  const addMilestone = () => {
    const pos = readNodePos(props);
    if (!isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== ROADMAP_NODE) return;

    props.editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, {
        type: ROADMAP_MILESTONE_NODE,
        attrs: {
          id: createStableId(),
          status: "upcoming",
        },
        content: roadmapMilestoneContent(),
      })
      .run();
  };

  const footer = (
    <BlockAddGhost
      label="Add milestone"
      presentation="item"
      onClick={addMilestone}
      contentEditable={false}
      className="sc-app-roadmap-add"
    >
      <span aria-hidden className="sc-app-roadmap-add__marker">
        <Plus size={18} weight="bold" />
      </span>
      <span>Add milestone</span>
    </BlockAddGhost>
  );

  return <RoadmapView props={props} footer={footer} />;
}
