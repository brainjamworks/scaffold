import { CheckIcon as Check } from "@phosphor-icons/react";
import {
  RoadmapMilestoneStatusSchema,
  type RoadmapData,
  type RoadmapMilestoneStatus,
} from "@scaffold/contracts";
import { type NodeViewProps } from "@tiptap/react";

import { IconRenderer } from "@/ui/icons/IconRenderer";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { catalogIconValue } from "@/schemas/media/icon";

import { ROADMAP_NODE } from "./content";
import { parseRoadmapData } from "./RoadmapModel";

export const MARKER_ICON_FALLBACK = catalogIconValue("map");

export function roadmapMarkerClassName(status: RoadmapMilestoneStatus): string {
  return `sc-course-roadmap__marker sc-course-roadmap__marker--${status}`;
}

export function courseStateForRoadmapStatus(
  status: RoadmapMilestoneStatus,
): "available" | "completed" | "current" {
  if (status === "done") return "completed";
  if (status === "current") return "current";
  return "available";
}

export function roadmapStatusLabel(status: RoadmapMilestoneStatus, index: number): string {
  return `Milestone ${index} status: ${courseStateForRoadmapStatus(status)}`;
}

export function readRequiredRoadmapMilestoneId(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error("Roadmap milestone node is missing a stable id.");
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
        className="sc-course-roadmap__marker-icon"
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
  return parseRoadmapData(resolveRoadmapDataAttribute(props));
}

export function resolveRoadmapDataAttribute(props: NodeViewProps): unknown {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return undefined;

  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name !== ROADMAP_NODE) continue;
    return parent.attrs["data"];
  }

  return undefined;
}

export function readMilestonePosition(props: NodeViewProps): {
  count: number;
  index: number;
} {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return { count: 1, index: 1 };
  const $pos = props.editor.state.doc.resolve(pos);
  return {
    count: Math.max($pos.parent.childCount, 1),
    index: $pos.index() + 1,
  };
}
