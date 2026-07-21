import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import "../../view/variants/slide-module-cover.css";
import "./slide-module-cover.css";

export function SlideModuleCoverSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <SurfaceAuthoringFrame
      {...props}
      className="sc-slide-module-cover-surface-view sc-slide-module-cover-surface-authoring-view"
    />
  );
}
