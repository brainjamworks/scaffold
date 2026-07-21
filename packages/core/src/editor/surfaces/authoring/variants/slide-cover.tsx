import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import "../../view/variants/slide-cover.css";
import "./slide-cover.css";

export function SlideCoverSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <SurfaceAuthoringFrame
      {...props}
      className="sc-slide-cover-surface-view sc-slide-cover-surface-authoring-view"
    />
  );
}
