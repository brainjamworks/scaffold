import { useMemo } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { ImageHotspotCourseInteraction } from "@/editor/assessment/image-hotspot/course-interaction";
import {
  createImageHotspotCanvasNode,
  parseImageHotspotCanvasData,
} from "@/editor/assessment/image-hotspot/image-hotspot-canvas-shared";
import {
  findAncestorAssessmentBlockId,
  isInsideAssessmentContainer,
} from "@/editor/assessment/shared/model/assessment-prosemirror";
import { resolveAssessmentAttrParent } from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { resolveActiveBoundedPlacement } from "@/editor/bounded-containers/model/bounded-container-placement";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

export function ImageHotspotCanvasRuntimeNodeView(props: NodeViewProps) {
  const rawPos = safeGetPos(props.getPos);
  const pos = typeof rawPos === "number" ? rawPos : null;
  const data = useMemo(
    () => parseImageHotspotCanvasData(props.node.attrs["data"]),
    [props.node.attrs],
  );
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, pos ?? undefined, [
    "image_hotspot",
    "surface_image_hotspot_question",
  ]);
  const surfaceOwned = isInsideAssessmentContainer(
    props.editor,
    pos ?? undefined,
    "surface_image_hotspot_question",
  );
  const boundedFillActive = pos !== null && isImageHotspotBoundedFillActive(props.editor, pos);

  if (surfaceOwned) {
    return (
      <NodeViewWrapper
        data-node="image-hotspot-canvas"
        data-surface-owned-image-hotspot-canvas=""
      />
    );
  }

  return (
    <NodeViewWrapper data-node="image-hotspot-canvas">
      <ImageHotspotCourseInteraction
        assessmentTargetId={authoredBlockId}
        data={data}
        fitStrategy={boundedFillActive ? "contain" : "width"}
      />
    </NodeViewWrapper>
  );
}

function isImageHotspotBoundedFillActive(
  editor: NodeViewProps["editor"],
  canvasPos: number,
): boolean {
  const parent = resolveAssessmentAttrParent(editor, canvasPos, ["image_hotspot"]);
  if (!parent) return false;
  const capabilities = getScaffoldCapabilitiesForEditor(editor);
  return (
    resolveActiveBoundedPlacement({
      blockDefinitions: capabilities.blocks.registry,
      capability: "fill",
      doc: editor.state.doc,
      layoutDefinitions: capabilities.layouts.registry,
      pos: parent.pos,
    }) === "fill"
  );
}
export const ImageHotspotCanvasRuntimeNode = createImageHotspotCanvasNode({
  addNodeView: () => ReactNodeViewRenderer(ImageHotspotCanvasRuntimeNodeView),
});
