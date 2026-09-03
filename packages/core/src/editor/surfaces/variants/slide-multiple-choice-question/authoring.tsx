import "../../view/assessment-selectable-choice-surface.css";
import type { SurfaceAuthoringViewProps } from "../../shared/surface-view-props";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../authoring/views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideMultipleChoiceQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-selectable-choice-slide-surface-view sc-selectable-choice-slide-surface-authoring-view sc-slide-multiple-choice-question-surface-view sc-slide-multiple-choice-question-surface-authoring-view"
    />
  );
}
