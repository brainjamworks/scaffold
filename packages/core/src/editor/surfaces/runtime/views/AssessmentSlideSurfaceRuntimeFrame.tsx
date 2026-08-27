import type { ReactNode } from "react";

import "../../view/assessment-slide-surface.css";
import type { SurfaceRuntimeViewProps } from "../surface-runtime-view-registry";
import { SurfaceRuntimeFrame } from "./SurfaceRuntimeFrame";

interface AssessmentSlideSurfaceRuntimeFrameProps extends SurfaceRuntimeViewProps {
  children?: ReactNode;
  variantClassName: string;
}

export function AssessmentSlideSurfaceRuntimeFrame({
  children,
  variantClassName,
  ...props
}: AssessmentSlideSurfaceRuntimeFrameProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      className={[
        "sc-assessment-slide-surface-view",
        "sc-assessment-slide-surface-runtime-view",
        variantClassName,
      ].join(" ")}
    >
      {children}
    </SurfaceRuntimeFrame>
  );
}
