import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import "../../view/variants/slide-content.css";

export function SlideContentSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <SurfaceAuthoringFrame
      {...props}
      className="sc-slide-content-surface-view sc-slide-content-surface-authoring-view"
    />
  );
}
