import "./styles.css";
import { SurfaceRuntimeFrame } from "../../runtime/views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../../shared/surface-view-props";

export function SlideCoverSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      className="sc-slide-cover-surface-view sc-slide-cover-surface-runtime-view"
    />
  );
}
