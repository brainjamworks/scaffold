import "../../../view/variants/assessment/slide-image-hotspot-question.css";
import type { SurfaceAuthoringViewProps } from "../../surface-authoring-view-registry";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideImageHotspotQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-slide-image-hotspot-question-surface-view sc-slide-image-hotspot-question-surface-authoring-view"
    />
  );
}
