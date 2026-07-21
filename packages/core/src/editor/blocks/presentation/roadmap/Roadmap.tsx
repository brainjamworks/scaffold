import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import type { ReactNode } from "react";

import { parseRoadmapData } from "./RoadmapModel";
import "./Roadmap.css";

export function RoadmapView({ addGhost, props }: { addGhost?: ReactNode; props: NodeViewProps }) {
  const data = parseRoadmapData(props.node.attrs["data"]);

  return (
    <div data-orientation={data.orientation} className="sc-roadmap">
      <RoadmapSection addGhost={addGhost}>
        <NodeViewContent />
      </RoadmapSection>
    </div>
  );
}

function RoadmapSection({ addGhost, children }: { addGhost?: ReactNode; children: ReactNode }) {
  return (
    <section className="sc-roadmap__section" aria-label="Roadmap">
      <div className="sc-roadmap__track">
        {children}
        {addGhost ?? null}
      </div>
    </section>
  );
}
