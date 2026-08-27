import "../../../view/variants/assessment/slide-dropdown-question.css";
import type { SurfaceAuthoringViewProps } from "../../surface-authoring-view-registry";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideDropdownQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-dropdown-slide-surface-view sc-dropdown-slide-surface-authoring-view sc-slide-dropdown-question-surface-view sc-slide-dropdown-question-surface-authoring-view"
    />
  );
}
