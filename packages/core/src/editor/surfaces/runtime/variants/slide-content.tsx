import "../../view/variants/slide-content.css";
import { SurfaceRuntimeFrame } from "../views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../surface-runtime-view-registry";

export function SlideContentSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      className="sc-slide-content-surface-view sc-slide-content-surface-runtime-view"
    />
  );
}
