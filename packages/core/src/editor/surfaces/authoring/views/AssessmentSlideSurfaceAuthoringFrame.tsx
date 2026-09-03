import "../../view/assessment-slide-surface.css";
import type { ReactNode } from "react";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import { SurfaceAuthoringFrame } from "./SurfaceAuthoringFrame";

interface AssessmentSlideSurfaceAuthoringFrameProps extends SurfaceAuthoringViewProps {
  attributes?: Record<string, string | undefined>;
  children?: ReactNode;
  variantClassName: string;
}

export function AssessmentSlideSurfaceAuthoringFrame({
  children,
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
    >
      {children}
    </SurfaceAuthoringFrame>
  );
}
