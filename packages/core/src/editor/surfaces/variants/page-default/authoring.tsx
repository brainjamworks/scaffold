import { SurfaceAuthoringFrame } from "../../authoring/views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../../shared/surface-view-props";
import "../../view/variants/page-default.css";
import "./page-default.css";

export function PageDefaultSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  return (
    <SurfaceAuthoringFrame
      {...props}
      className="sc-page-default-surface-view sc-page-default-surface-authoring-view"
    />
  );
}
