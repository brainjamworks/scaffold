import { AssessmentSlideSurfaceAuthoringFrame } from "../../views/AssessmentSlideSurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../../surface-authoring-view-registry";
import "../../../view/variants/assessment/slide-matching-question.css";

export function SlideMatchingQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-slide-matching-question-surface-view sc-slide-matching-question-surface-authoring-view"
    />
  );
}
