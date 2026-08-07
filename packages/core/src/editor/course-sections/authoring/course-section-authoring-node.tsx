import { CourseSectionTitleSchema } from "@scaffold/contracts";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { createCourseSectionNode } from "@/document/model/nodes";

export function createCourseSectionAuthoringNode() {
  return createCourseSectionNode({
    addNodeView: () => ReactNodeViewRenderer(CourseSectionAuthoringNodeView),
  });
}

function CourseSectionAuthoringNodeView({ node, selected }: NodeViewProps) {
  const title = CourseSectionTitleSchema.parse(node.attrs["title"]);

  return (
    <NodeViewWrapper
      aria-label={`Course Section: ${title}`}
      className="sc-course-section-authoring"
      contentEditable={false}
      data-course-section-authoring=""
      data-selected={selected ? "true" : undefined}
      role="group"
    >
      <span className="sc-course-section-authoring__kind">Course Section</span>
      <h2 className="sc-course-section-authoring__title">{title}</h2>
    </NodeViewWrapper>
  );
}
