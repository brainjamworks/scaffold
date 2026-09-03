import "./styles.css";
import { SurfaceAuthoringFrame } from "../../authoring/views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../../authoring/surface-authoring-view-registry";

export function SlideCoverSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <SurfaceAuthoringFrame
      {...props}
      className="sc-slide-cover-surface-view sc-slide-cover-surface-authoring-view"
    />
  );
}
