import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { useRef, type ReactNode } from "react";

import { useScrollableBlockSemanticActivationBinding } from "@/document/authoring/semantic-document/use-scrollable-block-semantic-activation-binding";
import { normalizeBlockFrame } from "@/editor/frame/model/block-frame";

import { ROADMAP_MILESTONE_NODE, ROADMAP_NODE } from "./content";
import { parseRoadmapData } from "./RoadmapModel";
import "./Roadmap.css";

export function RoadmapView({ footer, props }: { footer?: ReactNode; props: NodeViewProps }) {
  const data = parseRoadmapData(props.node.attrs["data"]);
  const blockAlign = resolveBlockAlignment(props.node.attrs["frame"]);
  const sectionRef = useRef<HTMLElement>(null);

  useScrollableBlockSemanticActivationBinding({
    axis: data.orientation,
    childNodeType: ROADMAP_MILESTONE_NODE,
    editor: props.editor,
    getChildElement: (childId) => roadmapMilestoneElementById(sectionRef.current, childId),
    getPos: props.getPos,
    getScrollOwner: () =>
      data.orientation === "horizontal"
        ? sectionRef.current
        : (sectionRef.current?.closest<HTMLElement>(".sc-course-roadmap-node") ??
          sectionRef.current),
    node: props.node,
    ownerId: props.node.attrs["id"],
    ownerNodeType: ROADMAP_NODE,
  });

  return (
    <section
      ref={sectionRef}
      aria-label="Roadmap"
      className="sc-course-roadmap"
      data-block-align={blockAlign}
      data-orientation={data.orientation}
    >
      <div className="sc-course-roadmap__track">
        <NodeViewContent<"div">
          as="div"
          role="list"
          aria-label="Roadmap milestones"
          className="sc-course-roadmap__milestones"
        />
        {footer ?? null}
      </div>
    </section>
  );
}

function roadmapMilestoneElementById(
  section: HTMLElement | null,
  childId: string,
): HTMLElement | null {
  if (!section) return null;
  return (
    Array.from(section.querySelectorAll<HTMLElement>("[data-roadmap-milestone-id]")).find(
      (candidate) => candidate.dataset.roadmapMilestoneId === childId,
    ) ?? null
  );
}

function resolveBlockAlignment(frame: unknown): "center" | "left" | "right" {
  const alignment = normalizeBlockFrame(frame).align;
  if (alignment === "center") return "center";
  if (alignment === "end") return "right";
  return "left";
}
