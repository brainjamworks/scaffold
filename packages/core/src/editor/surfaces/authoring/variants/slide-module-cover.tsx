import { SurfaceAuthoringFrame } from "../views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import "../../view/variants/slide-module-cover.css";
import { useModuleCoverTitleFit } from "../../view/use-module-cover-title-fit";
import "./slide-module-cover.css";

export function SlideModuleCoverSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  const surfaceRef = useModuleCoverTitleFit();

  return (
    <SurfaceAuthoringFrame
      {...props}
      className="sc-slide-module-cover-surface-view sc-slide-module-cover-surface-authoring-view"
      surfaceRef={surfaceRef}
    />
  );
}
