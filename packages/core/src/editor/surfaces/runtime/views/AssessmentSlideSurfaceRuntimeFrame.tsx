import type { ReactNode, RefObject } from "react";

import "../../view/assessment-slide-surface.css";
import type { SurfaceRuntimeViewProps } from "../../shared/surface-view-props";
import { SurfaceRuntimeFrame } from "./SurfaceRuntimeFrame";

interface AssessmentSlideSurfaceRuntimeFrameProps extends SurfaceRuntimeViewProps {
  attributes?: Record<string, string | undefined>;
  children?: ReactNode;
  surfaceRef?: RefObject<HTMLDivElement | null>;
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
