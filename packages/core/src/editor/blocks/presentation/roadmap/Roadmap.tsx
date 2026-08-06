import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import type { ReactNode } from "react";

import { normalizeBlockFrame } from "@/editor/frame/model/block-frame";

import { parseRoadmapData } from "./RoadmapModel";
import "./Roadmap.css";

export function RoadmapView({ footer, props }: { footer?: ReactNode; props: NodeViewProps }) {
  const data = parseRoadmapData(props.node.attrs["data"]);
  const blockAlign = resolveBlockAlignment(props.node.attrs["frame"]);

  return (
    <section
      aria-label="Roadmap"
      className="sc-course-roadmap"
      data-block-align={blockAlign}
      data-orientation={data.orientation}
    >
      <div className="sc-course-roadmap__track">
        <NodeViewContent<"ol">
          as="ol"
          aria-label="Roadmap milestones"
          className="sc-course-roadmap__milestones"
        />
        {footer ?? null}
      </div>
    </section>
  );
}

function resolveBlockAlignment(frame: unknown): "center" | "left" | "right" {
  const alignment = normalizeBlockFrame(frame).align;
  if (alignment === "center") return "center";
  if (alignment === "end") return "right";
  return "left";
}
