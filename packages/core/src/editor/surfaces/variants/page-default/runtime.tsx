import { SurfaceRuntimeFrame } from "../../runtime/views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../../shared/surface-view-props";
import "../../view/variants/page-default.css";

export function PageDefaultSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      className="sc-page-default-surface-view sc-page-default-surface-runtime-view"
    />
  );
}
