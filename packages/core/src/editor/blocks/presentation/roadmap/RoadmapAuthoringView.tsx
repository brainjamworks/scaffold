import { PlusIcon as Plus } from "@phosphor-icons/react";
import { type NodeViewProps } from "@tiptap/react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { IconPicker } from "@/editor/media/authoring/icon-picker/IconPicker";
import { IconRenderer } from "@/ui/icons/IconRenderer";
import { createStableId } from "@/document/model/identity/stable-ids";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { ROADMAP_MILESTONE_NODE, ROADMAP_NODE, roadmapMilestoneContent } from "./content";
import { RoadmapView } from "./Roadmap";
import { normalizeRoadmapData, parseRoadmapData } from "./RoadmapModel";
import { MARKER_ICON_FALLBACK, readNodePos } from "./roadmap-view-helpers";

export function RoadmapAuthoringView(props: NodeViewProps) {
  const data = parseRoadmapData(props.node.attrs["data"]);
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
  const chrome = data.useIconMarkers ? (
    <div contentEditable={false} className="sc-app-roadmap-icon-control">
      <IconPicker
        value={data.icon}
        fallbackValue={MARKER_ICON_FALLBACK}
        align="end"
        side="bottom"
        onValueChange={(icon) =>
          props.updateAttributes({ data: normalizeRoadmapData({ ...data, icon }) })
        }
        renderTrigger={({ displayValue }) => (
          <button
            type="button"
            aria-label="Choose roadmap marker icon"
            className="sc-app-roadmap-icon-picker"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <IconRenderer
              value={displayValue}
              fallbackValue={MARKER_ICON_FALLBACK}
              className="sc-app-roadmap-icon-picker__glyph"
            />
            <span>Marker icon</span>
          </button>
        )}
      />
    </div>
  ) : null;

  return <RoadmapView props={props} chrome={chrome} footer={footer} />;
}
