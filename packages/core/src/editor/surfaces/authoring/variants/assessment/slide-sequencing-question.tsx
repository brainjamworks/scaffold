import { AssessmentSlideSurfaceAuthoringFrame } from "../../views/AssessmentSlideSurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../../surface-authoring-view-registry";
import "../../../view/variants/assessment/slide-sequencing-question.css";

export function SlideSequencingQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-slide-sequencing-question-surface-view sc-slide-sequencing-question-surface-authoring-view"
    />
  );
}
