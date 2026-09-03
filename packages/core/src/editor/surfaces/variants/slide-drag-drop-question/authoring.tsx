import "./styles.css";
import type { SurfaceAuthoringViewProps } from "../../shared/surface-view-props";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../authoring/views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideDragDropQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-slide-drag-drop-question-surface-view sc-slide-drag-drop-question-surface-authoring-view"
    />
  );
}
