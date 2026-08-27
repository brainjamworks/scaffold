import { AssessmentSlideSurfaceAuthoringFrame } from "../../views/AssessmentSlideSurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../../surface-authoring-view-registry";
import "../../../view/variants/assessment/slide-categorise-question.css";

export function SlideCategoriseQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-slide-categorise-question-surface-view sc-slide-categorise-question-surface-authoring-view"
    />
  );
}
