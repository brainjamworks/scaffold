import "./styles.css";
import type { SurfaceAuthoringViewProps } from "../../shared/surface-view-props";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../authoring/views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideDropdownQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-dropdown-slide-surface-view sc-dropdown-slide-surface-authoring-view sc-slide-dropdown-question-surface-view sc-slide-dropdown-question-surface-authoring-view"
    />
  );
}
