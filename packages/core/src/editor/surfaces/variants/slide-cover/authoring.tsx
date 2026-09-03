import "./styles.css";
import { SurfaceAuthoringFrame } from "../../authoring/views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../../shared/surface-view-props";

export function SlideCoverSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <SurfaceAuthoringFrame
      {...props}
      className="sc-slide-cover-surface-view sc-slide-cover-surface-authoring-view"
    />
  );
}
