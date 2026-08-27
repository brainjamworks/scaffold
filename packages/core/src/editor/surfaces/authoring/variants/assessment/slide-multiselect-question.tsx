import "../../../view/assessment-selectable-choice-surface.css";
import type { SurfaceAuthoringViewProps } from "../../surface-authoring-view-registry";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideMultiselectQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-selectable-choice-slide-surface-view sc-selectable-choice-slide-surface-authoring-view sc-slide-multiselect-question-surface-view sc-slide-multiselect-question-surface-authoring-view"
    />
  );
}
