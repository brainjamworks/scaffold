import "../../view/variants/slide-module-cover.css";
import { useModuleCoverTitleFit } from "../../view/use-module-cover-title-fit";
import { SurfaceRuntimeFrame } from "../views/SurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../surface-runtime-view-registry";

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
