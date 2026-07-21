import "../../view/variants/slide-module-cover.css";
import { SurfaceRuntimeFrame } from "../views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../surface-runtime-view-registry";

export function SlideModuleCoverSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      className="sc-slide-module-cover-surface-view sc-slide-module-cover-surface-runtime-view"
    />
  );
}
