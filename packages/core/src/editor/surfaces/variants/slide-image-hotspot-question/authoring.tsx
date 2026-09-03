import "./styles.css";
import type { SurfaceAuthoringViewProps } from "../../shared/surface-view-props";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../authoring/views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideImageHotspotQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-slide-image-hotspot-question-surface-view sc-slide-image-hotspot-question-surface-authoring-view"
    />
  );
}
