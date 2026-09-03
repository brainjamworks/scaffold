import "./styles.css";
import { SurfaceRuntimeFrame } from "../../runtime/views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../../runtime/surface-runtime-view-registry";

export function SlideCoverSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      className="sc-slide-cover-surface-view sc-slide-cover-surface-runtime-view"
    />
  );
}
