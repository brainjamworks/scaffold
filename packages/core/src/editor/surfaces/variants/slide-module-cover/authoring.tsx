import "./styles.css";
import { SurfaceAuthoringFrame } from "../../authoring/views/SurfaceAuthoringFrame";
import type { SurfaceAuthoringViewProps } from "../../shared/surface-view-props";
import { useModuleCoverTitleFit } from "./use-module-cover-title-fit";

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
