import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
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
