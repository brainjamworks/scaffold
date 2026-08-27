import "../../view/assessment-slide-surface.css";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import { SurfaceAuthoringFrame } from "./SurfaceAuthoringFrame";

interface AssessmentSlideSurfaceAuthoringFrameProps extends SurfaceAuthoringViewProps {
  variantClassName: string;
}

export function AssessmentSlideSurfaceAuthoringFrame({
  variantClassName,
  ...props
}: AssessmentSlideSurfaceAuthoringFrameProps) {
  return (
    <SurfaceAuthoringFrame
      {...props}
      className={[
        "sc-assessment-slide-surface-view",
        "sc-assessment-slide-surface-authoring-view",
        variantClassName,
      ].join(" ")}
    />
  );
}
