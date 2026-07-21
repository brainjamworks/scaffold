import { CheckIcon as Check } from "@phosphor-icons/react";
import {
  RoadmapDataSchema,
  RoadmapMilestoneStatusSchema,
  type RoadmapData,
  type RoadmapMilestoneStatus,
} from "@scaffold/contracts";
import { type NodeViewProps } from "@tiptap/react";

import { IconRenderer } from "@/ui/icons/IconRenderer";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { catalogIconValue } from "@/schemas/media/icon";

import { ROADMAP_MILESTONE_NODE, ROADMAP_NODE, emptyRoadmapData } from "./content";

export const MARKER_ICON_FALLBACK = catalogIconValue("map");

export function tileClassName(status: RoadmapMilestoneStatus): string {
  return `sc-roadmap__tile sc-roadmap__tile--${status}`;
}

export function renderRoadmapTileContent(
  status: RoadmapMilestoneStatus,
  index: number,
  data: RoadmapData,
) {
  if (data.useIconMarkers) {
    return (
      <IconRenderer
        value={data.icon}
        fallbackValue={MARKER_ICON_FALLBACK}
        className="sc-roadmap__tile-icon"
      />
    );
  }

  if (status === "done") return <Check size={18} weight="bold" aria-hidden />;
  return index;
}

export function readMilestoneStatus(node: NodeViewProps["node"]): RoadmapMilestoneStatus {
  const parsed = RoadmapMilestoneStatusSchema.safeParse(node.attrs["status"]);
  return parsed.success ? parsed.data : "upcoming";
}

export function readNodePos(props: NodeViewProps): number | undefined {
  try {
    return props.getPos();
  } catch {
    return undefined;
  }
}

export function resolveRoadmapData(props: NodeViewProps): RoadmapData {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return emptyRoadmapData();

  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name !== ROADMAP_NODE) continue;

    const parsed = RoadmapDataSchema.safeParse(parent.attrs["data"]);
    return parsed.success ? parsed.data : emptyRoadmapData();
  }

  return emptyRoadmapData();
}

export function readMilestonePosition(props: NodeViewProps): {
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
    if (child.type.name !== ROADMAP_MILESTONE_NODE) return;
    count += 1;
    if (parentStart + offset <= pos) {
      index = count;
    }
  });
  return { count: Math.max(count, 1), index };
}
