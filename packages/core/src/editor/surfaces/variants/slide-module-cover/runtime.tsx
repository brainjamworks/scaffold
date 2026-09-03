import "./styles.css";
import { useModuleCoverTitleFit } from "./use-module-cover-title-fit";
import { SurfaceRuntimeFrame } from "../../runtime/views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../../shared/surface-view-props";

export function SlideModuleCoverSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const surfaceRef = useModuleCoverTitleFit();

  return (
    <SurfaceRuntimeFrame
      {...props}
      className="sc-slide-module-cover-surface-view sc-slide-module-cover-surface-runtime-view"
      surfaceRef={surfaceRef}
    />
  );
}
