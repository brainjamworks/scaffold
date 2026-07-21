import { SurfaceRuntimeFrame } from "../views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../surface-runtime-view-registry";
import "../../view/variants/page-default.css";

export function PageDefaultSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      className="sc-page-default-surface-view sc-page-default-surface-runtime-view"
    />
  );
}
