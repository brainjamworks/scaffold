import "./styles.css";
import type { SurfaceAuthoringViewProps } from "../../authoring/surface-authoring-view-registry";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../authoring/views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideCategoriseQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-slide-categorise-question-surface-view sc-slide-categorise-question-surface-authoring-view"
    />
  );
}
