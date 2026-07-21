import { SurfaceRuntimeFrame } from "../views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../surface-runtime-view-registry";
import "../../view/variants/slide-cover.css";

export function SlideCoverSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      className="sc-slide-cover-surface-view sc-slide-cover-surface-runtime-view"
    />
  );
}
