import "./styles.css";
import type { SurfaceAuthoringViewProps } from "../../shared/surface-view-props";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../authoring/views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideMatchingQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-slide-matching-question-surface-view sc-slide-matching-question-surface-authoring-view"
    />
  );
}
